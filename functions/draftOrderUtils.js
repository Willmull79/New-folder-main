const MIN_PICK_TIME = 15;
const MIN_ROUNDS = 1;
const MAX_ROUNDS = 20;

function shuffleArray(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function clampRounds(rounds) {
    const value = Number(rounds);
    if (Number.isNaN(value)) return MAX_ROUNDS;
    return Math.min(Math.max(value, MIN_ROUNDS), MAX_ROUNDS);
}

function generatePickOrder(roundOneOrder, draftFormat = 'standard', rounds = MAX_ROUNDS) {
    if (!roundOneOrder?.length) return [];

    const totalRounds = clampRounds(rounds);
    const pickOrder = [];

    for (let round = 1; round <= totalRounds; round++) {
        if (draftFormat === 'snake' && round % 2 === 0) {
            pickOrder.push(...[...roundOneOrder].reverse());
        } else {
            pickOrder.push(...roundOneOrder);
        }
    }

    return pickOrder;
}

function getRoundFromPickIndex(pickIndex, numTeams) {
    if (!numTeams) return 1;
    return Math.floor(pickIndex / numTeams) + 1;
}

function isDraftComplete(currentPick, pickOrder) {
    return currentPick >= (pickOrder?.length || 0);
}

function resolvePickTimeLimit(settings) {
    const limit = settings?.pickTimeLimit ?? settings?.timeLimit;
    if (limit === null || limit === undefined) return null;
    return limit === 0 ? null : limit;
}

function generateDraftOrder(teams, draftFormat, roundOneOrder = null, rounds = MAX_ROUNDS) {
    const teamIds = teams.map(team => team.id);
    const firstRoundOrder = roundOneOrder?.length === teamIds.length
        ? roundOneOrder
        : shuffleArray(teamIds);

    return {
        roundOneOrder: firstRoundOrder,
        pickOrder: generatePickOrder(firstRoundOrder, draftFormat, rounds)
    };
}

module.exports = {
    MIN_PICK_TIME,
    MIN_ROUNDS,
    MAX_ROUNDS,
    shuffleArray,
    clampRounds,
    generatePickOrder,
    getRoundFromPickIndex,
    isDraftComplete,
    resolvePickTimeLimit,
    generateDraftOrder
};
