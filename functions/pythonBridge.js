const path = require('path');
const { runPythonScript, PYTHON_COMMAND } = require('./pythonScriptRunner');

const METHOD_MAP = {
    fetch_player_data: 'fetch_player_data',
    calculate_optimal_pick: 'calculate_optimal_pick',
    generate_draft_order: 'generate_draft_order',
    analyze_draft_strategy: 'analyze_draft_strategy',
    process_draft_pick: 'process_draft_pick',
};

class PythonBridge {
    constructor() {
        this.pythonPath = PYTHON_COMMAND;
        this.scriptPath = path.join(__dirname, 'draftEngine.py');
    }

    async callPythonFunction(functionName, data) {
        const payload = {
            function: functionName,
            args: data,
        };

        return runPythonScript(this.scriptPath, payload, {
            pythonPath: this.pythonPath,
        });
    }

    async fetchEnhancedPlayerData(limit = 1000) {
        try {
            return await this.callPythonFunction(METHOD_MAP.fetch_player_data, { limit });
        } catch (error) {
            console.error('Error fetching enhanced player data:', error);
            return [];
        }
    }

    async calculateOptimalPick(availablePlayers, teamNeeds) {
        try {
            return await this.callPythonFunction(METHOD_MAP.calculate_optimal_pick, {
                available_players: availablePlayers,
                team_needs: teamNeeds,
            });
        } catch (error) {
            console.error('Error calculating optimal pick:', error);
            return null;
        }
    }

    async generateDraftOrder(teams, draftType = 'snake') {
        try {
            return await this.callPythonFunction(METHOD_MAP.generate_draft_order, {
                teams,
                draft_type: draftType,
            });
        } catch (error) {
            console.error('Error generating draft order:', error);
            return [];
        }
    }

    async analyzeDraftStrategy(leagueSettings, teamData) {
        try {
            return await this.callPythonFunction(METHOD_MAP.analyze_draft_strategy, {
                league_settings: leagueSettings,
                team_data: teamData,
            });
        } catch (error) {
            console.error('Error analyzing draft strategy:', error);
            return {
                recommended_positions: [],
                avoid_positions: [],
                draft_strategy: 'balanced',
                risk_tolerance: 'medium',
                projected_finish: 'middle',
            };
        }
    }

    async processDraftPick(leagueId, teamId, playerId, draftState) {
        try {
            return await this.callPythonFunction(METHOD_MAP.process_draft_pick, {
                league_id: leagueId,
                team_id: teamId,
                player_id: playerId,
                draft_state: draftState,
            });
        } catch (error) {
            console.error('Error processing draft pick:', error);
            return draftState;
        }
    }

    /**
     * Run draftEngine.py directly (used by runDraftEngine Cloud Function).
     */
    runDraftEngineOperation(functionName, args = {}) {
        return this.callPythonFunction(functionName, args);
    }
}

module.exports = PythonBridge;
