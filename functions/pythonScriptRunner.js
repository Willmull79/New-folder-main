const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

const PYTHON_COMMAND = process.platform === 'win32' ? 'python' : 'python3';
const DEFAULT_TIMEOUT_MS = 120000;

/**
 * Spawns a Python subprocess and communicates via stdin/stdout JSON.
 * Uses child_process.spawn (non-blocking) so the Node event loop stays responsive.
 */
function runPythonScript(scriptPath, payload, options = {}) {
    const { timeoutMs = DEFAULT_TIMEOUT_MS, pythonPath = PYTHON_COMMAND } = options;

    return new Promise((resolve, reject) => {
        const pythonProcess = spawn(pythonPath, [scriptPath], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, PYTHONUNBUFFERED: '1' },
        });

        let stdout = '';
        let stderr = '';
        let settled = false;

        const timer = setTimeout(() => {
            if (!settled) {
                settled = true;
                pythonProcess.kill('SIGTERM');
                reject(new Error(`Python script timed out after ${timeoutMs}ms`));
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
                reject(new Error(stderr.trim() || `Python process exited with code ${code}`));
                return;
            }

            const trimmed = stdout.trim();
            if (!trimmed) {
                resolve(null);
                return;
            }

            try {
                resolve(JSON.parse(trimmed));
            } catch (parseError) {
                reject(new Error(`Failed to parse Python output: ${trimmed}`));
            }
        });

        pythonProcess.stdin.write(JSON.stringify(payload));
        pythonProcess.stdin.end();
    });
}

module.exports = {
    runPythonScript,
    PYTHON_COMMAND,
    DEFAULT_TIMEOUT_MS,
};
