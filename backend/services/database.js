const redis = require('redis');
const { initializeFirebase, getFirestore } = require('./firestore');

let redisClient = null;

const initializeDatabase = async () => {
    try {
        initializeFirebase();
        const db = getFirestore();
        await db.listCollections();
        console.log('✅ Firestore connected successfully');
    } catch (error) {
        console.error('❌ Firestore connection failed:', error);
        throw error;
    }
};

const initializeRedis = async () => {
    try {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

        redisClient = redis.createClient({
            url: redisUrl,
            retry_strategy: (options) => {
                if (options.error && options.error.code === 'ECONNREFUSED') {
                    console.error('❌ Redis server refused connection');
                    return new Error('Redis server refused connection');
                }
                if (options.total_retry_time > 1000 * 60 * 60) {
                    console.error('❌ Redis retry time exhausted');
                    return new Error('Retry time exhausted');
                }
                if (options.attempt > 10) {
                    console.error('❌ Redis max retry attempts reached');
                    return undefined;
                }
                return Math.min(options.attempt * 100, 3000);
            },
        });

        redisClient.on('error', (err) => {
            console.error('❌ Redis error:', err);
        });

        redisClient.on('connect', () => {
            console.log('✅ Redis connected successfully');
        });

        redisClient.on('ready', () => {
            console.log('✅ Redis ready');
        });

        redisClient.on('end', () => {
            console.log('⚠️ Redis connection ended');
        });

        await redisClient.connect();
    } catch (error) {
        console.error('❌ Redis connection failed:', error);
        redisClient = null;
    }
};

const getRedisClient = () => redisClient;

const setCache = async (key, value, ttl = 3600) => {
    if (!redisClient) return false;

    try {
        const serializedValue = typeof value === 'object' ? JSON.stringify(value) : value;
        await redisClient.setEx(key, ttl, serializedValue);
        return true;
    } catch (error) {
        console.error('Redis set error:', error);
        return false;
    }
};

const getCache = async (key) => {
    if (!redisClient) return null;

    try {
        const value = await redisClient.get(key);
        if (!value) return null;

        try {
            return JSON.parse(value);
        } catch {
            return value;
        }
    } catch (error) {
        console.error('Redis get error:', error);
        return null;
    }
};

const deleteCache = async (key) => {
    if (!redisClient) return false;

    try {
        await redisClient.del(key);
        return true;
    } catch (error) {
        console.error('Redis delete error:', error);
        return false;
    }
};

const clearCache = async (pattern = '*') => {
    if (!redisClient) return false;

    try {
        const keys = await redisClient.keys(pattern);
        if (keys.length > 0) {
            await redisClient.del(keys);
        }
        return true;
    } catch (error) {
        console.error('Redis clear error:', error);
        return false;
    }
};

const checkDatabaseHealth = async () => {
    const health = {
        firestore: 'unknown',
        redis: 'unknown',
        timestamp: new Date().toISOString(),
    };

    try {
        const db = getFirestore();
        await db.collection('_health').limit(1).get();
        health.firestore = 'healthy';
    } catch (error) {
        health.firestore = 'error';
        console.error('Firestore health check failed:', error);
    }

    try {
        if (redisClient && redisClient.isReady) {
            await redisClient.ping();
            health.redis = 'healthy';
        } else {
            health.redis = 'disconnected';
        }
    } catch (error) {
        health.redis = 'error';
        console.error('Redis health check failed:', error);
    }

    return health;
};

const getDatabaseStats = async () => {
    const stats = {
        collections: {},
        timestamp: new Date().toISOString(),
    };

    try {
        const db = getFirestore();
        const collections = await db.listCollections();
        stats.collections = collections.map((col) => col.id);
    } catch (error) {
        console.error('Failed to get database stats:', error);
    }

    return stats;
};

const createBackup = async () => {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = `./backups/firestore-backup-${timestamp}`;
        console.log(`Backup placeholder created: ${backupPath}`);

        return {
            success: true,
            path: backupPath,
            timestamp: new Date().toISOString(),
            note: 'Use gcloud firestore export for production backups',
        };
    } catch (error) {
        console.error('Backup failed:', error);
        return {
            success: false,
            error: error.message,
        };
    }
};

const initializeAll = async () => {
    await initializeDatabase();
    await initializeRedis();
};

module.exports = {
    initializeDatabase,
    initializeRedis,
    initializeAll,
    getRedisClient,
    setCache,
    getCache,
    deleteCache,
    clearCache,
    checkDatabaseHealth,
    getDatabaseStats,
    createBackup,
    getFirestore,
};
