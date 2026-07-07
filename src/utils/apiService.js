// Enhanced API Service for Real-time Fantasy Football Data
// This service handles live scores, player updates, and data synchronization

class FantasyAPIService {
    constructor() {
        this.baseUrl = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
        this.liveUpdateInterval = null;
        this.subscribers = new Set();
    }

    // Generic API call with caching
    async makeRequest(url, options = {}) {
        const cacheKey = url + JSON.stringify(options);
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }

        try {
            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            
            // Cache the response
            this.cache.set(cacheKey, {
                data,
                timestamp: Date.now()
            });

            return data;
        } catch (error) {
            console.error('API Request failed:', error);
            throw error;
        }
    }

    // Get live scores and game data
    async getLiveScores(week = null) {
        let url = `${this.baseUrl}/scoreboard`;
        if (week) {
            url += `?week=${week}`;
        }
        return this.makeRequest(url);
    }

    // Get detailed player information
    async getPlayerDetails(playerId) {
        const url = `${this.baseUrl}/athletes/${playerId}`;
        return this.makeRequest(url);
    }

    // Get player statistics
    async getPlayerStats(playerId) {
        const url = `${this.baseUrl}/athletes/${playerId}/stats`;
        return this.makeRequest(url);
    }

    // Search for players
    async searchPlayers(query) {
        const url = `${this.baseUrl}/athletes?search=${encodeURIComponent(query)}`;
        return this.makeRequest(url);
    }

    // Get team roster
    async getTeamRoster(teamId) {
        const url = `${this.baseUrl}/teams/${teamId}/roster`;
        return this.makeRequest(url);
    }

    // Get all teams
    async getAllTeams() {
        const url = `${this.baseUrl}/teams`;
        return this.makeRequest(url);
    }

    // Get standings
    async getStandings() {
        const url = `${this.baseUrl}/standings`;
        return this.makeRequest(url);
    }

    // Enhanced player search with stats
    async getPlayerWithStats(playerName) {
        try {
            // Search for player
            const searchResults = await this.searchPlayers(playerName);
            const player = searchResults.athletes?.find(p => 
                p.fullName.toLowerCase().includes(playerName.toLowerCase())
            );

            if (player) {
                // Get detailed stats
                const stats = await this.getPlayerStats(player.id);
                const details = await this.getPlayerDetails(player.id);

                return {
                    ...player,
                    stats: stats,
                    details: details,
                    lastUpdated: new Date().toISOString()
                };
            }
        } catch (error) {
            console.error('Failed to get player with stats:', error);
        }
        return null;
    }

    // Calculate fantasy points based on stats
    calculateFantasyPoints(stats, position) {
        let points = 0;
        
        if (!stats || !stats.splits) return 0;

        const split = stats.splits.categories?.find(c => c.name === 'passing') || 
                     stats.splits.categories?.find(c => c.name === 'rushing') ||
                     stats.splits.categories?.find(c => c.name === 'receiving') ||
                     stats.splits.categories?.find(c => c.name === 'defensive') ||
                     stats.splits.categories?.find(c => c.name === 'kicking');

        if (!split) return 0;

        const statsData = split.stats;

        switch (position) {
            case 'QB':
                points += (statsData.find(s => s.name === 'passingYards')?.value || 0) / 25;
                points += (statsData.find(s => s.name === 'passingTouchdowns')?.value || 0) * 4;
                points += (statsData.find(s => s.name === 'rushingYards')?.value || 0) / 10;
                points += (statsData.find(s => s.name === 'rushingTouchdowns')?.value || 0) * 6;
                points -= (statsData.find(s => s.name === 'interceptions')?.value || 0) * 2;
                break;
            case 'RB':
            case 'WR':
            case 'TE':
                points += (statsData.find(s => s.name === 'rushingYards')?.value || 0) / 10;
                points += (statsData.find(s => s.name === 'rushingTouchdowns')?.value || 0) * 6;
                points += (statsData.find(s => s.name === 'receivingYards')?.value || 0) / 10;
                points += (statsData.find(s => s.name === 'receivingTouchdowns')?.value || 0) * 6;
                points += (statsData.find(s => s.name === 'receptions')?.value || 0) * 0.5;
                break;
            case 'K':
                points += (statsData.find(s => s.name === 'fieldGoalsMade')?.value || 0) * 3;
                points += (statsData.find(s => s.name === 'extraPointsMade')?.value || 0);
                break;
            case 'DL':
            case 'LB':
            case 'DB':
                points += (statsData.find(s => s.name === 'tackles')?.value || 0);
                points += (statsData.find(s => s.name === 'sacks')?.value || 0) * 2;
                points += (statsData.find(s => s.name === 'interceptions')?.value || 0) * 3;
                points += (statsData.find(s => s.name === 'fumbleRecoveries')?.value || 0) * 2;
                break;
        }

        return Math.round(points * 100) / 100;
    }

    // Get live game data with fantasy implications
    async getLiveGameData() {
        try {
            const scores = await this.getLiveScores();
            const liveGames = scores.events?.filter(game => 
                game.status?.type?.description === 'In Progress' ||
                game.status?.type?.description === 'Halftime'
            ) || [];

            return liveGames.map(game => ({
                id: game.id,
                homeTeam: game.competitions[0]?.competitors.find(c => c.homeAway === 'home'),
                awayTeam: game.competitions[0]?.competitors.find(c => c.homeAway === 'away'),
                status: game.status,
                time: game.date,
                score: {
                    home: game.competitions[0]?.competitors.find(c => c.homeAway === 'home')?.score,
                    away: game.competitions[0]?.competitors.find(c => c.homeAway === 'away')?.score
                }
            }));
        } catch (error) {
            console.error('Failed to get live game data:', error);
            return [];
        }
    }

    // Update player information with latest data
    async updatePlayerInfo(playerName, position) {
        try {
            const playerData = await this.getPlayerWithStats(playerName);
            
            if (playerData) {
                const fantasyPoints = this.calculateFantasyPoints(playerData.stats, position);
                
                return {
                    id: playerData.id,
                    name: playerData.fullName,
                    position: position,
                    nflTeam: playerData.team?.abbreviation,
                    salary: 0, // You can set this based on your league rules
                    stats: playerData.stats,
                    fantasyPoints: fantasyPoints,
                    lastUpdated: new Date().toISOString(),
                    status: playerData.status?.description || 'Active',
                    jerseyNumber: playerData.jersey,
                    height: playerData.height,
                    weight: playerData.weight,
                    age: playerData.age
                };
            }
        } catch (error) {
            console.error('Failed to update player info:', error);
        }
        return null;
    }

    // Start live updates for scores
    startLiveUpdates(callback, interval = 30000) {
        if (this.liveUpdateInterval) {
            clearInterval(this.liveUpdateInterval);
        }

        this.liveUpdateInterval = setInterval(async () => {
            try {
                const liveData = await this.getLiveGameData();
                if (liveData.length > 0) {
                    callback(liveData);
                }
            } catch (error) {
                console.error('Live update failed:', error);
            }
        }, interval);

        // Initial call
        this.getLiveGameData().then(callback);
    }

    // Stop live updates
    stopLiveUpdates() {
        if (this.liveUpdateInterval) {
            clearInterval(this.liveUpdateInterval);
            this.liveUpdateInterval = null;
        }
    }

    // Subscribe to updates
    subscribe(callback) {
        this.subscribers.add(callback);
        return () => this.subscribers.delete(callback);
    }

    // Notify subscribers
    notifySubscribers(data) {
        this.subscribers.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error('Subscriber callback failed:', error);
            }
        });
    }

    // Get injury updates
    async getInjuryUpdates() {
        try {
            const teams = await this.getAllTeams();
            const injuredPlayers = [];

            for (const team of teams.sports[0].leagues[0].teams) {
                const roster = await this.getTeamRoster(team.team.id);
                const injured = roster.athletes?.filter(player => 
                    player.status?.description?.toLowerCase().includes('injured') ||
                    player.status?.description?.toLowerCase().includes('out') ||
                    player.status?.description?.toLowerCase().includes('questionable')
                ) || [];

                injuredPlayers.push(...injured.map(player => ({
                    ...player,
                    team: team.team.name
                })));
            }

            return injuredPlayers;
        } catch (error) {
            console.error('Failed to get injury updates:', error);
            return [];
        }
    }

    // Get player news and updates
    async getPlayerNews(playerName) {
        try {
            const player = await this.getPlayerWithStats(playerName);
            if (player) {
                return {
                    player: player.fullName,
                    team: player.team?.name,
                    status: player.status?.description,
                    lastGame: player.stats?.splits?.categories?.[0]?.stats || [],
                    lastUpdated: new Date().toISOString()
                };
            }
        } catch (error) {
            console.error('Failed to get player news:', error);
        }
        return null;
    }

    // Batch update multiple players
    async batchUpdatePlayers(playerNames) {
        const updates = [];
        
        for (const playerName of playerNames) {
            try {
                const update = await this.updatePlayerInfo(playerName.name, playerName.position);
                if (update) {
                    updates.push(update);
                }
            } catch (error) {
                console.error(`Failed to update ${playerName.name}:`, error);
            }
        }

        return updates;
    }

    // Clear cache
    clearCache() {
        this.cache.clear();
    }

    // Get cache statistics
    getCacheStats() {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
    }
}

// Create global instance
window.fantasyAPIService = new FantasyAPIService();

export default FantasyAPIService; 