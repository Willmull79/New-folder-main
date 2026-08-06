// NFL Player Service — rankings/master_list (1 read) + 30-min localStorage cache
import { FALLBACK_NFL_PLAYERS } from '../data/fallbackPlayers.js';
import { isOnActiveNflRoster } from './helpers.js';
import {
    getSleeperNflPlayers,
    loadSleeperPlayersFromCache,
    saveSleeperPlayersToCache,
} from './sleeperPlayerService.js';

export const RANKINGS_COLLECTION = 'rankings';
export const RANKINGS_DOC_ID = 'master_list';
export const PLAYERS_CACHE_KEY = 'nfl_rankings_master_v2';
export const PLAYERS_CACHE_STALE_MS = 30 * 60 * 1000; // 30 minutes

/** @deprecated Use PLAYERS_CACHE_KEY — kept for one-time migration cleanup */
export const SESSION_PLAYERS_CACHE_KEY = 'nfl_master_players_session_v2';

export const normalizeFirestorePlayer = (docOrData, fallbackId = null) => {
    const data = typeof docOrData?.data === 'function' ? docOrData.data() : (docOrData || {});
    const id = docOrData?.id || data.id || fallbackId;
    const firstName = (data.first_name || '').trim();
    const lastName = (data.last_name || '').trim();
    const fullName = (data.name || `${firstName} ${lastName}`).trim() || 'Unknown';
    const team = data.nflTeam || data.team || 'FA';
    const projectedPoints = Number(data.projectedPoints ?? data.projected_points);
    const rankValue = Number(data.rank ?? data.search_rank);

    return {
        ...data,
        id: String(id),
        first_name: firstName,
        last_name: lastName,
        name: fullName,
        position: data.position || null,
        nflTeam: team,
        team,
        rank: Number.isFinite(rankValue) && rankValue > 0 ? rankValue : 9999,
        projectedPoints: Number.isFinite(projectedPoints) ? projectedPoints : null,
        espn_id: data.espn_id != null ? String(data.espn_id) : null,
        salary: data.salary ?? 1,
        status: data.status || null,
    };
};

const normalizeRankingsList = (players = []) => (
    players
        .map((player) => normalizeFirestorePlayer(player, player?.id))
        .filter(isOnActiveNflRoster)
);

export const readPlayersFromCache = () => {
    try {
        const raw = localStorage.getItem(PLAYERS_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const fetchedAt = Number(parsed?.fetchedAt);
        const players = Array.isArray(parsed?.players) ? parsed.players : null;
        if (!players?.length || !Number.isFinite(fetchedAt)) return null;

        const ageMs = Date.now() - fetchedAt;
        if (ageMs < 0 || ageMs > PLAYERS_CACHE_STALE_MS) {
            return null;
        }

        return {
            players: normalizeRankingsList(players),
            fetchedAt,
            ageMs,
            stale: false,
        };
    } catch (error) {
        console.warn('Failed to read player rankings cache:', error);
        return null;
    }
};

export const writePlayersToCache = (players) => {
    try {
        localStorage.setItem(
            PLAYERS_CACHE_KEY,
            JSON.stringify({
                players,
                fetchedAt: Date.now(),
            })
        );
    } catch (error) {
        console.warn('Failed to write player rankings cache:', error);
    }
};

/** @deprecated Prefer readPlayersFromCache (30-min localStorage). */
export const readPlayersFromSessionCache = () => {
    const fresh = readPlayersFromCache();
    if (fresh?.players?.length) return fresh.players;
    return null;
};

/** @deprecated Prefer writePlayersToCache. */
export const writePlayersToSessionCache = (players) => {
    writePlayersToCache(players);
};

/**
 * One Firestore document read: rankings/master_list.
 * Returns [] if the doc is missing or empty.
 */
export const fetchPlayersFromFirestore = async (db) => {
    if (!db) return [];

    const snap = await db.collection(RANKINGS_COLLECTION).doc(RANKINGS_DOC_ID).get();
    if (!snap.exists) return [];

    const data = snap.data() || {};
    const players = normalizeRankingsList(data.players || []);
    return players;
};

class NFLPlayerService {
    constructor() {
        this.players = [];
        this.lastUpdate = null;
        this.updateInterval = 24 * 60 * 60 * 1000;
        this.cacheKey = 'nfl_players_cache';
        this.lastUpdateKey = 'nfl_players_last_update';
        this.db = null;
        this.baseUrl = 'https://us-central1-dynasty-420.cloudfunctions.net';
        this.inFlightPromise = null;
    }

    setFirebaseDB(db) {
        this.db = db;
    }

    shouldUpdate() {
        const lastUpdate = localStorage.getItem(this.lastUpdateKey);
        if (!lastUpdate) return true;
        const hoursSinceUpdate = (Date.now() - new Date(lastUpdate).getTime()) / (1000 * 60 * 60);
        return hoursSinceUpdate >= 24;
    }

    keepRosteredPlayersOnly() {
        this.players = (this.players || []).filter(isOnActiveNflRoster);
    }

    /**
     * Get rankings with a 30-minute stale-time guard.
     * Tab navigation reuses memory/localStorage — no Firestore read while fresh.
     */
    async getAllPlayers({ forceRefresh = false } = {}) {
        if (!forceRefresh && this.players?.length) {
            this.keepRosteredPlayersOnly();
            return this.players;
        }

        if (!forceRefresh) {
            const cached = readPlayersFromCache();
            if (cached?.players?.length) {
                this.players = cached.players;
                this.keepRosteredPlayersOnly();
                return this.players;
            }
        }

        if (this.inFlightPromise && !forceRefresh) {
            return this.inFlightPromise;
        }

        this.inFlightPromise = this._loadPlayers(forceRefresh)
            .finally(() => {
                this.inFlightPromise = null;
            });

        return this.inFlightPromise;
    }

    async _loadPlayers(forceRefresh = false) {
        if (this.db) {
            try {
                const firestorePlayers = await fetchPlayersFromFirestore(this.db);
                if (firestorePlayers.length) {
                    this.players = firestorePlayers;
                    this.lastUpdate = new Date();
                    localStorage.setItem(this.lastUpdateKey, this.lastUpdate.toISOString());
                    writePlayersToCache(this.players);
                    this.keepRosteredPlayersOnly();
                    return this.players;
                }
            } catch (error) {
                console.error('Error loading rankings/master_list from Firestore:', error);
            }
        }

        if (forceRefresh || this.shouldUpdate()) {
            await this.updatePlayerData(forceRefresh);
        } else {
            await this.loadFromCache();
        }
        this.keepRosteredPlayersOnly();
        if (this.players.length) {
            writePlayersToCache(this.players);
        }
        return this.players;
    }

    async updatePlayerData(forceRefresh = false) {
        try {
            console.log('Updating NFL player data from Sleeper API...');
            this.players = await getSleeperNflPlayers({ forceRefresh });
            this.lastUpdate = new Date();
            localStorage.setItem(this.lastUpdateKey, this.lastUpdate.toISOString());
            localStorage.setItem(this.cacheKey, JSON.stringify(this.players));
            writePlayersToCache(this.players);
            console.log(`Updated ${this.players.length} NFL players from Sleeper API`);
        } catch (error) {
            console.error('Error updating NFL player data from Sleeper:', error);
            await this.loadFromCache();
            if (!this.players.length) {
                this.players = [...FALLBACK_NFL_PLAYERS];
                localStorage.setItem(this.cacheKey, JSON.stringify(this.players));
                saveSleeperPlayersToCache(this.players);
                writePlayersToCache(this.players);
            }
        }
    }

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
            return this.searchPlayersLocally(query);
        }
    }

    searchPlayersLocally(query) {
        if (!query || query.length < 2) return [];
        const searchTerm = query.toLowerCase();
        return this.players.filter((player) =>
            player.name.toLowerCase().includes(searchTerm)
            || (player.first_name || '').toLowerCase().includes(searchTerm)
            || (player.last_name || '').toLowerCase().includes(searchTerm)
            || player.nflTeam.toLowerCase().includes(searchTerm)
            || player.position.toLowerCase().includes(searchTerm)
        );
    }

    getPlayersByPosition(position) {
        return this.players.filter((player) => player.position === position);
    }

    getPlayersByTeam(team) {
        return this.players.filter((player) => player.nflTeam === team);
    }

    getTopPlayers(limit = 50) {
        return this.players
            .sort((a, b) => a.rank - b.rank)
            .slice(0, limit);
    }

    getPlayersByRankRange(minRank, maxRank) {
        return this.players
            .filter((player) => player.rank >= minRank && player.rank <= maxRank)
            .sort((a, b) => a.rank - b.rank);
    }
}

const nflPlayerService = new NFLPlayerService();

export default nflPlayerService;
