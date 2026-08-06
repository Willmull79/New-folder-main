"""
Daily NFL rankings sync → single Firestore rankings doc.
Runs at 3:00 AM Eastern via Cloud Scheduler (2nd gen).

Builds the FULL fantasy-eligible Sleeper player pool (~1900), merges ESPN
projected points where available, and writes everything to rankings/master_list
as one array (1 client read instead of thousands).
"""

import json
from datetime import datetime, timezone

import firebase_admin
import requests
from firebase_admin import firestore
from firebase_functions import options, scheduler_fn

firebase_admin.initialize_app()

SLEEPER_PLAYERS_URL = "https://api.sleeper.app/v1/players/nfl"
ESPN_URL = (
    "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/"
    "seasons/2026/segments/0/leaguedefaults/1?view=kona_player_info"
)
ESPN_FILTER = {
    "players": {
        "limit": 2000,
        "sortAppliedStatTotal": {
            "sortAsc": False,
            "sortPriority": 1,
            "value": "102026",
        },
        "filterStatsForSourceIds": {"value": [1]},
        "filterStatsForExternalIds": {"value": [2026]},
        "filterSlotIds": {
            "value": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]
        },
    }
}

OFFENSIVE_POSITIONS = {"QB", "RB", "WR", "TE", "FB", "K"}
DEFENSIVE_POSITIONS = {"DEF", "DL", "DE", "DT", "NT", "LB", "ILB", "OLB", "DB", "CB"}
EXCLUDED_POSITIONS = {"FS", "SS"}
ELIGIBLE_POSITIONS = OFFENSIVE_POSITIONS | DEFENSIVE_POSITIONS

RANKINGS_DOC_PATH = ("rankings", "master_list")


def extract_projected_points(entry):
    player_obj = entry.get("player") or {}
    season_proj = None
    any_proj = None

    for stat in player_obj.get("stats") or []:
        if stat.get("statSourceId") != 1:
            continue
        total = stat.get("appliedTotal")
        if total is None:
            continue
        any_proj = float(total)
        if stat.get("scoringPeriodId", 0) == 0:
            season_proj = float(total)

    if season_proj is not None:
        return season_proj
    if any_proj is not None:
        return any_proj

    applied = entry.get("appliedStatTotal")
    if applied is not None:
        return float(applied)
    return None


def is_fantasy_eligible(player):
    position = player.get("position")
    if not position or position in EXCLUDED_POSITIONS:
        return False
    if position not in ELIGIBLE_POSITIONS:
        return False
    if player.get("status") != "Active":
        return False
    if player.get("depth_chart_order") is None:
        return False
    team = str(player.get("team") or "").strip().upper()
    if not team or team in {"FA", "FREE AGENT"}:
        return False
    return True


def sleeper_to_row(player, sleeper_id):
    first_name = (player.get("first_name") or "").strip()
    last_name = (player.get("last_name") or "").strip()
    name = f"{first_name} {last_name}".strip() or player.get("full_name") or "Unknown"
    team = player.get("team") or "FA"
    search_rank = player.get("search_rank")
    try:
        search_rank = int(search_rank) if search_rank is not None else 9999
    except (TypeError, ValueError):
        search_rank = 9999

    espn_id = player.get("espn_id")
    return {
        "id": str(sleeper_id),
        "name": name,
        "first_name": first_name,
        "last_name": last_name,
        "team": team,
        "nflTeam": team,
        "position": player.get("position") or "",
        "espn_id": str(espn_id) if espn_id is not None and espn_id != "" else None,
        "projectedPoints": None,
        "rank": search_rank if search_rank > 0 else 9999,
        "salary": 1,
        "status": player.get("status") or "Active",
        "depth_chart_order": player.get("depth_chart_order"),
        "age": player.get("age"),
        "years_exp": player.get("years_exp"),
        "rookie_year": player.get("rookie_year"),
    }


@scheduler_fn.on_schedule(
    schedule="0 3 * * *",
    timezone=scheduler_fn.Timezone("America/New_York"),
    memory=options.MemoryOption.GB_1,
    timeout_sec=540,
)
def sync_espn_projections(event: scheduler_fn.ScheduledEvent) -> None:
    db = firestore.client()

    # 1) Full Sleeper NFL player map
    print("Fetching Sleeper NFL players...")
    sleeper_resp = requests.get(SLEEPER_PLAYERS_URL, timeout=120)
    sleeper_resp.raise_for_status()
    sleeper_players = sleeper_resp.json()
    print(f"Loaded {len(sleeper_players)} Sleeper players")

    # 2) Build full fantasy-eligible pool (~1900), keyed by sleeper id
    pool_by_id = {}
    for sleeper_id, player in sleeper_players.items():
        if not is_fantasy_eligible(player):
            continue
        row = sleeper_to_row(player, sleeper_id)
        pool_by_id[row["id"]] = row

    print(f"Fantasy-eligible Sleeper pool: {len(pool_by_id)}")

    # espn_id → sleeper id for projection merge
    sleeper_id_by_espn_id = {}
    for sleeper_id, row in pool_by_id.items():
        if row.get("espn_id"):
            sleeper_id_by_espn_id[str(row["espn_id"])] = sleeper_id

    # 3) ESPN projected points (enrich only — do not shrink the pool)
    print("Fetching ESPN projected points...")
    espn_resp = requests.get(
        ESPN_URL,
        headers={
            "x-fantasy-filter": json.dumps(ESPN_FILTER),
            "Accept": "application/json",
        },
        timeout=120,
    )
    espn_resp.raise_for_status()
    espn_players = (espn_resp.json() or {}).get("players") or []
    print(f"Loaded {len(espn_players)} ESPN player rows")

    espn_enriched = 0
    espn_skipped = 0
    for entry in espn_players:
        espn_id = entry.get("id")
        if espn_id is None:
            espn_id = (entry.get("player") or {}).get("id")
        if espn_id is None:
            espn_skipped += 1
            continue

        projected_points = extract_projected_points(entry)
        if projected_points is None:
            espn_skipped += 1
            continue

        sleeper_id = sleeper_id_by_espn_id.get(str(espn_id))
        if not sleeper_id:
            espn_skipped += 1
            continue

        pool_by_id[sleeper_id]["projectedPoints"] = float(projected_points)
        espn_enriched += 1

    # 4) Sort: ESPN proj first (desc), then Sleeper search_rank, then name
    ranked = list(pool_by_id.values())
    ranked.sort(
        key=lambda row: (
            0 if row.get("projectedPoints") is not None else 1,
            -(row["projectedPoints"] or 0),
            row.get("rank") or 9999,
            row.get("name") or "",
        )
    )
    for index, row in enumerate(ranked):
        # Keep ESPN-driven display rank for projected players; others keep relative order
        row["rank"] = index + 1

    now = datetime.now(timezone.utc).isoformat()
    rankings_ref = db.collection(RANKINGS_DOC_PATH[0]).document(RANKINGS_DOC_PATH[1])
    rankings_ref.set(
        {
            "players": ranked,
            "count": len(ranked),
            "espnEnriched": espn_enriched,
            "season": 2026,
            "source": "sleeper+espn",
            "updatedAt": now,
        },
        merge=False,
    )

    print(
        f"Done. wrote rankings/master_list count={len(ranked)} "
        f"espn_enriched={espn_enriched} espn_skipped={espn_skipped} "
        f"job={event.job_name} schedule_time={event.schedule_time}"
    )
