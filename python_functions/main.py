"""
Daily ESPN projected points sync → Firestore `players` collection.
Runs at 3:00 AM Eastern via Cloud Scheduler (2nd gen).
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
BATCH_SIZE = 400


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


@scheduler_fn.on_schedule(
    schedule="0 3 * * *",
    timezone=scheduler_fn.Timezone("America/New_York"),
    memory=options.MemoryOption.GB_1,
    timeout_sec=540,
)
def sync_espn_projections(event: scheduler_fn.ScheduledEvent) -> None:
    db = firestore.client()

    # 1) Sleeper master player list
    print("Fetching Sleeper NFL players...")
    sleeper_resp = requests.get(SLEEPER_PLAYERS_URL, timeout=120)
    sleeper_resp.raise_for_status()
    sleeper_players = sleeper_resp.json()
    print(f"Loaded {len(sleeper_players)} Sleeper players")

    # espn_id (string) → Sleeper player record
    sleeper_by_espn_id = {}
    for sleeper_id, player in sleeper_players.items():
        espn_id = player.get("espn_id")
        if espn_id is None or espn_id == "":
            continue
        sleeper_by_espn_id[str(espn_id)] = {**player, "player_id": sleeper_id}

    print(f"Built ESPN cross-ref map with {len(sleeper_by_espn_id)} entries")

    # 2) ESPN projected points
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
    espn_payload = espn_resp.json()
    espn_players = espn_payload.get("players") or []
    print(f"Loaded {len(espn_players)} ESPN player rows")

    # 3) Match ESPN → Sleeper, collect rows with projections
    matched = []
    skipped = 0

    for entry in espn_players:
        espn_id = entry.get("id")
        if espn_id is None:
            player_obj = entry.get("player") or {}
            espn_id = player_obj.get("id")
        if espn_id is None:
            skipped += 1
            continue

        projected_points = extract_projected_points(entry)
        if projected_points is None:
            skipped += 1
            continue

        sleeper = sleeper_by_espn_id.get(str(espn_id))
        if not sleeper:
            skipped += 1
            continue

        sleeper_id = str(sleeper.get("player_id"))
        first_name = (sleeper.get("first_name") or "").strip()
        last_name = (sleeper.get("last_name") or "").strip()
        name = f"{first_name} {last_name}".strip() or sleeper.get("full_name") or "Unknown"
        team = sleeper.get("team") or "FA"
        position = sleeper.get("position") or ""

        matched.append(
            {
                "sleeper_id": sleeper_id,
                "name": name,
                "first_name": first_name,
                "last_name": last_name,
                "team": team,
                "position": position,
                "espn_id": str(espn_id),
                "projectedPoints": float(projected_points),
            }
        )

    # 4) Rank by ESPN projected points (1 = highest)
    matched.sort(key=lambda row: row["projectedPoints"], reverse=True)

    now = datetime.now(timezone.utc).isoformat()
    batch = db.batch()
    pending = 0
    updated = 0

    for index, row in enumerate(matched):
        rank = index + 1
        doc_ref = db.collection("players").document(row["sleeper_id"])
        batch.set(
            doc_ref,
            {
                "id": row["sleeper_id"],
                "name": row["name"],
                "first_name": row["first_name"],
                "last_name": row["last_name"],
                "team": row["team"],
                "nflTeam": row["team"],
                "position": row["position"],
                "espn_id": row["espn_id"],
                "projectedPoints": row["projectedPoints"],
                "rank": rank,
                "updatedAt": now,
            },
            merge=True,
        )
        pending += 1
        updated += 1

        if pending >= BATCH_SIZE:
            batch.commit()
            print(f"Committed batch ({updated} players written so far)")
            batch = db.batch()
            pending = 0

    if pending:
        batch.commit()

    print(
        f"Done. updated={updated} skipped={skipped} "
        f"job={event.job_name} schedule_time={event.schedule_time}"
    )
