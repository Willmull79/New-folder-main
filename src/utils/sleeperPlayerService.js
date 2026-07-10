const SLEEPER_NFL_PLAYERS_URL = 'https://api.sleeper.app/v1/players/nfl';
const CACHE_KEY = 'sleeper_nfl_players_cache';
const LAST_UPDATE_KEY = 'sleeper_nfl_players_last_update';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const OFFENSIVE_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'FB', 'K']);
const DEFENSIVE_POSITIONS = new Set(['DEF', 'DL', 'DE', 'DT', 'NT', 'LB', 'ILB', 'OLB', 'DB', 'CB']);
const EXCLUDED_POSITIONS = new Set(['FS', 'SS']);

/** @deprecated Use OFFENSIVE_POSITIONS + DEFENSIVE_POSITIONS */
const ELIGIBLE_POSITIONS = [...OFFENSIVE_POSITIONS, ...DEFENSIVE_POSITIONS];

export const isExcludedSleeperPosition = (position) => EXCLUDED_POSITIONS.has(position);

export const isOffensiveOrDefensivePosition = (position) => (
    OFFENSIVE_POSITIONS.has(position) || DEFENSIVE_POSITIONS.has(position)
);

export const isActiveSleeperPlayer = (player) => player?.status === 'Active';

export const isOnTeamDepthChart = (player) => player?.depth_chart_order != null;

export const filterSleeperPlayersToArray = (playersById) => {
    if (!playersById || typeof playersById !== 'object') {
        return [];
    }

    return Object.values(playersById)
        .filter((player) => {
            const position = player?.position;
            if (!position || isExcludedSleeperPosition(position)) {
                return false;
            }
            if (!isOffensiveOrDefensivePosition(position)) {
                return false;
            }
            if (!isActiveSleeperPlayer(player)) {
                return false;
            }
            if (!isOnTeamDepthChart(player)) {
                return false;
            }
            // Drop free agents / players not attached to an NFL roster
            const team = String(player.team ?? '').trim().toUpperCase();
            if (!team || team === 'FA' || team === 'FREE AGENT') {
                return false;
            }
            return true;
        })
        .map(transformSleeperPlayer)
        .sort((a, b) => {
            if (a.depth_chart_order !== b.depth_chart_order) {
                return a.depth_chart_order - b.depth_chart_order;
            }
            if (a.rank !== b.rank) {
                return a.rank - b.rank;
            }
            return a.name.localeCompare(b.name);
        });
};

export const transformSleeperPlayer = (player) => {
    const firstName = (player.first_name || '').trim();
    const lastName = (player.last_name || '').trim();
    const fullName = `${firstName} ${lastName}`.trim() || player.full_name || 'Unknown';

    return {
        id: String(player.player_id),
        first_name: firstName,
        last_name: lastName,
        name: fullName,
        position: player.position,
        nflTeam: player.team || 'FA',
        team: player.team || 'FA',
        rank: player.search_rank || 9999,
        salary: 1,
        status: player.status || (player.active ? 'Active' : 'Inactive'),
        depth_chart_order: player.depth_chart_order,
        age: player.age ?? null,
        years_exp: player.years_exp ?? null,
        rookie_year: player.rookie_year ?? null,
    };
};

/** @deprecated Use filterSleeperPlayersToArray */
export const filterEligibleSleeperPlayers = filterSleeperPlayersToArray;

export async function fetchSleeperNflPlayers() {
    const response = await fetch(SLEEPER_NFL_PLAYERS_URL);
    if (!response.ok) {
        throw new Error(`Sleeper API error: ${response.status}`);
    }

    const playersById = await response.json();
    return filterSleeperPlayersToArray(playersById);
}

export function loadSleeperPlayersFromCache() {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (!cached) return [];
        return JSON.parse(cached);
    } catch (error) {
        console.error('Error loading Sleeper player cache:', error);
        return [];
    }
}

export function saveSleeperPlayersToCache(players) {
    localStorage.setItem(CACHE_KEY, JSON.stringify(players));
    localStorage.setItem(LAST_UPDATE_KEY, new Date().toISOString());
}

export function shouldRefreshSleeperCache() {
    const lastUpdate = localStorage.getItem(LAST_UPDATE_KEY);
    if (!lastUpdate) return true;
    return Date.now() - new Date(lastUpdate).getTime() >= CACHE_TTL_MS;
}

export async function getSleeperNflPlayers({ forceRefresh = false } = {}) {
    if (!forceRefresh && !shouldRefreshSleeperCache()) {
        const cached = loadSleeperPlayersFromCache();
        if (cached.length) return cached;
    }

    try {
        const players = await fetchSleeperNflPlayers();
        saveSleeperPlayersToCache(players);
        return players;
    } catch (error) {
        console.error('Error fetching Sleeper NFL players:', error);
        const cached = loadSleeperPlayersFromCache();
        if (cached.length) return cached;
        throw error;
    }
}

export {
    OFFENSIVE_POSITIONS,
    DEFENSIVE_POSITIONS,
    EXCLUDED_POSITIONS,
    ELIGIBLE_POSITIONS,
    SLEEPER_NFL_PLAYERS_URL,
};
