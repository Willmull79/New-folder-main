# Scripts Index

This folder contains operational scripts grouped by purpose.

## Folder Layout

- `windows/` - Windows launch, setup, and deployment helpers (`.bat` / `.ps1`)
- `tools/` - Standalone utility JavaScript tools used for local workflows
- `init-nfl-data.js` - Firestore seed script for NFL player data
- `sync_sleeper_players.py` - Fetch Sleeper players, current-week stats/projections, and batch-write to Firestore

## Common Commands

Run from the repository root:

```bash
scripts/windows/start-full-app.bat
```

```bash
node scripts/init-nfl-data.js
```

```bash
pip install -r scripts/requirements.txt
python scripts/sync_sleeper_players.py
```

## Notes

- `init-nfl-data.js` expects `serviceAccountKey.json` at the project root.
- `sync_sleeper_players.py` uses the same `serviceAccountKey.json` by default, or pass `--credentials path/to/key.json`.
- Weekly stats are written to `players/{player_id}/weekly_stats/{season}_{season_type}_week_{week}` with `stats` and `projected` objects for frontend comparison.
- Keep runtime app entry files (`index.html`, `api.js`, `config.js`) in the root unless import paths are updated.
