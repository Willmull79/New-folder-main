const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const axios = require('axios');

const SLEEPER_NFL_PLAYERS_URL = 'https://api.sleeper.app/v1/players/nfl';
const ELIGIBLE_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'DEF', 'DL', 'LB', 'DB']);
const PLAYERS_COLLECTION = 'players';
const FIRESTORE_BATCH_LIMIT = 500;

/** Safe field access (Python dict .get() equivalent). */
const safeGet = (obj, key, defaultValue = null) => {
    if (obj == null || typeof obj !== 'object') {
        return defaultValue;
    }
    return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] ?? defaultValue : defaultValue;
};

const parseSleeperPlayer = (player) => ({
    first_name: safeGet(player, 'first_name'),
    last_name: safeGet(player, 'last_name'),
    team: safeGet(player, 'team'),
    position: safeGet(player, 'position'),
    age: safeGet(player, 'age'),
    years_exp: safeGet(player, 'years_exp'),
    rookie_year: safeGet(player, 'rookie_year'),
});

const filterActiveEligiblePlayers = (playersById) => {
    return Object.entries(playersById).filter(([, player]) => {
        if (player.active !== true || !ELIGIBLE_POSITIONS.has(player.position)) {
            return false;
        }
        const team = String(player.team || '').trim().toUpperCase();
        return Boolean(team) && team !== 'FA' && team !== 'FREE AGENT';
    });
};

async function fetchSleeperNflPlayers() {
    const response = await axios.get(SLEEPER_NFL_PLAYERS_URL, {
        timeout: 120000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
    });

    if (!response.data || typeof response.data !== 'object') {
        throw new Error('Sleeper API returned an unexpected payload');
    }

    return response.data;
}

async function writePlayersInBatches(db, filteredPlayers) {
    let batch = db.batch();
    let batchCount = 0;
    let totalWritten = 0;

    for (const [playerId, player] of filteredPlayers) {
        const docRef = db.collection(PLAYERS_COLLECTION).doc(String(playerId));
        batch.set(docRef, parseSleeperPlayer(player), { merge: true });
        batchCount += 1;

        if (batchCount >= FIRESTORE_BATCH_LIMIT) {
            await batch.commit();
            totalWritten += batchCount;
            batch = db.batch();
            batchCount = 0;
        }
    }

    if (batchCount > 0) {
        await batch.commit();
        totalWritten += batchCount;
    }

    return totalWritten;
}

async function syncSleeperPlayersToFirestore() {
    const db = admin.firestore();
    const playersById = await fetchSleeperNflPlayers();
    const filteredPlayers = filterActiveEligiblePlayers(playersById);
    const totalWritten = await writePlayersInBatches(db, filteredPlayers);

    return {
        totalFetched: Object.keys(playersById).length,
        totalEligible: filteredPlayers.length,
        totalWritten,
    };
}

const syncSleeperPlayersScheduled = onSchedule(
    {
        schedule: '0 3 * * *',
        timeZone: 'America/New_York',
        retryCount: 3,
    },
    async (event) => {
        logger.info('Starting scheduled Sleeper player sync', {
            scheduleTime: event.scheduleTime,
        });

        try {
            const result = await syncSleeperPlayersToFirestore();
            logger.info('Scheduled Sleeper player sync completed', result);
            return result;
        } catch (error) {
            logger.error('Scheduled Sleeper player sync failed', error);
            throw error;
        }
    }
);

module.exports = {
    syncSleeperPlayersScheduled,
    syncSleeperPlayersToFirestore,
    parseSleeperPlayer,
    filterActiveEligiblePlayers,
    safeGet,
    FIRESTORE_BATCH_LIMIT,
};
