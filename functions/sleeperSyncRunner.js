const { spawn } = require('child_process');
const path = require('path');
const { PYTHON_COMMAND, DEFAULT_TIMEOUT_MS } = require('./pythonScriptRunner');

const SYNC_SCRIPT_PATH = path.join(__dirname, 'sync_sleeper_players.py');
const SYNC_TIMEOUT_MS = 540000;

/**
 * Run the full Sleeper sync Python script in a child process (non-blocking).
 */
function runSleeperPlayerSync(options = {}) {
    const {
        skipPlayers = false,
        skipWeeklyStats = false,
        seasonType,
        season,
        week,
        weeklyStatsForAllPlayers = false,
        credentials,
        timeoutMs = SYNC_TIMEOUT_MS,
    } = options;

    const args = [SYNC_SCRIPT_PATH, '--json-output'];

    if (skipPlayers) args.push('--skip-players');
    if (skipWeeklyStats) args.push('--skip-weekly-stats');
    if (seasonType) args.push('--season-type', seasonType);
    if (season) args.push('--season', String(season));
    if (week !== undefined && week !== null) args.push('--week', String(week));
    if (weeklyStatsForAllPlayers) args.push('--weekly-stats-for-all-players');
    if (credentials) args.push('--credentials', credentials);

    return new Promise((resolve, reject) => {
        const pythonProcess = spawn(PYTHON_COMMAND, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, PYTHONUNBUFFERED: '1' },
        });

        let stdout = '';
        let stderr = '';
        let settled = false;

        const timer = setTimeout(() => {
            if (!settled) {
                settled = true;
                pythonProcess.kill('SIGTERM');
                reject(new Error(`Sleeper sync timed out after ${timeoutMs}ms`));
            }
        }, timeoutMs);

        pythonProcess.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });

        pythonProcess.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });

        pythonProcess.on('error', (error) => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                reject(error);
            }
        });

        pythonProcess.on('close', (code) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);

            if (code !== 0) {
                reject(new Error(stderr.trim() || `Sleeper sync exited with code ${code}`));
                return;
            }

            const trimmed = stdout.trim();
            if (!trimmed) {
                resolve({ success: true, result: {} });
                return;
            }

            try {
                resolve(JSON.parse(trimmed));
            } catch (parseError) {
                resolve({ success: true, output: trimmed, stderr: stderr.trim() });
            }
        });
    });
}

module.exports = {
    runSleeperPlayerSync,
    SYNC_SCRIPT_PATH,
};
