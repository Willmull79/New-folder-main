// NFL Player Service - Primary source: Sleeper API (QB/RB/WR/TE only)
import { FALLBACK_NFL_PLAYERS } from '../data/fallbackPlayers.js';
import {
    getSleeperNflPlayers,
    loadSleeperPlayersFromCache,
    saveSleeperPlayersToCache,
} from './sleeperPlayerService.js';

class NFLPlayerService {
    constructor() {
        this.players = [];
        this.lastUpdate = null;
        this.updateInterval = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        this.cacheKey = 'nfl_players_cache';
        this.lastUpdateKey = 'nfl_players_last_update';
        this.db = null; // Will be set by setFirebaseDB
        this.baseUrl = 'https://us-central1-dynasty-420.cloudfunctions.net';
    }

    // Set Firebase database reference
    setFirebaseDB(db) {
        this.db = db;
    }

    // Check if we need to update player data (daily)
    shouldUpdate() {
        const lastUpdate = localStorage.getItem(this.lastUpdateKey);
        if (!lastUpdate) return true;

        const lastUpdateDate = new Date(lastUpdate);
        const now = new Date();
        const hoursSinceUpdate = (now - lastUpdateDate) / (1000 * 60 * 60);
        
        return hoursSinceUpdate >= 24;
    }

    // Get all NFL players (Sleeper API, filtered to QB/RB/WR/TE)
    async getAllPlayers({ forceRefresh = false } = {}) {
        if (forceRefresh || this.shouldUpdate()) {
            await this.updatePlayerData(forceRefresh);
        } else {
            await this.loadFromCache();
        }
        return this.players;
    }

    // Update player data from Sleeper API
    async updatePlayerData(forceRefresh = false) {
        try {
            console.log('Updating NFL player data from Sleeper API...');
            this.players = await getSleeperNflPlayers({ forceRefresh });
            this.lastUpdate = new Date();
            localStorage.setItem(this.lastUpdateKey, this.lastUpdate.toISOString());
            localStorage.setItem(this.cacheKey, JSON.stringify(this.players));
            console.log(`Updated ${this.players.length} NFL players from Sleeper API`);
        } catch (error) {
            console.error('Error updating NFL player data from Sleeper:', error);
            await this.loadFromCache();
            if (!this.players.length) {
                this.players = [...FALLBACK_NFL_PLAYERS];
                localStorage.setItem(this.cacheKey, JSON.stringify(this.players));
                saveSleeperPlayersToCache(this.players);
            }
        }
    }

    // Load players from cache
    async loadFromCache() {
        try {
            const cachedData = localStorage.getItem(this.cacheKey);
            if (cachedData) {
                this.players = JSON.parse(cachedData);
                console.log(`Loaded ${this.players.length} players from cache`);
            } else {
                this.players = loadSleeperPlayersFromCache();
                if (this.players.length) {
                    console.log(`Loaded ${this.players.length} players from Sleeper cache`);
                }
            }
        } catch (error) {
            console.error('Error loading from cache:', error);
            this.players = [];
        }

        if (!this.players.length) {
            this.players = [...FALLBACK_NFL_PLAYERS];
            localStorage.setItem(this.cacheKey, JSON.stringify(this.players));
            console.log(`Loaded ${this.players.length} fallback NFL players`);
        }
    }

    // Search players using Cloud Functions
    async searchPlayers(query) {
        if (!query || query.length < 2) return [];
        
        try {
            console.log(`Searching players with query: ${query}`);
            const response = await fetch(`${this.baseUrl}/searchPlayers?query=${encodeURIComponent(query)}&limit=50`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            return data.players || [];
        } catch (error) {
            console.error('Error searching players:', error);
            // Fallback to local search
            return this.searchPlayersLocally(query);
        }
    }

    // Fallback local search
    searchPlayersLocally(query) {
        if (!query || query.length < 2) return [];
        
        const searchTerm = query.toLowerCase();
        return this.players.filter(player => 
            player.name.toLowerCase().includes(searchTerm) ||
            (player.first_name || '').toLowerCase().includes(searchTerm) ||
            (player.last_name || '').toLowerCase().includes(searchTerm) ||
            player.nflTeam.toLowerCase().includes(searchTerm) ||
            player.position.toLowerCase().includes(searchTerm)
        );
    }

    // Get players by position
    getPlayersByPosition(position) {
        return this.players.filter(player => player.position === position);
    }

    // Get players by team
    getPlayersByTeam(team) {
        return this.players.filter(player => player.nflTeam === team);
    }

    // Get top ranked players
    getTopPlayers(limit = 50) {
        return this.players
            .sort((a, b) => a.rank - b.rank)
            .slice(0, limit);
    }

    // Get players by rank range
    getPlayersByRankRange(minRank, maxRank) {
        return this.players
            .filter(player => player.rank >= minRank && player.rank <= maxRank)
            .sort((a, b) => a.rank - b.rank);
    }
}

// Create singleton instance
const nflPlayerService = new NFLPlayerService();

export default nflPlayerService; 