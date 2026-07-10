#!/usr/bin/env python3
"""Sync Sleeper NFL players and current-week stats/projections to Firestore."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import firebase_admin
import requests
from firebase_admin import credentials, firestore

SLEEPER_NFL_PLAYERS_URL = "https://api.sleeper.app/v1/players/nfl"
SLEEPER_NFL_STATE_URL = "https://api.sleeper.app/v1/state/nfl"
SLEEPER_STATS_URL = "https://api.sleeper.app/v1/stats/nfl/{season_type}/{season}/{week}"
SLEEPER_PROJECTIONS_URL = "https://api.sleeper.app/v1/projections/nfl/{season_type}/{season}/{week}"

PLAYERS_COLLECTION = "players"
WEEKLY_STATS_SUBCOLLECTION = "weekly_stats"
EXCLUDED_POSITIONS = {"FS", "SS"}
FIRESTORE_BATCH_LIMIT = 500
DEFAULT_CREDENTIALS_PATH = Path(__file__).resolve().parent / "serviceAccountKey.json"

STAT_RECORD_METADATA_KEYS = {
    "player_id",
    "game_id",
    "team",
    "opponent",
    "week",
    "season",
    "season_type",
    "category",
    "company",
    "date",
    "player",
    "sport",
    "updated_at",
    "last_modified",
}


def fetch_sleeper_players() -> dict:
    response = requests.get(SLEEPER_NFL_PLAYERS_URL, timeout=120)
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        raise ValueError("Sleeper players API returned an unexpected payload (expected JSON object).")
    return payload


def fetch_nfl_state() -> dict:
    response = requests.get(SLEEPER_NFL_STATE_URL, timeout=60)
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        raise ValueError("Sleeper NFL state API returned an unexpected payload (expected JSON object).")
    return payload


def resolve_week_context(
    season_type: str | None = None,
    season: str | int | None = None,
    week: int | None = None,
) -> dict[str, Any]:
    state = fetch_nfl_state()

    resolved_season_type = season_type or state.get("season_type") or "regular"
    resolved_season = str(season or state.get("season") or datetime.now(timezone.utc).year)
    resolved_week = int(week if week is not None else state.get("week") or 1)

    return {
        "season_type": resolved_season_type,
        "season": resolved_season,
        "week": resolved_week,
    }


def fetch_weekly_stats(season_type: str, season: str, week: int) -> Any:
    url = SLEEPER_STATS_URL.format(season_type=season_type, season=season, week=week)
    response = requests.get(url, timeout=120)
    response.raise_for_status()
    return response.json()


def fetch_weekly_projections(season_type: str, season: str, week: int) -> Any:
    url = SLEEPER_PROJECTIONS_URL.format(season_type=season_type, season=season, week=week)
    response = requests.get(url, timeout=120)
    response.raise_for_status()
    return response.json()


def index_records_by_player_id(payload: Any) -> dict[str, dict]:
    if isinstance(payload, list):
        indexed: dict[str, dict] = {}
        for record in payload:
            if not isinstance(record, dict):
                continue
            player_id = record.get("player_id")
            if player_id is None:
                continue
            indexed[str(player_id)] = record
        return indexed

    if isinstance(payload, dict):
        if not payload:
            return {}

        first_value = next(iter(payload.values()))
        if isinstance(first_value, dict) and "player_id" in first_value:
            return {
                str(record["player_id"]): record
                for record in payload.values()
                if isinstance(record, dict) and record.get("player_id") is not None
            }

        return {str(player_id): record for player_id, record in payload.items() if isinstance(record, dict)}

    raise ValueError("Sleeper stats/projections payload must be a list or object.")


def extract_stat_object(record: dict | None) -> dict:
    if not record:
        return {}

    nested_stats = record.get("stats")
    if isinstance(nested_stats, dict):
        return nested_stats

    return {
        key: value
        for key, value in record.items()
        if key not in STAT_RECORD_METADATA_KEYS
    }


def merge_weekly_stats_and_projections(
    stats_payload: Any,
    projections_payload: Any,
    week_context: dict[str, Any],
) -> dict[str, dict]:
    stats_by_player = index_records_by_player_id(stats_payload)
    projections_by_player = index_records_by_player_id(projections_payload)
    player_ids = set(stats_by_player) | set(projections_by_player)

    merged: dict[str, dict] = {}
    for player_id in player_ids:
        stats_record = stats_by_player.get(player_id)
        projection_record = projections_by_player.get(player_id)

        merged[player_id] = {
            "season": week_context["season"],
            "season_type": week_context["season_type"],
            "week": week_context["week"],
            "player_id": player_id,
            "team": (stats_record or projection_record or {}).get("team"),
            "opponent": (stats_record or projection_record or {}).get("opponent"),
            "stats": extract_stat_object(stats_record),
            "projected": extract_stat_object(projection_record),
            "synced_at": datetime.now(timezone.utc).isoformat(),
        }

    return merged


def weekly_stats_document_id(week_context: dict[str, Any]) -> str:
    return f"{week_context['season']}_{week_context['season_type']}_week_{week_context['week']}"


def filter_players(players_by_id: dict) -> list[tuple[str, dict]]:
    filtered: list[tuple[str, dict]] = []

    for player_id, player in players_by_id.items():
        if not isinstance(player, dict):
            continue

        position = player.get("position")
        if position in EXCLUDED_POSITIONS:
            continue

        if player.get("depth_chart_order") is None:
            continue

        if player.get("status") != "Active":
            continue

        filtered.append((str(player_id), player))

    return filtered


def sort_players(players: list[tuple[str, dict]]) -> list[tuple[str, dict]]:
    return sorted(
        players,
        key=lambda item: (
            item[1].get("team") or "",
            item[1].get("depth_chart_order", 0),
        ),
    )


def parse_player_document(player: dict) -> dict:
    return {
        "first_name": player.get("first_name"),
        "last_name": player.get("last_name"),
        "team": player.get("team"),
        "position": player.get("position"),
        "age": player.get("age"),
        "years_exp": player.get("years_exp"),
        "rookie_year": player.get("rookie_year"),
        "depth_chart_order": player.get("depth_chart_order"),
        "status": player.get("status"),
    }


def commit_batch(
    db: firestore.Client,
    batch: firestore.WriteBatch,
    batch_count: int,
    total_written: int,
) -> tuple[firestore.WriteBatch, int, int]:
    if batch_count == 0:
        return batch, batch_count, total_written

    batch.commit()
    total_written += batch_count
    return db.batch(), 0, total_written


def batch_write_players(db: firestore.Client, players: list[tuple[str, dict]]) -> int:
    batch = db.batch()
    batch_count = 0
    total_written = 0

    for player_id, player in players:
        doc_ref = db.collection(PLAYERS_COLLECTION).document(player_id)
        batch.set(doc_ref, parse_player_document(player), merge=True)
        batch_count += 1

        if batch_count >= FIRESTORE_BATCH_LIMIT:
            batch, batch_count, total_written = commit_batch(db, batch, batch_count, total_written)

    batch, batch_count, total_written = commit_batch(db, batch, batch_count, total_written)
    return total_written


def batch_write_weekly_stats(
    db: firestore.Client,
    merged_weekly_stats: dict[str, dict],
    week_context: dict[str, Any],
    player_ids: set[str] | None = None,
) -> int:
    batch = db.batch()
    batch_count = 0
    total_written = 0
    week_doc_id = weekly_stats_document_id(week_context)

    for player_id, weekly_doc in merged_weekly_stats.items():
        if player_ids is not None and player_id not in player_ids:
            continue

        if not weekly_doc.get("stats") and not weekly_doc.get("projected"):
            continue

        doc_ref = (
            db.collection(PLAYERS_COLLECTION)
            .document(player_id)
            .collection(WEEKLY_STATS_SUBCOLLECTION)
            .document(week_doc_id)
        )
        batch.set(doc_ref, weekly_doc, merge=True)
        batch_count += 1

        if batch_count >= FIRESTORE_BATCH_LIMIT:
            batch, batch_count, total_written = commit_batch(db, batch, batch_count, total_written)

    batch, batch_count, total_written = commit_batch(db, batch, batch_count, total_written)
    return total_written


def init_firestore(credentials_path: str | None) -> firestore.Client:
    if firebase_admin._apps:
        return firestore.client()

    if credentials_path:
        cred = credentials.Certificate(credentials_path)
    elif DEFAULT_CREDENTIALS_PATH.exists():
        cred = credentials.Certificate(str(DEFAULT_CREDENTIALS_PATH))
    else:
        cred = credentials.ApplicationDefault()

    firebase_admin.initialize_app(cred)
    return firestore.client()


def sync_sleeper_players_to_firestore(
    credentials_path: str | None = None,
    *,
    sync_players: bool = True,
    sync_weekly_stats: bool = True,
    season_type: str | None = None,
    season: str | int | None = None,
    week: int | None = None,
    weekly_stats_for_all_players: bool = False,
) -> dict:
    db = init_firestore(credentials_path)
    result: dict[str, Any] = {}

    players_by_id = fetch_sleeper_players()
    filtered_players = filter_players(players_by_id)
    sorted_players = sort_players(filtered_players)
    filtered_player_ids = {player_id for player_id, _ in sorted_players}

    if sync_players:
        result["players"] = {
            "total_fetched": len(players_by_id),
            "total_filtered": len(sorted_players),
            "total_written": batch_write_players(db, sorted_players),
        }

    if sync_weekly_stats:
        week_context = resolve_week_context(season_type=season_type, season=season, week=week)
        stats_payload = fetch_weekly_stats(
            week_context["season_type"],
            week_context["season"],
            week_context["week"],
        )
        projections_payload = fetch_weekly_projections(
            week_context["season_type"],
            week_context["season"],
            week_context["week"],
        )
        merged_weekly_stats = merge_weekly_stats_and_projections(
            stats_payload,
            projections_payload,
            week_context,
        )
        weekly_player_scope = None if weekly_stats_for_all_players else filtered_player_ids
        result["weekly_stats"] = {
            **week_context,
            "document_id": weekly_stats_document_id(week_context),
            "total_stats_records": len(index_records_by_player_id(stats_payload)),
            "total_projection_records": len(index_records_by_player_id(projections_payload)),
            "total_merged": len(merged_weekly_stats),
            "total_written": batch_write_weekly_stats(
                db,
                merged_weekly_stats,
                week_context,
                player_ids=weekly_player_scope,
            ),
        }

    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Sync Sleeper players and current-week stats/projections to Firestore."
    )
    parser.add_argument(
        "--credentials",
        help="Path to Firebase service account JSON (defaults to ./serviceAccountKey.json).",
    )
    parser.add_argument(
        "--skip-players",
        action="store_true",
        help="Skip syncing player profile documents.",
    )
    parser.add_argument(
        "--skip-weekly-stats",
        action="store_true",
        help="Skip syncing weekly stats and projections.",
    )
    parser.add_argument(
        "--season-type",
        choices=["pre", "regular", "post", "off"],
        help="Override Sleeper season type (defaults to current NFL state).",
    )
    parser.add_argument(
        "--season",
        help="Override season year (defaults to current NFL state).",
    )
    parser.add_argument(
        "--week",
        type=int,
        help="Override week number (defaults to current NFL state).",
    )
    parser.add_argument(
        "--weekly-stats-for-all-players",
        action="store_true",
        help="Write weekly stats for every merged player, not just filtered depth-chart players.",
    )
    parser.add_argument(
        "--json-output",
        action="store_true",
        help="Print machine-readable JSON result to stdout.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    try:
        result = sync_sleeper_players_to_firestore(
            args.credentials,
            sync_players=not args.skip_players,
            sync_weekly_stats=not args.skip_weekly_stats,
            season_type=args.season_type,
            season=args.season,
            week=args.week,
            weekly_stats_for_all_players=args.weekly_stats_for_all_players,
        )
    except Exception as error:  # noqa: BLE001 - CLI entrypoint
        print(f"Sync failed: {error}", file=sys.stderr)
        return 1

    if args.json_output:
        print(json.dumps({"success": True, "result": result}))
        return 0

    if "players" in result:
        players = result["players"]
        print(
            "Player sync complete: "
            f"fetched={players['total_fetched']}, "
            f"filtered={players['total_filtered']}, "
            f"written={players['total_written']}"
        )

    if "weekly_stats" in result:
        weekly = result["weekly_stats"]
        print(
            "Weekly stats sync complete: "
            f"season={weekly['season']}, "
            f"season_type={weekly['season_type']}, "
            f"week={weekly['week']}, "
            f"doc_id={weekly['document_id']}, "
            f"stats_records={weekly['total_stats_records']}, "
            f"projection_records={weekly['total_projection_records']}, "
            f"merged={weekly['total_merged']}, "
            f"written={weekly['total_written']}"
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
