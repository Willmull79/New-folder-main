/**
 * Fantasy season matchup schedule helpers.
 * Round-robin + bye support, randomize, swap, and manual edit.
 */

const shuffleArray = (items) => {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
};

/**
 * One full round-robin cycle (each team plays every other team once).
 * Odd team counts get a bye (awayTeamId null).
 */
export const generateRoundRobinRounds = (teamIds = []) => {
    const ids = (teamIds || []).filter(Boolean).map(String);
    if (ids.length < 2) return [];

    const rotating = [...ids];
    if (rotating.length % 2 === 1) {
        rotating.push(null); // bye slot
    }

    const n = rotating.length;
    const roundsCount = n - 1;
    const half = n / 2;
    const rounds = [];

    // Circle method: fix index 0, rotate the rest each round
    let circle = [...rotating];
    for (let round = 0; round < roundsCount; round++) {
        const matchups = [];
        for (let i = 0; i < half; i++) {
            const home = circle[i];
            const away = circle[n - 1 - i];
            if (!home && !away) continue;
            if (!home || !away) {
                matchups.push({
                    homeTeamId: home || away,
                    awayTeamId: null, // bye
                });
            } else {
                // Alternate home/away by round for fairness
                if (round % 2 === 0) {
                    matchups.push({ homeTeamId: home, awayTeamId: away });
                } else {
                    matchups.push({ homeTeamId: away, awayTeamId: home });
                }
            }
        }
        rounds.push(matchups);

        const fixed = circle[0];
        const rest = circle.slice(1);
        rest.unshift(rest.pop());
        circle = [fixed, ...rest];
    }

    return rounds;
};

/**
 * Build a season schedule of `numWeeks` from round-robin rounds.
 * Extra weeks recycle the round-robin (common for dynasty / long seasons).
 */
export const buildSeasonSchedule = (teamIds, numWeeks, { randomize = false } = {}) => {
    const weeksTarget = Math.max(1, Number(numWeeks) || 14);
    let order = (teamIds || []).filter(Boolean).map(String);
    if (randomize) {
        order = shuffleArray(order);
    }

    const rounds = generateRoundRobinRounds(order);
    if (!rounds.length) {
        return {
            weeks: [],
            numWeeks: weeksTarget,
            teamIds: order,
            generatedAt: new Date().toISOString(),
            mode: randomize ? 'random' : 'round_robin',
        };
    }

    let roundPool = rounds;
    if (randomize) {
        roundPool = shuffleArray(rounds.map((matchups) => shuffleArray(matchups)));
    }

    const weeks = [];
    for (let week = 1; week <= weeksTarget; week++) {
        const matchups = roundPool[(week - 1) % roundPool.length].map((m) => ({
            homeTeamId: m.homeTeamId,
            awayTeamId: m.awayTeamId,
        }));
        weeks.push({ week, matchups });
    }

    return {
        weeks,
        numWeeks: weeksTarget,
        teamIds: order,
        generatedAt: new Date().toISOString(),
        mode: randomize ? 'random' : 'round_robin',
    };
};

/** Empty weeks shell for fully manual schedule building. */
export const createEmptySchedule = (teamIds, numWeeks) => {
    const weeksTarget = Math.max(1, Number(numWeeks) || 14);
    const ids = (teamIds || []).filter(Boolean).map(String);
    const weeks = [];
    for (let week = 1; week <= weeksTarget; week++) {
        weeks.push({ week, matchups: [] });
    }
    return {
        weeks,
        numWeeks: weeksTarget,
        teamIds: ids,
        generatedAt: new Date().toISOString(),
        mode: 'manual',
    };
};

export const cloneSchedule = (schedule) => {
    if (!schedule) return null;
    return JSON.parse(JSON.stringify(schedule));
};

export const getWeekMatchups = (schedule, weekNumber) => {
    const week = schedule?.weeks?.find((entry) => Number(entry.week) === Number(weekNumber));
    return week?.matchups || [];
};

/**
 * Swap home/away inside one matchup.
 */
export const flipMatchupHomeAway = (schedule, weekNumber, matchupIndex) => {
    const next = cloneSchedule(schedule);
    const week = next?.weeks?.find((entry) => Number(entry.week) === Number(weekNumber));
    if (!week?.matchups?.[matchupIndex]) return schedule;
    const matchup = week.matchups[matchupIndex];
    if (!matchup.awayTeamId) return schedule; // bye — nothing to flip
    week.matchups[matchupIndex] = {
        homeTeamId: matchup.awayTeamId,
        awayTeamId: matchup.homeTeamId,
    };
    next.updatedAt = new Date().toISOString();
    return next;
};

/**
 * Swap two matchups (same or different weeks) entirely.
 */
export const swapMatchups = (schedule, weekA, indexA, weekB, indexB) => {
    const next = cloneSchedule(schedule);
    const weekObjA = next?.weeks?.find((entry) => Number(entry.week) === Number(weekA));
    const weekObjB = next?.weeks?.find((entry) => Number(entry.week) === Number(weekB));
    if (!weekObjA?.matchups?.[indexA] || !weekObjB?.matchups?.[indexB]) {
        return schedule;
    }
    const temp = weekObjA.matchups[indexA];
    weekObjA.matchups[indexA] = weekObjB.matchups[indexB];
    weekObjB.matchups[indexB] = temp;
    next.updatedAt = new Date().toISOString();
    return next;
};

/**
 * Replace one matchup's teams (manual edit). awayTeamId null = bye.
 */
export const setMatchupTeams = (schedule, weekNumber, matchupIndex, homeTeamId, awayTeamId) => {
    const next = cloneSchedule(schedule);
    const week = next?.weeks?.find((entry) => Number(entry.week) === Number(weekNumber));
    if (!week) return schedule;
    if (!week.matchups) week.matchups = [];
    if (matchupIndex < 0 || matchupIndex >= week.matchups.length) {
        week.matchups.push({
            homeTeamId: homeTeamId || null,
            awayTeamId: awayTeamId || null,
        });
    } else {
        week.matchups[matchupIndex] = {
            homeTeamId: homeTeamId || null,
            awayTeamId: awayTeamId || null,
        };
    }
    next.updatedAt = new Date().toISOString();
    next.mode = next.mode || 'manual';
    return next;
};

export const addMatchupToWeek = (schedule, weekNumber, homeTeamId, awayTeamId) => {
    const next = cloneSchedule(schedule);
    const week = next?.weeks?.find((entry) => Number(entry.week) === Number(weekNumber));
    if (!week) return schedule;
    if (!week.matchups) week.matchups = [];
    week.matchups.push({
        homeTeamId: homeTeamId || null,
        awayTeamId: awayTeamId || null,
    });
    next.updatedAt = new Date().toISOString();
    next.mode = 'manual';
    return next;
};

export const removeMatchupFromWeek = (schedule, weekNumber, matchupIndex) => {
    const next = cloneSchedule(schedule);
    const week = next?.weeks?.find((entry) => Number(entry.week) === Number(weekNumber));
    if (!week?.matchups?.[matchupIndex]) return schedule;
    week.matchups.splice(matchupIndex, 1);
    next.updatedAt = new Date().toISOString();
    return next;
};

/** Teams already used in a week (excluding byes' null). */
export const getTeamsScheduledInWeek = (schedule, weekNumber, excludeMatchupIndex = -1) => {
    const used = new Set();
    getWeekMatchups(schedule, weekNumber).forEach((matchup, index) => {
        if (index === excludeMatchupIndex) return;
        if (matchup.homeTeamId) used.add(String(matchup.homeTeamId));
        if (matchup.awayTeamId) used.add(String(matchup.awayTeamId));
    });
    return used;
};
