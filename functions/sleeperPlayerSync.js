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
    status: safeGet(player, 'status'),
    injury_status: safeGet(player, 'injury_status'),
    fantasy_positions: safeGet(player, 'fantasy_positions'),
    number: safeGet(player, 'number'),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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

/**
 * Core reusable sync: fetch NFL players from the Sleeper API and upsert into Firestore.
 */
async function fetchAndStoreSleeperData() {
    const db = admin.firestore();
    logger.info('fetchAndStoreSleeperData: fetching players from Sleeper API');

    const playersById = await fetchSleeperNflPlayers();
    const filteredPlayers = filterActiveEligiblePlayers(playersById);
    const totalWritten = await writePlayersInBatches(db, filteredPlayers);

    const result = {
        totalFetched: Object.keys(playersById).length,
        totalEligible: filteredPlayers.length,
        totalWritten,
        syncedAt: new Date().toISOString(),
    };

    logger.info('fetchAndStoreSleeperData: completed', result);
    return result;
}

/** @deprecated Prefer fetchAndStoreSleeperData */
const syncSleeperPlayersToFirestore = fetchAndStoreSleeperData;

const scheduleOptions = {
    timeZone: 'America/New_York',
    retryCount: 3,
    timeoutSeconds: 540,
    memory: '1GiB',
};

/**
 * Mon–Sat at 6:00 AM Eastern — fetch & store Sleeper player data.
 */
const fetchAndStoreSleeperDataWeekday = onSchedule(
    {
        ...scheduleOptions,
        schedule: '0 6 * * 1-6',
    },
    async (event) => {
        logger.info('Starting weekday Sleeper player sync (Mon–Sat 6:00 AM ET)', {
            scheduleTime: event.scheduleTime,
        });

        try {
            const result = await fetchAndStoreSleeperData();
            logger.info('Weekday Sleeper player sync completed', result);
            return result;
        } catch (error) {
            logger.error('Weekday Sleeper player sync failed', error);
            throw error;
        }
    }
);

/**
 * Sunday at 10:00 AM Eastern — fetch & store Sleeper player data.
 */
const fetchAndStoreSleeperDataSunday = onSchedule(
    {
        ...scheduleOptions,
        schedule: '0 10 * * 0',
    },
    async (event) => {
        logger.info('Starting Sunday Sleeper player sync (10:00 AM ET)', {
            scheduleTime: event.scheduleTime,
        });

        try {
            const result = await fetchAndStoreSleeperData();
            logger.info('Sunday Sleeper player sync completed', result);
            return result;
        } catch (error) {
            logger.error('Sunday Sleeper player sync failed', error);
            throw error;
        }
    }
);

module.exports = {
    fetchAndStoreSleeperData,
    fetchAndStoreSleeperDataWeekday,
    fetchAndStoreSleeperDataSunday,
    syncSleeperPlayersToFirestore,
    parseSleeperPlayer,
    filterActiveEligiblePlayers,
    safeGet,
    FIRESTORE_BATCH_LIMIT,
};
