const { spawn } = require('child_process');
const path = require('path');

class PythonBridge {
    constructor() {
        this.pythonPath = 'python3'; // or 'python' on Windows
        this.scriptPath = path.join(__dirname, 'draftEngine.py');
    }

    async callPythonFunction(functionName, data) {
        return new Promise((resolve, reject) => {
            const pythonProcess = spawn(this.pythonPath, [
                '-c',
                `
import sys
import json
sys.path.append('${__dirname}')
from draftEngine import DraftEngine

engine = DraftEngine()
data = json.loads('${JSON.stringify(data)}')
result = engine.${functionName}(**data)
print(json.dumps(result))
                `
            ]);

            let output = '';
            let errorOutput = '';

            pythonProcess.stdout.on('data', (data) => {
                output += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Python process failed: ${errorOutput}`));
                } else {
                    try {
                        const result = JSON.parse(output.trim());
                        resolve(result);
                    } catch (e) {
                        reject(new Error(`Failed to parse Python output: ${output}`));
                    }
                }
            });
        });
    }

    async fetchEnhancedPlayerData(limit = 1000) {
        try {
            return await this.callPythonFunction('fetch_player_data', { limit });
        } catch (error) {
            console.error('Error fetching enhanced player data:', error);
            return [];
        }
    }

    async calculateOptimalPick(availablePlayers, teamNeeds) {
        try {
            return await this.callPythonFunction('calculate_optimal_pick', {
                available_players: availablePlayers,
                team_needs: teamNeeds
            });
        } catch (error) {
            console.error('Error calculating optimal pick:', error);
            return null;
        }
    }

    async generateDraftOrder(teams, draftType = 'snake') {
        try {
            return await this.callPythonFunction('generate_draft_order', {
                teams: teams,
                draft_type: draftType
            });
        } catch (error) {
            console.error('Error generating draft order:', error);
            return [];
        }
    }

    async analyzeDraftStrategy(leagueSettings, teamData) {
        try {
            return await this.callPythonFunction('analyze_draft_strategy', {
                league_settings: leagueSettings,
                team_data: teamData
            });
        } catch (error) {
            console.error('Error analyzing draft strategy:', error);
            return {
                recommended_positions: [],
                avoid_positions: [],
                draft_strategy: 'balanced',
                risk_tolerance: 'medium',
                projected_finish: 'middle'
            };
        }
    }

    async processDraftPick(leagueId, teamId, playerId, draftState) {
        try {
            return await this.callPythonFunction('process_draft_pick', {
                league_id: leagueId,
                team_id: teamId,
                player_id: playerId,
                draft_state: draftState
            });
        } catch (error) {
            console.error('Error processing draft pick:', error);
            return draftState;
        }
    }
}

module.exports = PythonBridge; 