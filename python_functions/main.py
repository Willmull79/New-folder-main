"""
Daily NFL rankings sync → single Firestore rankings doc.
Runs at 3:00 AM Eastern via Cloud Scheduler (2nd gen).

Builds the FULL fantasy-eligible Sleeper player pool (~1900), merges ESPN
projected points where available, and writes everything to rankings/master_list
as one array (1 client read instead of thousands).

Also syncs the NFL team schedule → schedules/nfl_2026 (team abbr → weekly matchups).
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
# Full regular-season slate by week (seasontype=2). One request per week.
ESPN_SCHEDULE_URL = (
    "https://cdn.espn.com/core/nfl/schedule"
    "?xhr=1&year={year}&seasontype=2&week={week}"
)
NFL_SCHEDULE_SEASON = 2026
NFL_SCHEDULE_WEEKS = range(1, 19)  # 18-week season; each team plays 17 games + 1 bye
SCHEDULE_DOC_PATH = ("schedules", f"nfl_{NFL_SCHEDULE_SEASON}")

# ESPN scoreboard abbreviations → Sleeper-standard abbreviations.
# Most match 1:1; document mismatches explicitly.
ESPN_TO_SLEEPER_ABBR = {
    "WSH": "WAS",  # Washington Commanders (ESPN) → WAS (Sleeper)
    "WAS": "WAS",
    "LAR": "LAR",  # Los Angeles Rams (both); some feeds use LA
    "LA": "LAR",
    "LAC": "LAC",
    "JAX": "JAX",  # Jacksonville (both); some feeds use JAC
    "JAC": "JAX",
    "LV": "LV",  # Las Vegas Raiders (current); Sleeper may still show OAK on old rows
    "OAK": "LV",
    "ARI": "ARI",
    "ATL": "ATL",
    "BAL": "BAL",
    "BUF": "BUF",
    "CAR": "CAR",
    "CHI": "CHI",
    "CIN": "CIN",
    "CLE": "CLE",
    "DAL": "DAL",
    "DEN": "DEN",
    "DET": "DET",
    "GB": "GB",
    "HOU": "HOU",
    "IND": "IND",
    "KC": "KC",
    "MIA": "MIA",
    "MIN": "MIN",
    "NE": "NE",
    "NO": "NO",
    "NYG": "NYG",
    "NYJ": "NYJ",
    "PHI": "PHI",
    "PIT": "PIT",
    "SEA": "SEA",
    "SF": "SF",
    "TB": "TB",
    "TEN": "TEN",
}

SLEEPER_TEAM_ABBREVIATIONS = (
    "ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE",
    "DAL", "DEN", "DET", "GB", "HOU", "IND", "JAX", "KC",
    "LAC", "LAR", "LV", "MIA", "MIN", "NE", "NO", "NYG",
    "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WAS",
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


def map_espn_abbr(espn_abbr):
    """Normalize an ESPN team abbreviation to Sleeper's standard."""
    if not espn_abbr:
        return None
    key = str(espn_abbr).strip().upper()
    return ESPN_TO_SLEEPER_ABBR.get(key, key)


def fetch_espn_week_games(year, week):
    """Fetch one regular-season week from ESPN CDN schedule API."""
    url = ESPN_SCHEDULE_URL.format(year=year, week=week)
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    content = (resp.json() or {}).get("content") or {}
    schedule_by_day = content.get("schedule") or {}
    games = []
    for day_payload in schedule_by_day.values():
        if not isinstance(day_payload, dict):
            continue
        for game in day_payload.get("games") or []:
            games.append(game)
    return games


def parse_game_competitors(game):
    """
    Return (home_abbr, away_abbr, week_number, date_iso) using Sleeper abbrs.
    Skips games that lack two NFL competitors.
    """
    competitions = game.get("competitions") or []
    if not competitions:
        return None
    competition = competitions[0] or {}
    competitors = competition.get("competitors") or []
    home_abbr = None
    away_abbr = None
    for competitor in competitors:
        team = competitor.get("team") or {}
        abbr = map_espn_abbr(team.get("abbreviation"))
        home_away = (competitor.get("homeAway") or "").lower()
        if home_away == "home":
            home_abbr = abbr
        elif home_away == "away":
            away_abbr = abbr
    if not home_abbr or not away_abbr:
        return None

    week_obj = game.get("week") or {}
    week_number = week_obj.get("number")
    try:
        week_number = int(week_number)
    except (TypeError, ValueError):
        return None

    date_iso = game.get("date") or competition.get("date")
    return home_abbr, away_abbr, week_number, date_iso


def build_team_schedules(year=NFL_SCHEDULE_SEASON):
    """
    Build {SleeperAbbr: [{week, opponent, homeAway, date?}, ...]} for all 32 teams.
    Each team gets 17 regular-season games (bye omitted from the matchup array).
    """
    teams = {abbr: [] for abbr in SLEEPER_TEAM_ABBREVIATIONS}
    games_seen = set()
    total_games = 0

    for week in NFL_SCHEDULE_WEEKS:
        print(f"Fetching ESPN NFL schedule year={year} week={week}...")
        week_games = fetch_espn_week_games(year, week)
        for game in week_games:
            parsed = parse_game_competitors(game)
            if not parsed:
                continue
            home_abbr, away_abbr, week_number, date_iso = parsed
            game_id = game.get("id") or f"{week_number}:{away_abbr}@{home_abbr}"
            if game_id in games_seen:
                continue
            games_seen.add(game_id)
            total_games += 1

            if home_abbr in teams:
                entry = {
                    "week": week_number,
                    "opponent": away_abbr,
                    "homeAway": "home",
                }
                if date_iso:
                    entry["date"] = date_iso
                teams[home_abbr].append(entry)

            if away_abbr in teams:
                entry = {
                    "week": week_number,
                    "opponent": home_abbr,
                    "homeAway": "away",
                }
                if date_iso:
                    entry["date"] = date_iso
                teams[away_abbr].append(entry)

    bye_weeks = {}
    for abbr, matchups in teams.items():
        matchups.sort(key=lambda m: (m.get("week") or 0, m.get("date") or ""))
        played_weeks = {m["week"] for m in matchups if m.get("week") is not None}
        bye = sorted(set(NFL_SCHEDULE_WEEKS) - played_weeks)
        if len(bye) == 1:
            bye_weeks[abbr] = bye[0]
        elif bye:
            bye_weeks[abbr] = bye  # unexpected multi-bye — keep list for debugging

    return teams, bye_weeks, total_games


@scheduler_fn.on_schedule(
    schedule="0 4 * * 1",
    timezone=scheduler_fn.Timezone("America/New_York"),
    memory=options.MemoryOption.MB_512,
    timeout_sec=300,
)
def sync_nfl_schedule(event: scheduler_fn.ScheduledEvent) -> None:
    """
    Weekly sync of the full NFL regular-season schedule into schedules/nfl_2026.

    Document shape:
      {
        season: 2026,
        source: "espn",
        updatedAt: ISO-8601,
        gameCount: int,
        byeWeeks: { "KC": 6, ... },
        teams: {
          "KC": [{ week, opponent, homeAway, date? }, ...],  # 17 games
          ...
        }
      }
    """
    db = firestore.client()
    print(f"Building NFL {NFL_SCHEDULE_SEASON} schedule from ESPN...")
    teams, bye_weeks, game_count = build_team_schedules(NFL_SCHEDULE_SEASON)

    missing = [abbr for abbr, games in teams.items() if len(games) == 0]
    short = {abbr: len(games) for abbr, games in teams.items() if 0 < len(games) < 17}
    if missing:
        print(f"WARNING: teams with no games: {missing}")
    if short:
        print(f"WARNING: teams with fewer than 17 games: {short}")

    now = datetime.now(timezone.utc).isoformat()
    schedule_ref = db.collection(SCHEDULE_DOC_PATH[0]).document(SCHEDULE_DOC_PATH[1])
    schedule_ref.set(
        {
            "season": NFL_SCHEDULE_SEASON,
            "source": "espn",
            "updatedAt": now,
            "gameCount": game_count,
            "teamCount": len(teams),
            "byeWeeks": bye_weeks,
            "teams": teams,
            "abbrMappingNotes": (
                "ESPN→Sleeper: WSH→WAS, LA→LAR, JAC→JAX, OAK→LV; others 1:1"
            ),
        },
        merge=False,
    )

    sample_counts = {abbr: len(games) for abbr, games in list(teams.items())[:5]}
    print(
        f"Done. wrote schedules/nfl_{NFL_SCHEDULE_SEASON} "
        f"games={game_count} teams={len(teams)} sample_counts={sample_counts} "
        f"job={event.job_name} schedule_time={event.schedule_time}"
    )
