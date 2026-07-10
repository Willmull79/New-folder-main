#!/usr/bin/env python3
"""Scrape FantasyPros consensus NFL projections and merge into Firestore players."""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import firebase_admin
import pandas as pd
import requests
from bs4 import BeautifulSoup
from firebase_admin import credentials, firestore

PLAYERS_COLLECTION = "players"
FIRESTORE_BATCH_LIMIT = 500
DEFAULT_CREDENTIALS_PATH = Path(__file__).resolve().parent / "serviceAccountKey.json"
SLEEPER_NFL_STATE_URL = "https://api.sleeper.app/v1/state/nfl"

FANTASYPROS_BASE_URL = "https://www.fantasypros.com/nfl/projections"
SCRAPE_POSITIONS = ["qb", "rb", "wr", "te", "k"]
REQUEST_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; DynastyCentralBot/1.0; +https://dynasty-420.web.app)",
    "Accept": "text/html,application/xhtml+xml",
}

NAME_SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "v"}


def fetch_nfl_week_context() -> dict[str, Any]:
    response = requests.get(SLEEPER_NFL_STATE_URL, timeout=60)
    response.raise_for_status()
    state = response.json()
    return {
        "season": str(state.get("season") or datetime.now(timezone.utc).year),
        "week": int(state.get("week") or 1),
        "season_type": state.get("season_type") or "regular",
    }


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


def normalize_name(value: str) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()

    parts = text.split()
    while parts and parts[-1] in NAME_SUFFIXES:
        parts.pop()
    return " ".join(parts)


def parse_player_cell(cell: Any) -> tuple[str, str | None]:
    text = str(cell).strip()
    if not text:
        return "", None

    match = re.match(r"^(?P<name>.+?)\s+(?P<team>[A-Z]{2,3})$", text)
    if match:
        return match.group("name").strip(), match.group("team")

    return text, None


def flatten_columns(columns: Any) -> list[str]:
    flattened: list[str] = []
    for column in columns:
        if isinstance(column, tuple):
            parts = [str(part).strip() for part in column if str(part).strip().lower() != "nan"]
            flattened.append("_".join(parts).lower())
        else:
            flattened.append(str(column).strip().lower())
    return flattened


def normalize_stat_key(key: str) -> str:
    key = key.lower().strip()
    key = re.sub(r"[^a-z0-9]+", "_", key)
    key = re.sub(r"_+", "_", key).strip("_")
    return key


def coerce_number(value: Any) -> float | int | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, (int, float)):
        return value

    text = str(value).strip().replace(",", "")
    if not text or text.lower() in {"-", "na", "n/a"}:
        return None

    try:
        number = float(text)
        if number.is_integer():
            return int(number)
        return number
    except ValueError:
        return None


def parse_projection_table(df: pd.DataFrame, position: str, week: int) -> list[dict[str, Any]]:
    if isinstance(df.columns, pd.MultiIndex):
        df = df.copy()
        df.columns = flatten_columns(df.columns)
    else:
        df.columns = [normalize_stat_key(str(col)) for col in df.columns]

    player_column = next((col for col in df.columns if "player" in col), df.columns[0])
    fpts_column = next((col for col in df.columns if col in {"fpts", "fantasy_pts", "points"}), None)

    projections: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        player_name, scraped_team = parse_player_cell(row.get(player_column))
        if not player_name:
            continue

        stats: dict[str, Any] = {}
        for column in df.columns:
            if column == player_column:
                continue
            value = coerce_number(row.get(column))
            if value is None:
                continue
            stats[normalize_stat_key(column)] = value

        projected_points = None
        if fpts_column:
            projected_points = coerce_number(row.get(fpts_column))
        if projected_points is None:
            projected_points = stats.pop("fpts", None)

        projections.append(
            {
                "player_name": player_name,
                "normalized_name": normalize_name(player_name),
                "team": scraped_team,
                "position": position.upper(),
                "week": week,
                "projected_points": projected_points,
                "stats": stats,
            }
        )

    return projections


def scrape_position_projections(position: str, week: int) -> list[dict[str, Any]]:
    url = f"{FANTASYPROS_BASE_URL}/{position}.php"
    response = requests.get(
        url,
        params={"week": week},
        headers=REQUEST_HEADERS,
        timeout=45,
    )
    response.raise_for_status()

    try:
        tables = pd.read_html(response.text, attrs={"id": "data"})
        if not tables:
            tables = pd.read_html(response.text)
        if not tables:
            raise ValueError(f"No projection tables found for position={position}, week={week}")
        return parse_projection_table(tables[0], position, week)
    except Exception as pandas_error:
        soup = BeautifulSoup(response.text, "lxml")
        table = soup.find("table", {"id": "data"}) or soup.find("table")
        if table is None:
            raise ValueError(
                f"Unable to parse FantasyPros HTML for {position} week {week}: {pandas_error}"
            ) from pandas_error

        fallback_df = pd.read_html(str(table))[0]
        return parse_projection_table(fallback_df, position, week)


def load_sleeper_player_index(db: firestore.Client) -> dict[tuple[str, str], list[dict[str, Any]]]:
    index: dict[tuple[str, str], list[dict[str, Any]]] = {}
    docs = db.collection(PLAYERS_COLLECTION).stream()

    for doc in docs:
        data = doc.to_dict() or {}
        first_name = data.get("first_name") or ""
        last_name = data.get("last_name") or ""
        position = (data.get("position") or "").upper()
        if not position:
            continue

        full_name = normalize_name(f"{first_name} {last_name}".strip())
        if not full_name:
            continue

        entry = {
            "player_id": doc.id,
            "team": (data.get("team") or "").upper(),
            "first_name": first_name,
            "last_name": last_name,
        }
        index.setdefault((full_name, position), []).append(entry)

    return index


def match_projection_to_sleeper_id(
    projection: dict[str, Any],
    player_index: dict[tuple[str, str], list[dict[str, Any]]],
) -> str | None:
    key = (projection["normalized_name"], projection["position"])
    candidates = player_index.get(key, [])
    if not candidates:
        return None

    scraped_team = (projection.get("team") or "").upper()
    if scraped_team:
        team_matches = [candidate for candidate in candidates if candidate["team"] == scraped_team]
        if len(team_matches) == 1:
            return team_matches[0]["player_id"]
        if team_matches:
            return team_matches[0]["player_id"]

    if len(candidates) == 1:
        return candidates[0]["player_id"]

    active = [candidate for candidate in candidates if candidate["team"]]
    if len(active) == 1:
        return active[0]["player_id"]

    return None


def build_projection_payload(
    projection: dict[str, Any],
    week_context: dict[str, Any],
    scoring: str,
) -> dict[str, Any]:
    return {
        "consensus_projection": {
            "source": "fantasypros",
            "season": week_context["season"],
            "week": projection["week"],
            "season_type": week_context["season_type"],
            "scoring": scoring,
            "projected_points": projection.get("projected_points"),
            "stats": projection.get("stats") or {},
            "scraped_player_name": projection.get("player_name"),
            "scraped_team": projection.get("team"),
            "synced_at": datetime.now(timezone.utc).isoformat(),
        },
        "projected_points": projection.get("projected_points"),
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


def write_projections_to_firestore(
    db: firestore.Client,
    matched_projections: list[tuple[str, dict[str, Any]]],
) -> int:
    batch = db.batch()
    batch_count = 0
    total_written = 0

    for player_id, payload in matched_projections:
        doc_ref = db.collection(PLAYERS_COLLECTION).document(player_id)
        batch.set(doc_ref, payload, merge=True)
        batch_count += 1

        if batch_count >= FIRESTORE_BATCH_LIMIT:
            batch, batch_count, total_written = commit_batch(db, batch, batch_count, total_written)

    batch, batch_count, total_written = commit_batch(db, batch, batch_count, total_written)
    return total_written


def scrape_and_store_projections(
    *,
    credentials_path: str | None = None,
    week: int | None = None,
    season: str | None = None,
    scoring: str = "STD",
    positions: list[str] | None = None,
    request_delay_seconds: float = 1.0,
) -> dict[str, Any]:
    db = init_firestore(credentials_path)
    week_context = fetch_nfl_week_context()

    if season:
        week_context["season"] = str(season)
    if week is not None:
        week_context["week"] = int(week)

    scrape_positions = positions or SCRAPE_POSITIONS
    player_index = load_sleeper_player_index(db)

    scraped: list[dict[str, Any]] = []
    scrape_errors: list[dict[str, str]] = []

    for position in scrape_positions:
        try:
            position_rows = scrape_position_projections(position, week_context["week"])
            scraped.extend(position_rows)
        except Exception as error:  # noqa: BLE001 - collect per-position failures
            scrape_errors.append(
                {
                    "position": position,
                    "error": str(error),
                }
            )
        finally:
            if request_delay_seconds > 0:
                time.sleep(request_delay_seconds)

    if not scraped and scrape_errors:
        raise RuntimeError(
            "All FantasyPros scrapes failed. The site HTML structure may have changed."
        )

    matched: list[tuple[str, dict[str, Any]]] = []
    unmatched: list[dict[str, Any]] = []

    for projection in scraped:
        player_id = match_projection_to_sleeper_id(projection, player_index)
        if player_id:
            matched.append(
                (
                    player_id,
                    build_projection_payload(projection, week_context, scoring),
                )
            )
        else:
            unmatched.append(
                {
                    "player_name": projection.get("player_name"),
                    "position": projection.get("position"),
                    "team": projection.get("team"),
                }
            )

    total_written = write_projections_to_firestore(db, matched)

    return {
        "success": True,
        "season": week_context["season"],
        "week": week_context["week"],
        "season_type": week_context["season_type"],
        "scoring": scoring,
        "total_scraped": len(scraped),
        "total_matched": len(matched),
        "total_unmatched": len(unmatched),
        "total_written": total_written,
        "scrape_errors": scrape_errors,
        "unmatched_sample": unmatched[:25],
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Scrape FantasyPros consensus projections into Firestore players."
    )
    parser.add_argument("--credentials", help="Path to Firebase service account JSON.")
    parser.add_argument("--week", type=int, help="NFL week override.")
    parser.add_argument("--season", help="NFL season override.")
    parser.add_argument(
        "--scoring",
        default="STD",
        choices=["STD", "PPR", "HALF"],
        help="Scoring format label stored with projections.",
    )
    parser.add_argument(
        "--positions",
        help="Comma-separated positions to scrape (default: qb,rb,wr,te,k).",
    )
    parser.add_argument(
        "--json-output",
        action="store_true",
        help="Print machine-readable JSON result to stdout.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    positions = None
    if args.positions:
        positions = [position.strip().lower() for position in args.positions.split(",") if position.strip()]

    try:
        result = scrape_and_store_projections(
            credentials_path=args.credentials,
            week=args.week,
            season=args.season,
            scoring=args.scoring,
            positions=positions,
        )
    except Exception as error:  # noqa: BLE001 - CLI entrypoint
        payload = {"success": False, "error": str(error)}
        if args.json_output:
            print(json.dumps(payload))
        else:
            print(f"Projection scrape failed: {error}", file=sys.stderr)
        return 1

    if args.json_output:
        print(json.dumps(result))
    else:
        print(
            "Projection scrape complete: "
            f"scraped={result['total_scraped']}, "
            f"matched={result['total_matched']}, "
            f"written={result['total_written']}, "
            f"errors={len(result['scrape_errors'])}"
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
