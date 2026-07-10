const { spawn } = require('child_process');
const path = require('path');
const { PYTHON_COMMAND } = require('./pythonScriptRunner');

const SCRAPE_SCRIPT_PATH = path.join(__dirname, 'scrapeProjections.py');
const SCRAPE_TIMEOUT_MS = 300000;

/**
 * Run scrapeProjections.py in a child process (non-blocking).
 */
function runProjectionScrape(options = {}) {
    const {
        week,
        season,
        scoring,
        positions,
        credentials,
        timeoutMs = SCRAPE_TIMEOUT_MS,
    } = options;

    const args = [SCRAPE_SCRIPT_PATH, '--json-output'];

    if (week !== undefined && week !== null) args.push('--week', String(week));
    if (season) args.push('--season', String(season));
    if (scoring) args.push('--scoring', scoring);
    if (positions) args.push('--positions', positions);
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
                reject(new Error(`Projection scrape timed out after ${timeoutMs}ms`));
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

            const trimmed = stdout.trim();
            let parsed = null;

            if (trimmed) {
                try {
                    parsed = JSON.parse(trimmed);
                } catch (parseError) {
                    reject(new Error(`Failed to parse projection scrape output: ${trimmed}`));
                    return;
                }
            }

            if (code !== 0) {
                const message = parsed?.error || stderr.trim() || `Projection scrape exited with code ${code}`;
                reject(new Error(message));
                return;
            }

            resolve(parsed || { success: true });
        });
    });
}

module.exports = {
    runProjectionScrape,
    SCRAPE_SCRIPT_PATH,
    SCRAPE_TIMEOUT_MS,
};
