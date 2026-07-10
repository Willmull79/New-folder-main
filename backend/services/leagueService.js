const { getFirestore } = require('./firestore');

const LEAGUES_COLLECTION = 'leagues';

const getLeagueRef = (leagueId) => getFirestore().doc(`${LEAGUES_COLLECTION}/${leagueId}`);

const getTeams = async (leagueId) => {
    const snapshot = await getFirestore()
        .collection(`${LEAGUES_COLLECTION}/${leagueId}/teams`)
        .get();

    return snapshot.docs.map((doc) => ({
        _id: doc.id,
        id: doc.id,
        ...doc.data(),
    }));
};

const findById = async (leagueId) => {
    const doc = await getLeagueRef(leagueId).get();
    if (!doc.exists) {
        return null;
    }

    const teams = await getTeams(leagueId);
    return {
        _id: doc.id,
        id: doc.id,
        ...doc.data(),
        teams,
    };
};

const updateLeague = async (leagueId, updates) => {
    const flatUpdates = {};

    Object.entries(updates).forEach(([key, value]) => {
        if (key.includes('.')) {
            flatUpdates[key] = value;
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
            Object.entries(value).forEach(([nestedKey, nestedValue]) => {
                flatUpdates[`${key}.${nestedKey}`] = nestedValue;
            });
        } else {
            flatUpdates[key] = value;
        }
    });

    flatUpdates.updatedAt = new Date();
    await getLeagueRef(leagueId).set(flatUpdates, { merge: true });
    return findById(leagueId);
};

const isCommissioner = (league, userId) => {
    if (league.ownerId === userId || league.ownerId?.toString?.() === userId) {
        return true;
    }

    if (Array.isArray(league.commissioners)) {
        return league.commissioners.some((id) => id === userId || id?.toString?.() === userId);
    }

    if (Array.isArray(league.members)) {
        return league.members.some(
            (member) => member.userId === userId
                && member.isActive !== false
                && (member.role === 'owner' || member.role === 'commissioner')
        );
    }

    return false;
};

const findUserTeam = (teams, userId) => teams.find(
    (team) => team.ownerId === userId || team.ownerId?.toString?.() === userId
);

const buildPickOrder = (order, format, totalRounds, teamCount) => {
    const pickOrder = [];
    for (let round = 1; round <= totalRounds; round += 1) {
        if (format === 'snake' && round % 2 === 0) {
            pickOrder.push(...[...order].reverse());
        } else {
            pickOrder.push(...order);
        }
    }
    return pickOrder;
};

module.exports = {
    LEAGUES_COLLECTION,
    findById,
    updateLeague,
    getTeams,
    isCommissioner,
    findUserTeam,
    buildPickOrder,
};
