/**
 * Background Fantasy Scoring Engine
 * Fetches live weekly stats from the Sleeper API, scores active starters
 * against a league's custom scoringRules, and returns a clean team total.
 */

const SLEEPER_STATE_URL = 'https://api.sleeper.app/v1/state/nfl';
const SLEEPER_STATS_URL = 'https://api.sleeper.app/v1/stats/nfl/{season_type}/{season}/{week}';
const SLEEPER_PROJECTIONS_URL = 'https://api.sleeper.app/v1/projections/nfl/{season_type}/{season}/{week}';
const SLEEPER_PLAYERS_URL = 'https://api.sleeper.app/v1/players/nfl';

const STATS_CACHE_TTL_MS = 60 * 1000; // 1 minute for live scoring
const PLAYERS_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const PROJECTIONS_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const PROJECTIONS_CACHE_KEY = 'sleeper_week_projections_v1';

const METADATA_KEYS = new Set([
    'player_id', 'team', 'opponent', 'company', 'category', 'game_id',
    'date', 'week', 'season', 'season_type', 'sport', 'updated_at',
]);

let projectionsMemoryCache = {
    key: null,
    fetchedAt: 0,
    byPlayer: null,
    weekContext: null,
};

/**
 * Map Sleeper raw weekly stat keys → league scoringRules keys.
 * Values are either a scoringRules key string, or a function(stats, rules) for bonuses.
 */
const SLEEPER_TO_RULE_MULTIPLIERS = [
    // Passing
    { sleeper: 'pass_td', rule: 'passTd' },
    { sleeper: 'pass_yd', rule: 'passYard' },
    { sleeper: 'pass_cmp', rule: 'completion' },
    { sleeper: 'pass_int', rule: 'interception' },
    { sleeper: 'pass_sack', rule: 'sack' },

    // Rushing
    { sleeper: 'rush_td', rule: 'rushTd' },
    { sleeper: 'rush_yd', rule: 'rushRecYard' },

    // Receiving
    { sleeper: 'rec_td', rule: 'recTd' },
    { sleeper: 'rec_yd', rule: 'rushRecYard' },
    { sleeper: 'rec', rule: 'reception' },

    // Turnovers / misc offense
    { sleeper: 'fum_lost', rule: 'fumble' },
    { sleeper: 'fum', rule: 'fumble' },
    { sleeper: 'fum_rec', rule: 'fumbleRecovery' },
    { sleeper: 'two_pt', rule: 'twoPointConversion' },

    // Returns / ST TDs
    { sleeper: 'kr_td', rule: 'returnTd' },
    { sleeper: 'pr_td', rule: 'returnTd' },
    { sleeper: 'st_td', rule: 'returnTd' },
    { sleeper: 'def_st_td', rule: 'defensiveStTd' },
    { sleeper: 'def_td', rule: 'defensiveStTd' },
    { sleeper: 'kr_yd', rule: 'returnYardDefSt' },
    { sleeper: 'pr_yd', rule: 'returnYardDefSt' },

    // Kicking
    { sleeper: 'xpm', rule: 'extraPoint' },
    { sleeper: 'xp_made', rule: 'extraPoint' },
    { sleeper: 'fgm', rule: 'fg39Less' }, // fallback if distance buckets missing
    { sleeper: 'fg_made', rule: 'fg39Less' },
    { sleeper: 'fgm_0_19', rule: 'fg39Less' },
    { sleeper: 'fgm_20_29', rule: 'fg39Less' },
    { sleeper: 'fgm_30_39', rule: 'fg39Less' },
    { sleeper: 'fg_made_0_19', rule: 'fg39Less' },
    { sleeper: 'fg_made_20_29', rule: 'fg39Less' },
    { sleeper: 'fg_made_30_39', rule: 'fg39Less' },
    { sleeper: 'fgm_40_49', rule: 'fg40_49' },
    { sleeper: 'fg_made_40_49', rule: 'fg40_49' },
    { sleeper: 'fgm_50p', rule: 'fg50Plus' },
    { sleeper: 'fg_made_50p', rule: 'fg50Plus' },
    { sleeper: 'fg_miss', rule: 'missedFgEp' },
    { sleeper: 'fg_missed', rule: 'missedFgEp' },
    { sleeper: 'xp_miss', rule: 'missedFgEp' },
    { sleeper: 'xp_missed', rule: 'missedFgEp' },

    // IDP
    { sleeper: 'idp_tkl', rule: 'tackle' },
    { sleeper: 'idp_solo', rule: 'tackle' },
    { sleeper: 'idp_ast', rule: 'assistedTackle' },
    { sleeper: 'idp_tkl_loss', rule: 'tackleForLoss' },
    { sleeper: 'idp_sack', rule: 'tackleForLoss' },
    { sleeper: 'idp_qb_hit', rule: 'tackleForLoss' },
    { sleeper: 'idp_int', rule: 'interceptionDef' },
    { sleeper: 'idp_ff', rule: 'forcedFumble' },
    { sleeper: 'idp_fum_rec', rule: 'fumbleRecoveryDef' },
    { sleeper: 'idp_pass_def', rule: 'passDefended' },
    { sleeper: 'idp_pd', rule: 'passDefended' },
    { sleeper: 'idp_td', rule: 'defensiveStTd' },
    { sleeper: 'idp_blk_kick', rule: 'defensiveStTd' },

    // Team DST
    { sleeper: 'sack', rule: 'dstSack' },
    { sleeper: 'int', rule: 'dstInterception' },
    { sleeper: 'fum_rec', rule: 'dstFumbleRecovery' },
    { sleeper: 'def_td', rule: 'dstTouchdown' },
    { sleeper: 'safe', rule: 'dstSafety' },
    { sleeper: 'pts_allow', rule: 'dstPointsAllowed' },
];

const roundPoints = (value) => Math.round((Number(value) || 0) * 100) / 100;

const safeNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

/**
 * Fetch current NFL week/season context from Sleeper.
 */
export async function fetchSleeperNflState() {
    const response = await fetch(SLEEPER_STATE_URL, { method: 'GET' });
    if (!response.ok) {
        throw new Error(`Sleeper state API failed: ${response.status} ${response.statusText}`);
    }
    const state = await response.json();
    return {
        season: String(state.season || new Date().getFullYear()),
        week: Number(state.week || 1),
        seasonType: state.season_type || 'regular',
        displayWeek: Number(state.display_week || state.week || 1),
    };
}

/**
 * Fetch all player weekly stats for a given NFL week from Sleeper.
 * Returns a map: { [playerId]: { ...rawStats } }
 */
export async function fetchSleeperWeekStats({
    seasonType = 'regular',
    season,
    week,
} = {}) {
    if (!season || week == null) {
        throw new Error('season and week are required to fetch Sleeper weekly stats');
    }

    const url = SLEEPER_STATS_URL
        .replace('{season_type}', encodeURIComponent(seasonType))
        .replace('{season}', encodeURIComponent(String(season)))
        .replace('{week}', encodeURIComponent(String(week)));

    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) {
        throw new Error(`Sleeper stats API failed: ${response.status} ${response.statusText}`);
    }

    const payload = await response.json();
    if (!payload || typeof payload !== 'object') {
        throw new Error('Sleeper stats API returned an unexpected payload');
    }

    // Normalize to { playerId: statsObject }
    const byPlayer = {};
    if (Array.isArray(payload)) {
        payload.forEach((record) => {
            if (record && record.player_id != null) {
                byPlayer[String(record.player_id)] = record;
            }
        });
    } else {
        Object.entries(payload).forEach(([playerId, record]) => {
            if (record && typeof record === 'object') {
                byPlayer[String(playerId)] = record;
            }
        });
    }

    return byPlayer;
}

/**
 * Pull the raw projected-stat object from a Sleeper projection record.
 */
export function extractProjectedStats(record) {
    if (!record || typeof record !== 'object') return {};
    if (record.stats && typeof record.stats === 'object') {
        return record.stats;
    }
    const projected = {};
    Object.entries(record).forEach(([key, value]) => {
        if (METADATA_KEYS.has(key)) return;
        if (typeof value === 'number') {
            projected[key] = value;
        }
    });
    return projected;
}

/**
 * Fetch Sleeper weekly projections for a given NFL week.
 * Returns { [playerId]: projectedStatsObject }
 */
export async function fetchSleeperWeekProjections({
    seasonType = 'regular',
    season,
    week,
} = {}) {
    if (!season || week == null) {
        throw new Error('season and week are required to fetch Sleeper weekly projections');
    }

    const url = SLEEPER_PROJECTIONS_URL
        .replace('{season_type}', encodeURIComponent(seasonType))
        .replace('{season}', encodeURIComponent(String(season)))
        .replace('{week}', encodeURIComponent(String(week)));

    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) {
        throw new Error(`Sleeper projections API failed: ${response.status} ${response.statusText}`);
    }

    const payload = await response.json();
    if (!payload || typeof payload !== 'object') {
        throw new Error('Sleeper projections API returned an unexpected payload');
    }

    const byPlayer = {};
    if (Array.isArray(payload)) {
        payload.forEach((record) => {
            if (record && record.player_id != null) {
                byPlayer[String(record.player_id)] = extractProjectedStats(record);
            }
        });
    } else {
        Object.entries(payload).forEach(([playerId, record]) => {
            if (record && typeof record === 'object') {
                byPlayer[String(playerId)] = extractProjectedStats(record);
            }
        });
    }

    return byPlayer;
}

/**
 * Score one player's weekly projected stats with league scoring rules.
 * Returns 0 when projections are missing.
 */
export function getWeeklyProjectedPoints(playerId, projectionsByPlayer = {}, scoringRules = {}) {
    if (!playerId) return 0;
    const projectedStats = projectionsByPlayer[String(playerId)];
    if (!projectedStats || typeof projectedStats !== 'object') return 0;
    const scored = calculatePlayerPointsFromSleeperStats(projectedStats, scoringRules);
    return Number.isFinite(scored.points) ? scored.points : 0;
}

/**
 * Load current-week Sleeper projections (memory + localStorage, 30-min stale time).
 */
export async function getCachedWeekProjections({ forceRefresh = false } = {}) {
    const now = Date.now();
    if (
        !forceRefresh
        && projectionsMemoryCache.byPlayer
        && projectionsMemoryCache.key
        && now - projectionsMemoryCache.fetchedAt < PROJECTIONS_CACHE_TTL_MS
    ) {
        return {
            weekContext: projectionsMemoryCache.weekContext,
            projectionsByPlayer: projectionsMemoryCache.byPlayer,
        };
    }

    if (!forceRefresh && typeof localStorage !== 'undefined') {
        try {
            const raw = localStorage.getItem(PROJECTIONS_CACHE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                const age = now - Number(parsed?.fetchedAt || 0);
                if (
                    parsed?.projectionsByPlayer
                    && parsed?.weekContext
                    && age >= 0
                    && age < PROJECTIONS_CACHE_TTL_MS
                ) {
                    projectionsMemoryCache = {
                        key: `${parsed.weekContext.season}_${parsed.weekContext.seasonType}_${parsed.weekContext.week}`,
                        fetchedAt: Number(parsed.fetchedAt),
                        byPlayer: parsed.projectionsByPlayer,
                        weekContext: parsed.weekContext,
                    };
                    return {
                        weekContext: parsed.weekContext,
                        projectionsByPlayer: parsed.projectionsByPlayer,
                    };
                }
            }
        } catch (error) {
            console.warn('Failed to read weekly projections cache:', error);
        }
    }

    const weekContext = await fetchSleeperNflState();
    const projectionsByPlayer = await fetchSleeperWeekProjections({
        seasonType: weekContext.seasonType,
        season: weekContext.season,
        week: weekContext.week,
    });

    projectionsMemoryCache = {
        key: `${weekContext.season}_${weekContext.seasonType}_${weekContext.week}`,
        fetchedAt: now,
        byPlayer: projectionsByPlayer,
        weekContext,
    };

    if (typeof localStorage !== 'undefined') {
        try {
            localStorage.setItem(
                PROJECTIONS_CACHE_KEY,
                JSON.stringify({
                    fetchedAt: now,
                    weekContext,
                    projectionsByPlayer,
                })
            );
        } catch (error) {
            console.warn('Failed to write weekly projections cache:', error);
        }
    }

    return { weekContext, projectionsByPlayer };
}

/**
 * Extract active starter player IDs from roster.lineup.
 * Supports object lineups ({ QB1: '123', RB1: '456' }) and arrays.
 */
export function getActiveStarters(lineup) {
    if (!lineup) return [];

    if (Array.isArray(lineup)) {
        return lineup
            .filter(Boolean)
            .map((playerId) => String(playerId));
    }

    if (typeof lineup === 'object') {
        return Object.entries(lineup)
            .filter(([, playerId]) => Boolean(playerId))
            .map(([slot, playerId]) => ({
                slot,
                playerId: String(playerId),
            }));
    }

    return [];
}

/**
 * Apply yardage bonuses that depend on totals rather than per-unit multipliers.
 */
function applyYardageBonuses(stats, scoringRules) {
    let bonus = 0;
    const passYds = safeNumber(stats.pass_yd);
    const rushYds = safeNumber(stats.rush_yd);
    const recYds = safeNumber(stats.rec_yd);

    if (passYds >= 300) bonus += safeNumber(scoringRules.pass300YardBonus);
    if (passYds >= 400) bonus += safeNumber(scoringRules.pass400YardBonus);

    // Rush and receiving bonuses are applied independently when each reaches the threshold
    if (rushYds >= 100) bonus += safeNumber(scoringRules.rushRec100YardBonus);
    if (rushYds >= 200) bonus += safeNumber(scoringRules.rushRec200YardBonus);
    if (recYds >= 100) bonus += safeNumber(scoringRules.rushRec100YardBonus);
    if (recYds >= 200) bonus += safeNumber(scoringRules.rushRec200YardBonus);

    return bonus;
}

/**
 * Score one player's Sleeper weekly stats against custom scoringRules.
 */
export function calculatePlayerPointsFromSleeperStats(rawStats, scoringRules = {}) {
    if (!rawStats || typeof rawStats !== 'object') {
        return { points: 0, breakdown: {}, missing: true };
    }
    if (!scoringRules || typeof scoringRules !== 'object') {
        return { points: 0, breakdown: {}, missingRules: true };
    }

    const breakdown = {};
    let points = 0;
    const usedSleeperKeys = new Set();

    // Prefer distance-bucket FG keys over generic fgm when both exist
    const hasFgBuckets = [
        'fgm_0_19', 'fgm_20_29', 'fgm_30_39', 'fgm_40_49', 'fgm_50p',
        'fg_made_0_19', 'fg_made_20_29', 'fg_made_30_39', 'fg_made_40_49', 'fg_made_50p',
    ].some((key) => safeNumber(rawStats[key]) > 0);

    for (const mapping of SLEEPER_TO_RULE_MULTIPLIERS) {
        const { sleeper, rule } = mapping;

        // Skip generic FG made if distance buckets are present
        if (hasFgBuckets && (sleeper === 'fgm' || sleeper === 'fg_made')) {
            continue;
        }

        // Avoid double-counting fum vs fum_lost (prefer fum_lost)
        if (sleeper === 'fum' && rawStats.fum_lost != null) {
            continue;
        }

        const ruleValue = scoringRules[rule];
        if (ruleValue == null) continue;

        const statValue = safeNumber(rawStats[sleeper]);
        if (statValue === 0) continue;

        const earned = statValue * safeNumber(ruleValue);
        points += earned;
        usedSleeperKeys.add(sleeper);
        breakdown[rule] = roundPoints((breakdown[rule] || 0) + earned);
    }

    const bonus = applyYardageBonuses(rawStats, scoringRules);
    if (bonus !== 0) {
        points += bonus;
        breakdown.yardageBonuses = roundPoints(bonus);
    }

    return {
        points: roundPoints(points),
        breakdown,
        usedSleeperKeys: [...usedSleeperKeys],
        missing: false,
    };
}

/**
 * Calculate a team's weekly fantasy score from active starters + Sleeper stats.
 *
 * @param {Object} options
 * @param {Object|Array} options.lineup - team.roster.lineup
 * @param {Object} options.scoringRules - league.settings.scoringRules
 * @param {Object} [options.weekStats] - optional pre-fetched Sleeper week stats map
 * @param {Object} [options.playerMeta] - optional { [playerId]: { name, position, team } }
 * @param {number} [options.week]
 * @param {string|number} [options.season]
 * @param {string} [options.seasonType]
 * @returns {Promise<{ totalScore: number, week: number, season: string, players: Array, errors: Array }>}
 */
export async function calculateTeamWeeklyScore({
    lineup,
    scoringRules,
    weekStats = null,
    playerMeta = {},
    week = null,
    season = null,
    seasonType = null,
} = {}) {
    const errors = [];
    let weekContext;

    try {
        if (week != null && season != null) {
            weekContext = {
                week: Number(week),
                season: String(season),
                seasonType: seasonType || 'regular',
            };
        } else {
            weekContext = await fetchSleeperNflState();
        }
    } catch (error) {
        return {
            totalScore: 0,
            week: week || null,
            season: season || null,
            seasonType: seasonType || null,
            players: [],
            errors: [`Failed to resolve NFL week: ${error.message}`],
        };
    }

    let statsByPlayer = weekStats;
    if (!statsByPlayer) {
        try {
            statsByPlayer = await fetchSleeperWeekStats({
                seasonType: weekContext.seasonType,
                season: weekContext.season,
                week: weekContext.week,
            });
        } catch (error) {
            return {
                totalScore: 0,
                week: weekContext.week,
                season: weekContext.season,
                seasonType: weekContext.seasonType,
                players: [],
                errors: [`Failed to fetch Sleeper weekly stats: ${error.message}`],
            };
        }
    }

    const starters = getActiveStarters(lineup);
    const players = [];
    let totalScore = 0;

    // Normalize starters to { slot, playerId }
    const starterEntries = starters.map((entry, index) => {
        if (typeof entry === 'string') {
            return { slot: `slot${index + 1}`, playerId: entry };
        }
        return entry;
    });

    for (const { slot, playerId } of starterEntries) {
        const rawStats = statsByPlayer[playerId];
        const meta = playerMeta[playerId] || {};

        if (!rawStats) {
            errors.push(`No Sleeper stats found for starter ${playerId} (${slot})`);
            players.push({
                slot,
                playerId,
                name: meta.name || null,
                position: meta.position || null,
                nflTeam: meta.team || meta.nflTeam || null,
                points: 0,
                stats: null,
                missingStats: true,
            });
            continue;
        }

        try {
            const scored = calculatePlayerPointsFromSleeperStats(rawStats, scoringRules);
            totalScore += scored.points;
            players.push({
                slot,
                playerId,
                name: meta.name || null,
                position: meta.position || null,
                nflTeam: meta.team || meta.nflTeam || rawStats.team || null,
                points: scored.points,
                breakdown: scored.breakdown,
                stats: rawStats,
                missingStats: false,
            });
        } catch (error) {
            errors.push(`Failed scoring player ${playerId}: ${error.message}`);
            players.push({
                slot,
                playerId,
                name: meta.name || null,
                position: meta.position || null,
                points: 0,
                error: error.message,
            });
        }
    }

    return {
        totalScore: roundPoints(totalScore),
        week: weekContext.week,
        season: weekContext.season,
        seasonType: weekContext.seasonType,
        players,
        errors,
    };
}

class BackgroundScoringSystem {
    constructor() {
        this.isRunning = false;
        this.updateInterval = null;
        this.currentWeek = null;
        this.activeLeagues = new Map();
        this.weekStatsCache = null;
        this.weekStatsCacheKey = null;
        this.weekStatsCachedAt = 0;
        this.playerMetaCache = null;
        this.playerMetaCachedAt = 0;
        this.lastUpdate = null;
        this.db = null;
    }

    start(db, leagues = []) {
        if (this.isRunning) {
            console.log('Background scoring already running');
            return;
        }

        this.db = db;
        this.isRunning = true;
        leagues.forEach((league) => this.activeLeagues.set(league.id, league));
        console.log('Starting Sleeper-backed fantasy scoring system...');
        this.startAutomaticUpdates();
    }

    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        this.isRunning = false;
        console.log('Background scoring system stopped');
    }

    startAutomaticUpdates() {
        this.updateAllLeagueScores();
        this.updateInterval = setInterval(() => {
            this.updateAllLeagueScores();
        }, 30000);
    }

    async getCachedWeekStats() {
        const now = Date.now();
        if (
            this.weekStatsCache
            && this.weekStatsCacheKey
            && now - this.weekStatsCachedAt < STATS_CACHE_TTL_MS
        ) {
            return {
                weekContext: this.weekStatsCacheKey,
                weekStats: this.weekStatsCache,
            };
        }

        const weekContext = await fetchSleeperNflState();
        const weekStats = await fetchSleeperWeekStats({
            seasonType: weekContext.seasonType,
            season: weekContext.season,
            week: weekContext.week,
        });

        this.weekStatsCache = weekStats;
        this.weekStatsCacheKey = weekContext;
        this.weekStatsCachedAt = now;
        this.currentWeek = weekContext.week;

        return { weekContext, weekStats };
    }

    async getPlayerMetaMap() {
        const now = Date.now();
        if (this.playerMetaCache && now - this.playerMetaCachedAt < PLAYERS_CACHE_TTL_MS) {
            return this.playerMetaCache;
        }

        try {
            const response = await fetch(SLEEPER_PLAYERS_URL);
            if (!response.ok) {
                throw new Error(`Sleeper players API failed: ${response.status}`);
            }
            const players = await response.json();
            const meta = {};
            Object.entries(players || {}).forEach(([playerId, player]) => {
                meta[String(playerId)] = {
                    name: `${player.first_name || ''} ${player.last_name || ''}`.trim() || null,
                    position: player.position || null,
                    team: player.team || null,
                };
            });
            this.playerMetaCache = meta;
            this.playerMetaCachedAt = now;
            return meta;
        } catch (error) {
            console.error('Failed to load Sleeper player metadata:', error);
            return this.playerMetaCache || {};
        }
    }

    async updateAllLeagueScores() {
        try {
            console.log('Updating fantasy scores for all leagues via Sleeper...');
            const { weekContext, weekStats } = await this.getCachedWeekStats();
            const playerMeta = await this.getPlayerMetaMap();

            for (const [leagueId, league] of this.activeLeagues) {
                await this.updateLeagueScores(leagueId, league, weekContext, weekStats, playerMeta);
            }

            this.lastUpdate = new Date();
            console.log('Fantasy score update completed at:', this.lastUpdate);
        } catch (error) {
            console.error('Error updating fantasy scores:', error);
        }
    }

    async updateLeagueScores(leagueId, league, weekContext, weekStats, playerMeta) {
        try {
            if (!this.db) {
                throw new Error('Firestore db is not initialized');
            }

            const teamsSnapshot = await this.db.collection(`leagues/${leagueId}/teams`).limit(50).get();
            const teams = teamsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
            const scoringRules = league.settings?.scoringRules || {};

            for (const team of teams) {
                await this.updateTeamScore(
                    leagueId,
                    team,
                    scoringRules,
                    weekContext,
                    weekStats,
                    playerMeta,
                );
            }
        } catch (error) {
            console.error(`Error updating scores for league ${leagueId}:`, error);
        }
    }

    /**
     * Score one team and optionally persist currentScore to Firestore.
     */
    async updateTeamScore(leagueId, team, scoringRules, weekContext, weekStats, playerMeta) {
        try {
            const result = await calculateTeamWeeklyScore({
                lineup: team.roster?.lineup,
                scoringRules,
                weekStats,
                playerMeta,
                week: weekContext.week,
                season: weekContext.season,
                seasonType: weekContext.seasonType,
            });

            const teamScore = {
                totalPoints: result.totalScore,
                week: result.week,
                season: result.season,
                seasonType: result.seasonType,
                players: result.players.reduce((acc, player) => {
                    acc[player.slot] = {
                        playerId: player.playerId,
                        name: player.name,
                        position: player.position,
                        nflTeam: player.nflTeam,
                        points: player.points,
                        breakdown: player.breakdown || {},
                        missingStats: Boolean(player.missingStats),
                    };
                    return acc;
                }, {}),
                errors: result.errors,
                lastUpdated: new Date().toISOString(),
            };

            if (this.db && leagueId && team.id) {
                // Live mid-week scores only — standings/pointsFor are finalized on Tuesdays
                await this.db.doc(`leagues/${leagueId}/teams/${team.id}`).set({
                    liveScore: teamScore,
                    lastLiveScoreUpdate: new Date().toISOString(),
                }, { merge: true });
            }

            console.log(
                `Updated ${team.teamName || team.name || team.id}: ${result.totalScore} points`
                + (result.errors.length ? ` (${result.errors.length} warnings)` : ''),
            );

            return {
                totalScore: result.totalScore,
                teamScore,
                errors: result.errors,
            };
        } catch (error) {
            console.error(`Error updating score for team ${team?.id}:`, error);
            return {
                totalScore: 0,
                teamScore: null,
                errors: [error.message],
            };
        }
    }

    /**
     * One-shot helper: score a single team without starting the interval loop.
     */
    async scoreTeamOnce({
        lineup,
        scoringRules,
        week = null,
        season = null,
        seasonType = null,
    }) {
        return calculateTeamWeeklyScore({
            lineup,
            scoringRules,
            week,
            season,
            seasonType,
            playerMeta: await this.getPlayerMetaMap(),
        });
    }

    addLeague(league) {
        this.activeLeagues.set(league.id, league);
        console.log(`Added league ${league.id} to background scoring`);
    }

    removeLeague(leagueId) {
        this.activeLeagues.delete(leagueId);
        console.log(`Removed league ${leagueId} from background scoring`);
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            activeLeagues: this.activeLeagues.size,
            lastUpdate: this.lastUpdate,
            currentWeek: this.currentWeek,
            weekStatsCached: Boolean(this.weekStatsCache),
        };
    }

    clearCache() {
        this.weekStatsCache = null;
        this.weekStatsCacheKey = null;
        this.weekStatsCachedAt = 0;
        this.playerMetaCache = null;
        this.playerMetaCachedAt = 0;
        console.log('Scoring caches cleared');
    }
}

const backgroundScoring = new BackgroundScoringSystem();

if (typeof window !== 'undefined') {
    window.backgroundScoring = backgroundScoring;
}

export { BackgroundScoringSystem };
export default backgroundScoring;
