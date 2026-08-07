/**
 * NFL team schedule — schedules/nfl_2026 (1 Firestore read) + localStorage cache.
 * Separate from fantasy league schedule helpers in scheduleService.js.
 */
import { doc, getDoc } from 'firebase/firestore';
import { getModularFirestore } from '../config/firebaseModular.js';

export const SCHEDULES_COLLECTION = 'schedules';
export const NFL_SCHEDULE_DOC_ID = 'nfl_2026';
export const NFL_SCHEDULE_CACHE_KEY = 'nfl_schedule_2026_v1';
export const NFL_SCHEDULE_CACHE_STALE_MS = 12 * 60 * 60 * 1000; // 12 hours

const FREE_AGENT_TEAMS = new Set([
    '',
    'FA',
    'FREE',
    'FREE AGENT',
    'FREEAGENT',
    'NONE',
    'N/A',
    'NA',
    'NULL',
    'UNDEFINED',
]);

/** Normalize player.team / nflTeam for schedule lookup. */
export const normalizeNflTeamAbbr = (team) => {
    if (team == null) return null;
    const abbr = String(team).trim().toUpperCase();
    if (!abbr || FREE_AGENT_TEAMS.has(abbr)) return null;
    // Legacy / alternate abbreviations → Sleeper keys used in schedules/nfl_2026
    if (abbr === 'WSH' || abbr === 'WFT') return 'WAS';
    if (abbr === 'LA') return 'LAR';
    if (abbr === 'JAC') return 'JAX';
    if (abbr === 'OAK') return 'LV';
    return abbr;
};

export const isFreeAgentTeam = (team) => normalizeNflTeamAbbr(team) == null;

let memoryCache = null; // { teams, byeWeeks, season, updatedAt, fetchedAt }

export const readScheduleFromCache = () => {
    try {
        if (memoryCache?.teams && Number.isFinite(memoryCache.fetchedAt)) {
            const ageMs = Date.now() - memoryCache.fetchedAt;
            if (ageMs >= 0 && ageMs <= NFL_SCHEDULE_CACHE_STALE_MS) {
                return memoryCache;
            }
        }

        const raw = localStorage.getItem(NFL_SCHEDULE_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const fetchedAt = Number(parsed?.fetchedAt);
        const teams = parsed?.teams && typeof parsed.teams === 'object' ? parsed.teams : null;
        if (!teams || !Number.isFinite(fetchedAt)) return null;

        const ageMs = Date.now() - fetchedAt;
        if (ageMs < 0 || ageMs > NFL_SCHEDULE_CACHE_STALE_MS) {
            return null;
        }

        memoryCache = {
            teams,
            byeWeeks: parsed.byeWeeks || {},
            season: parsed.season ?? 2026,
            updatedAt: parsed.updatedAt || null,
            fetchedAt,
            ageMs,
        };
        return memoryCache;
    } catch (error) {
        console.warn('Failed to read NFL schedule cache:', error);
        return null;
    }
};

export const writeScheduleToCache = (payload) => {
    const fetchedAt = Date.now();
    const entry = {
        teams: payload.teams || {},
        byeWeeks: payload.byeWeeks || {},
        season: payload.season ?? 2026,
        updatedAt: payload.updatedAt || null,
        fetchedAt,
    };
    memoryCache = entry;
    try {
        localStorage.setItem(NFL_SCHEDULE_CACHE_KEY, JSON.stringify(entry));
    } catch (error) {
        console.warn('Failed to write NFL schedule cache:', error);
    }
    return entry;
};

/**
 * One Firestore document read: schedules/nfl_2026 (modular SDK).
 * Returns null if missing.
 */
export const fetchNflScheduleFromFirestore = async (db = null) => {
    const firestore = db || getModularFirestore();
    if (!firestore) return null;

    const snap = await getDoc(doc(firestore, SCHEDULES_COLLECTION, NFL_SCHEDULE_DOC_ID));
    if (!snap.exists()) return null;

    const data = snap.data() || {};
    const teams = data.teams && typeof data.teams === 'object' ? data.teams : {};
    return {
        teams,
        byeWeeks: data.byeWeeks || {},
        season: data.season ?? 2026,
        updatedAt: data.updatedAt || null,
        gameCount: data.gameCount ?? null,
        source: data.source || null,
    };
};

/**
 * Load master NFL schedule (cache first, then Firestore).
 * @returns {Promise<{teams: Object, byeWeeks: Object, season: number, updatedAt: string|null}|null>}
 */
export const loadNflSchedule = async ({ forceRefresh = false } = {}) => {
    if (!forceRefresh) {
        const cached = readScheduleFromCache();
        if (cached?.teams && Object.keys(cached.teams).length) {
            return cached;
        }
    }

    try {
        const remote = await fetchNflScheduleFromFirestore();
        if (remote?.teams && Object.keys(remote.teams).length) {
            return writeScheduleToCache(remote);
        }
    } catch (error) {
        console.error('Error loading schedules/nfl_2026:', error);
        const stale = readScheduleFromCache();
        if (stale?.teams) return stale;
        throw error;
    }

    return null;
};

/** Matchups for one NFL team abbreviation (Sleeper-standard). */
export const getTeamMatchups = (schedule, teamAbbr) => {
    const abbr = normalizeNflTeamAbbr(teamAbbr);
    if (!abbr || !schedule?.teams) return [];
    const matchups = schedule.teams[abbr];
    return Array.isArray(matchups) ? matchups : [];
};

export const getTeamByeWeek = (schedule, teamAbbr) => {
    const abbr = normalizeNflTeamAbbr(teamAbbr);
    if (!abbr || !schedule?.byeWeeks) return null;
    const bye = schedule.byeWeeks[abbr];
    return typeof bye === 'number' ? bye : null;
};
