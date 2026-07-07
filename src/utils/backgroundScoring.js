// Background Fantasy Scoring System
// Automatically updates team scores using live player stats and league scoring rules

class BackgroundScoringSystem {
    constructor() {
        this.isRunning = false;
        this.updateInterval = null;
        this.currentWeek = null;
        this.activeLeagues = new Map();
        this.playerStats = new Map();
        this.lastUpdate = null;
    }

    // Start the background scoring system
    start(db, leagues = []) {
        if (this.isRunning) {
            console.log('Background scoring already running');
            return;
        }

        this.db = db;
        this.isRunning = true;
        console.log('Starting background fantasy scoring system...');

        // Initialize leagues
        leagues.forEach(league => {
            this.activeLeagues.set(league.id, league);
        });

        // Start automatic updates
        this.startAutomaticUpdates();
    }

    // Stop the background scoring system
    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        this.isRunning = false;
        console.log('Background scoring system stopped');
    }

    // Start automatic updates every 30 seconds
    startAutomaticUpdates() {
        // Initial update
        this.updateAllLeagueScores();

        // Set up interval for continuous updates
        this.updateInterval = setInterval(() => {
            this.updateAllLeagueScores();
        }, 30000); // Update every 30 seconds
    }

    // Update scores for all active leagues
    async updateAllLeagueScores() {
        try {
            console.log('Updating fantasy scores for all leagues...');
            
            for (const [leagueId, league] of this.activeLeagues) {
                await this.updateLeagueScores(leagueId, league);
            }

            this.lastUpdate = new Date();
            console.log('Fantasy score update completed at:', this.lastUpdate);
        } catch (error) {
            console.error('Error updating fantasy scores:', error);
        }
    }

    // Update scores for a specific league
    async updateLeagueScores(leagueId, league) {
        try {
            // Get all teams in the league
            const teamsSnapshot = await this.db.collection(`artifacts/${league.appId}/public/data/teams`).get();
            const teams = teamsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Get current week
            const currentWeek = await this.getCurrentWeek();
            
            // Update each team's score
            for (const team of teams) {
                await this.updateTeamScore(leagueId, team, league.settings?.scoringRules, currentWeek);
            }

            // Update league standings
            await this.updateLeagueStandings(leagueId, teams, league);
        } catch (error) {
            console.error(`Error updating scores for league ${leagueId}:`, error);
        }
    }

    // Update a single team's score
    async updateTeamScore(leagueId, team, scoringRules, week) {
        try {
            const teamScore = {
                totalPoints: 0,
                players: {},
                lastUpdated: new Date().toISOString(),
                week: week
            };

            // Calculate scores for each player in the lineup
            for (const [slot, playerId] of Object.entries(team.roster.lineup)) {
                if (playerId) {
                    const player = await this.getPlayerWithStats(playerId);
                    if (player) {
                        const playerScore = this.calculatePlayerScore(player, scoringRules);
                        teamScore.players[slot] = {
                            playerId: playerId,
                            name: player.name,
                            position: player.position,
                            nflTeam: player.nflTeam,
                            points: playerScore,
                            stats: player.stats
                        };
                        teamScore.totalPoints += playerScore;
                    }
                }
            }

            // Update team score in database
            await this.db.doc(`artifacts/${leagueId}/public/data/teams/${team.id}`).update({
                currentScore: teamScore,
                lastScoreUpdate: new Date().toISOString()
            });

            console.log(`Updated ${team.name}: ${teamScore.totalPoints} points`);
        } catch (error) {
            console.error(`Error updating score for team ${team.id}:`, error);
        }
    }

    // Get player with current stats from API
    async getPlayerWithStats(playerId) {
        try {
            // Check cache first
            if (this.playerStats.has(playerId)) {
                const cached = this.playerStats.get(playerId);
                if (Date.now() - cached.timestamp < 300000) { // 5 minutes
                    return cached.data;
                }
            }

            // Get player from your existing player data
            const player = this.findPlayerById(playerId);
            if (!player) return null;

            // Get live stats from API
            const liveStats = await window.fantasyAPIService.getPlayerWithStats(player.name);
            if (liveStats) {
                const updatedPlayer = {
                    ...player,
                    stats: liveStats.stats,
                    lastUpdated: new Date().toISOString()
                };

                // Cache the result
                this.playerStats.set(playerId, {
                    data: updatedPlayer,
                    timestamp: Date.now()
                });

                return updatedPlayer;
            }

            return player;
        } catch (error) {
            console.error(`Error getting stats for player ${playerId}:`, error);
            return this.findPlayerById(playerId);
        }
    }

    // Find player by ID in your existing player data
    findPlayerById(playerId) {
        // This should match your existing player lookup logic
        // You'll need to import your player data or pass it in
        return null; // TODO: Implement player lookup from Cloud Functions
    }

    // Calculate player score based on league scoring rules
    calculatePlayerScore(player, scoringRules) {
        if (!player.stats || !scoringRules) return 0;

        let totalPoints = 0;
        const stats = player.stats;

        // Get the relevant stats category based on position
        const statsCategory = this.getStatsCategory(player.position, stats);
        if (!statsCategory) return 0;

        // Calculate points based on position and scoring rules
        switch (player.position) {
            case 'QB':
                totalPoints += this.calculateQBScore(statsCategory, scoringRules);
                break;
            case 'RB':
            case 'WR':
            case 'TE':
                totalPoints += this.calculateSkillPlayerScore(statsCategory, scoringRules);
                break;
            case 'K':
                totalPoints += this.calculateKickerScore(statsCategory, scoringRules);
                break;
            case 'DL':
            case 'LB':
            case 'DB':
                totalPoints += this.calculateDefensiveScore(statsCategory, scoringRules);
                break;
        }

        return Math.round(totalPoints * 100) / 100;
    }

    // Get the appropriate stats category for a position
    getStatsCategory(position, stats) {
        if (!stats.splits?.categories) return null;

        const categories = stats.splits.categories;
        
        switch (position) {
            case 'QB':
                return categories.find(c => c.name === 'passing') || categories.find(c => c.name === 'rushing');
            case 'RB':
            case 'WR':
            case 'TE':
                return categories.find(c => c.name === 'rushing') || categories.find(c => c.name === 'receiving');
            case 'K':
                return categories.find(c => c.name === 'kicking');
            case 'DL':
            case 'LB':
            case 'DB':
                return categories.find(c => c.name === 'defensive');
            default:
                return categories[0];
        }
    }

    // Calculate QB score
    calculateQBScore(stats, scoringRules) {
        let points = 0;
        
        for (const stat of stats.stats) {
            switch (stat.name) {
                case 'passingTouchdowns':
                    points += stat.value * scoringRules.passTd;
                    break;
                case 'passingYards':
                    points += stat.value * scoringRules.passYard;
                    // Bonus for 300+ yards
                    if (stat.value >= 300) points += scoringRules.pass300YardBonus;
                    // Bonus for 400+ yards
                    if (stat.value >= 400) points += scoringRules.pass400YardBonus;
                    break;
                case 'completions':
                    points += stat.value * scoringRules.completion;
                    break;
                case 'rushingTouchdowns':
                    points += stat.value * scoringRules.rushTd;
                    break;
                case 'rushingYards':
                    points += stat.value * scoringRules.rushRecYard;
                    // Bonus for 100+ yards
                    if (stat.value >= 100) points += scoringRules.rushRec100YardBonus;
                    break;
                case 'interceptions':
                    points += stat.value * scoringRules.interception;
                    break;
                case 'sacks':
                    points += stat.value * scoringRules.sack;
                    break;
                case 'fumbles':
                    points += stat.value * scoringRules.fumble;
                    break;
            }
        }

        return points;
    }

    // Calculate skill player score (RB/WR/TE)
    calculateSkillPlayerScore(stats, scoringRules) {
        let points = 0;
        
        for (const stat of stats.stats) {
            switch (stat.name) {
                case 'rushingTouchdowns':
                    points += stat.value * scoringRules.rushTd;
                    break;
                case 'rushingYards':
                    points += stat.value * scoringRules.rushRecYard;
                    // Bonus for 100+ yards
                    if (stat.value >= 100) points += scoringRules.rushRec100YardBonus;
                    // Bonus for 200+ yards
                    if (stat.value >= 200) points += scoringRules.rushRec200YardBonus;
                    break;
                case 'receivingTouchdowns':
                    points += stat.value * scoringRules.recTd;
                    break;
                case 'receivingYards':
                    points += stat.value * scoringRules.rushRecYard;
                    // Bonus for 100+ yards
                    if (stat.value >= 100) points += scoringRules.rushRec100YardBonus;
                    // Bonus for 200+ yards
                    if (stat.value >= 200) points += scoringRules.rushRec200YardBonus;
                    break;
                case 'receptions':
                    points += stat.value * scoringRules.reception;
                    break;
                case 'fumbles':
                    points += stat.value * scoringRules.fumble;
                    break;
            }
        }

        return points;
    }

    // Calculate kicker score
    calculateKickerScore(stats, scoringRules) {
        let points = 0;
        
        for (const stat of stats.stats) {
            switch (stat.name) {
                case 'fieldGoalsMade':
                    // This would need to be broken down by distance in a real implementation
                    points += stat.value * scoringRules.fg39Less;
                    break;
                case 'extraPointsMade':
                    points += stat.value * scoringRules.extraPoint;
                    break;
            }
        }

        return points;
    }

    // Calculate defensive player score
    calculateDefensiveScore(stats, scoringRules) {
        let points = 0;
        
        for (const stat of stats.stats) {
            switch (stat.name) {
                case 'tackles':
                    points += stat.value * scoringRules.tackle;
                    break;
                case 'assistedTackles':
                    points += stat.value * scoringRules.assistedTackle;
                    break;
                case 'sacks':
                    points += stat.value * scoringRules.tackleForLoss;
                    break;
                case 'interceptions':
                    points += stat.value * scoringRules.interceptionDef;
                    break;
                case 'fumbleRecoveries':
                    points += stat.value * scoringRules.fumbleRecoveryDef;
                    break;
                case 'forcedFumbles':
                    points += stat.value * scoringRules.forcedFumble;
                    break;
                case 'passesDefended':
                    points += stat.value * scoringRules.passDefended;
                    break;
                case 'returnYards':
                    points += stat.value * scoringRules.returnYardDefSt;
                    break;
            }
        }

        return points;
    }

    // Get current NFL week
    async getCurrentWeek() {
        try {
            // You can implement this based on your league's week calculation
            // For now, we'll use a simple date-based calculation
            const now = new Date();
            const seasonStart = new Date('2024-09-05'); // NFL season start
            const week = Math.floor((now - seasonStart) / (7 * 24 * 60 * 60 * 1000)) + 1;
            return Math.max(1, Math.min(18, week)); // Between weeks 1-18
        } catch (error) {
            console.error('Error getting current week:', error);
            return 1;
        }
    }

    // Update league standings
    async updateLeagueStandings(leagueId, teams, league) {
        try {
            // Sort teams by total points
            const sortedTeams = teams
                .filter(team => team.currentScore)
                .sort((a, b) => (b.currentScore.totalPoints || 0) - (a.currentScore.totalPoints || 0));

            // Update standings in database
            await this.db.doc(`artifacts/${leagueId}/public/data/league`).update({
                standings: sortedTeams.map((team, index) => ({
                    rank: index + 1,
                    teamId: team.id,
                    teamName: team.name,
                    totalPoints: team.currentScore?.totalPoints || 0,
                    wins: team.record?.wins || 0,
                    losses: team.record?.losses || 0
                })),
                lastStandingsUpdate: new Date().toISOString()
            });

            console.log(`Updated standings for league ${leagueId}`);
        } catch (error) {
            console.error(`Error updating standings for league ${leagueId}:`, error);
        }
    }

    // Add a league to the background scoring system
    addLeague(league) {
        this.activeLeagues.set(league.id, league);
        console.log(`Added league ${league.id} to background scoring`);
    }

    // Remove a league from the background scoring system
    removeLeague(leagueId) {
        this.activeLeagues.delete(leagueId);
        console.log(`Removed league ${leagueId} from background scoring`);
    }

    // Get system status
    getStatus() {
        return {
            isRunning: this.isRunning,
            activeLeagues: this.activeLeagues.size,
            lastUpdate: this.lastUpdate,
            currentWeek: this.currentWeek,
            playerStatsCache: this.playerStats.size
        };
    }

    // Clear player stats cache
    clearCache() {
        this.playerStats.clear();
        console.log('Player stats cache cleared');
    }
}

// Create global instance
window.backgroundScoring = new BackgroundScoringSystem();

export default BackgroundScoringSystem; 