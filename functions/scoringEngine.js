/**
 * Sleeper-backed fantasy scoring for Cloud Functions.
 * Used to finalize weekly standings every Tuesday.
 */

const SLEEPER_STATE_URL = 'https://api.sleeper.app/v1/state/nfl';
const SLEEPER_STATS_URL = 'https://api.sleeper.app/v1/stats/nfl/{season_type}/{season}/{week}';

const SLEEPER_TO_RULE_MULTIPLIERS = [
    { sleeper: 'pass_td', rule: 'passTd' },
    { sleeper: 'pass_yd', rule: 'passYard' },
    { sleeper: 'pass_cmp', rule: 'completion' },
    { sleeper: 'pass_int', rule: 'interception' },
    { sleeper: 'pass_sack', rule: 'sack' },
    { sleeper: 'rush_td', rule: 'rushTd' },
    { sleeper: 'rush_yd', rule: 'rushRecYard' },
    { sleeper: 'rec_td', rule: 'recTd' },
    { sleeper: 'rec_yd', rule: 'rushRecYard' },
    { sleeper: 'rec', rule: 'reception' },
    { sleeper: 'fum_lost', rule: 'fumble' },
    { sleeper: 'fum', rule: 'fumble' },
    { sleeper: 'fum_rec', rule: 'fumbleRecovery' },
    { sleeper: 'two_pt', rule: 'twoPointConversion' },
    { sleeper: 'kr_td', rule: 'returnTd' },
    { sleeper: 'pr_td', rule: 'returnTd' },
    { sleeper: 'st_td', rule: 'returnTd' },
    { sleeper: 'def_st_td', rule: 'defensiveStTd' },
    { sleeper: 'def_td', rule: 'defensiveStTd' },
    { sleeper: 'kr_yd', rule: 'returnYardDefSt' },
    { sleeper: 'pr_yd', rule: 'returnYardDefSt' },
    { sleeper: 'xpm', rule: 'extraPoint' },
    { sleeper: 'xp_made', rule: 'extraPoint' },
    { sleeper: 'fgm', rule: 'fg39Less' },
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
    { sleeper: 'idp_tkl', rule: 'tackle' },
    { sleeper: 'idp_solo', rule: 'tackle' },
    { sleeper: 'idp_ast', rule: 'assistedTackle' },
    { sleeper: 'idp_tkl_loss', rule: 'tackleForLoss' },
    { sleeper: 'idp_sack', rule: 'tackleForLoss' },
    { sleeper: 'idp_int', rule: 'interceptionDef' },
    { sleeper: 'idp_ff', rule: 'forcedFumble' },
    { sleeper: 'idp_fum_rec', rule: 'fumbleRecoveryDef' },
    { sleeper: 'idp_pass_def', rule: 'passDefended' },
    { sleeper: 'idp_pd', rule: 'passDefended' },
    { sleeper: 'idp_td', rule: 'defensiveStTd' },
    { sleeper: 'sack', rule: 'dstSack' },
    { sleeper: 'int', rule: 'dstInterception' },
    { sleeper: 'safe', rule: 'dstSafety' },
    { sleeper: 'pts_allow', rule: 'dstPointsAllowed' },
];

const roundPoints = (value) => Math.round((Number(value) || 0) * 100) / 100;
const safeNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Request failed (${response.status}): ${url}`);
    }
    return response.json();
}

async function fetchSleeperNflState() {
    const state = await fetchJson(SLEEPER_STATE_URL);
    return {
        season: String(state.season || new Date().getFullYear()),
        week: Number(state.week || 1),
        seasonType: state.season_type || 'regular',
    };
}

/**
 * For Tuesday finalize: score the prior completed NFL week.
 * If Sleeper week is N, games for week N-1 just finished over the weekend.
 */
function resolveFinalizationWeek(state, overrideWeek = null) {
    if (overrideWeek != null) {
        return {
            ...state,
            week: Number(overrideWeek),
        };
    }

    const completedWeek = Math.max(1, Number(state.week || 1) - 1);
    return {
        ...state,
        week: completedWeek,
    };
}

async function fetchSleeperWeekStats({ seasonType, season, week }) {
    const url = SLEEPER_STATS_URL
        .replace('{season_type}', encodeURIComponent(seasonType))
        .replace('{season}', encodeURIComponent(String(season)))
        .replace('{week}', encodeURIComponent(String(week)));

    const payload = await fetchJson(url);
    const byPlayer = {};

    if (Array.isArray(payload)) {
        payload.forEach((record) => {
            if (record?.player_id != null) {
                byPlayer[String(record.player_id)] = record;
            }
        });
    } else if (payload && typeof payload === 'object') {
        Object.entries(payload).forEach(([playerId, record]) => {
            if (record && typeof record === 'object') {
                byPlayer[String(playerId)] = record;
            }
        });
    }

    return byPlayer;
}

function getActiveStarters(lineup) {
    if (!lineup) return [];
    if (Array.isArray(lineup)) {
        return lineup.filter(Boolean).map((playerId, index) => ({
            slot: `slot${index + 1}`,
            playerId: String(playerId),
        }));
    }
    if (typeof lineup === 'object') {
        return Object.entries(lineup)
            .filter(([, playerId]) => Boolean(playerId))
            .map(([slot, playerId]) => ({ slot, playerId: String(playerId) }));
    }
    return [];
}

function applyYardageBonuses(stats, scoringRules) {
    let bonus = 0;
    const passYds = safeNumber(stats.pass_yd);
    const rushYds = safeNumber(stats.rush_yd);
    const recYds = safeNumber(stats.rec_yd);

    if (passYds >= 300) bonus += safeNumber(scoringRules.pass300YardBonus);
    if (passYds >= 400) bonus += safeNumber(scoringRules.pass400YardBonus);
    if (rushYds >= 100) bonus += safeNumber(scoringRules.rushRec100YardBonus);
    if (rushYds >= 200) bonus += safeNumber(scoringRules.rushRec200YardBonus);
    if (recYds >= 100) bonus += safeNumber(scoringRules.rushRec100YardBonus);
    if (recYds >= 200) bonus += safeNumber(scoringRules.rushRec200YardBonus);
    return bonus;
}

function calculatePlayerPointsFromSleeperStats(rawStats, scoringRules = {}) {
    if (!rawStats || !scoringRules) {
        return { points: 0, missing: true };
    }

    let points = 0;
    const hasFgBuckets = [
        'fgm_0_19', 'fgm_20_29', 'fgm_30_39', 'fgm_40_49', 'fgm_50p',
        'fg_made_0_19', 'fg_made_20_29', 'fg_made_30_39', 'fg_made_40_49', 'fg_made_50p',
    ].some((key) => safeNumber(rawStats[key]) > 0);

    for (const mapping of SLEEPER_TO_RULE_MULTIPLIERS) {
        const { sleeper, rule } = mapping;
        if (hasFgBuckets && (sleeper === 'fgm' || sleeper === 'fg_made')) continue;
        if (sleeper === 'fum' && rawStats.fum_lost != null) continue;
        if (scoringRules[rule] == null) continue;

        const statValue = safeNumber(rawStats[sleeper]);
        if (statValue === 0) continue;
        points += statValue * safeNumber(scoringRules[rule]);
    }

    points += applyYardageBonuses(rawStats, scoringRules);
    return { points: roundPoints(points), missing: false };
}

function calculateTeamWeeklyScore({ lineup, scoringRules, weekStats }) {
    const starters = getActiveStarters(lineup);
    const players = {};
    let totalScore = 0;
    const errors = [];

    for (const { slot, playerId } of starters) {
        const rawStats = weekStats[playerId];
        if (!rawStats) {
            errors.push(`No stats for ${playerId} (${slot})`);
            players[slot] = { playerId, points: 0, missingStats: true };
            continue;
        }

        const scored = calculatePlayerPointsFromSleeperStats(rawStats, scoringRules);
        totalScore += scored.points;
        players[slot] = {
            playerId,
            points: scored.points,
            missingStats: false,
        };
    }

    return {
        totalScore: roundPoints(totalScore),
        players,
        errors,
    };
}

/**
 * Finalize all league standings for the completed NFL week.
 */
async function finalizeAllLeagueStandings(db, { week: overrideWeek = null } = {}) {
    const state = await fetchSleeperNflState();
    const weekContext = resolveFinalizationWeek(state, overrideWeek);
    const weekStats = await fetchSleeperWeekStats(weekContext);

    const leaguesSnapshot = await db.collection('leagues').get();
    const summary = {
        week: weekContext.week,
        season: weekContext.season,
        leaguesProcessed: 0,
        teamsUpdated: 0,
        errors: [],
    };

    for (const leagueDoc of leaguesSnapshot.docs) {
        const leagueId = leagueDoc.id;
        const league = leagueDoc.data() || {};
        const scoringRules = league.settings?.scoringRules || {};

        try {
            const teamsSnapshot = await db.collection(`leagues/${leagueId}/teams`).get();

            for (const teamDoc of teamsSnapshot.docs) {
                const team = teamDoc.data() || {};
                const result = calculateTeamWeeklyScore({
                    lineup: team.roster?.lineup,
                    scoringRules,
                    weekStats,
                });

                const previousPointsFor = safeNumber(team.standings?.pointsFor ?? team.pointsFor);
                const alreadyFinalizedWeek = team.standings?.week;
                const shouldAccumulate = alreadyFinalizedWeek !== weekContext.week;

                const nextPointsFor = shouldAccumulate
                    ? roundPoints(previousPointsFor + result.totalScore)
                    : roundPoints(previousPointsFor);

                await teamDoc.ref.set({
                    finalizedScore: {
                        totalPoints: result.totalScore,
                        week: weekContext.week,
                        season: weekContext.season,
                        seasonType: weekContext.seasonType,
                        players: result.players,
                        errors: result.errors,
                        finalizedAt: new Date().toISOString(),
                    },
                    standings: {
                        week: weekContext.week,
                        season: weekContext.season,
                        pointsFor: nextPointsFor,
                        pointsAgainst: safeNumber(team.standings?.pointsAgainst ?? team.pointsAgainst),
                        updatedAt: new Date().toISOString(),
                    },
                    pointsFor: nextPointsFor,
                    pointsAgainst: safeNumber(team.standings?.pointsAgainst ?? team.pointsAgainst),
                }, { merge: true });

                summary.teamsUpdated += 1;
            }

            await leagueDoc.ref.set({
                standingsMeta: {
                    lastFinalizedWeek: weekContext.week,
                    lastFinalizedSeason: weekContext.season,
                    updatedAt: new Date().toISOString(),
                },
            }, { merge: true });

            summary.leaguesProcessed += 1;
        } catch (error) {
            summary.errors.push({ leagueId, error: error.message });
        }
    }

    return summary;
}

module.exports = {
    fetchSleeperNflState,
    fetchSleeperWeekStats,
    calculateTeamWeeklyScore,
    finalizeAllLeagueStandings,
    resolveFinalizationWeek,
};
