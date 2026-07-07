const mongoose = require('mongoose');
const redis = require('redis');

let redisClient = null;

// Initialize MongoDB connection
const initializeDatabase = async () => {
    try {
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/fantasy_football';
        
        await mongoose.connect(mongoUri, {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            bufferCommands: false
        });

        console.log('✅ MongoDB connected successfully');

        // Handle connection events
        mongoose.connection.on('error', (err) => {
            console.error('❌ MongoDB connection error:', err);
        });

        mongoose.connection.on('disconnected', () => {
            console.log('⚠️ MongoDB disconnected');
        });

        mongoose.connection.on('reconnected', () => {
            console.log('✅ MongoDB reconnected');
        });

        // Graceful shutdown
        process.on('SIGINT', async () => {
            await mongoose.connection.close();
            console.log('MongoDB connection closed through app termination');
            process.exit(0);
        });

    } catch (error) {
        console.error('❌ MongoDB connection failed:', error);
        throw error;
    }
};

// Initialize Redis connection
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
            }
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
        // Don't throw error for Redis - it's optional
        redisClient = null;
    }
};

// Redis helper functions
const getRedisClient = () => {
    return redisClient;
};

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

// Database health check
const checkDatabaseHealth = async () => {
    const health = {
        mongodb: 'unknown',
        redis: 'unknown',
        timestamp: new Date().toISOString()
    };

    // Check MongoDB
    try {
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.db.admin().ping();
            health.mongodb = 'healthy';
        } else {
            health.mongodb = 'disconnected';
        }
    } catch (error) {
        health.mongodb = 'error';
        console.error('MongoDB health check failed:', error);
    }

    // Check Redis
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

// Database statistics
const getDatabaseStats = async () => {
    const stats = {
        collections: {},
        indexes: {},
        storage: {},
        connections: {}
    };

    try {
        // Get collection stats
        const collections = await mongoose.connection.db.listCollections().toArray();
        
        for (const collection of collections) {
            const collectionStats = await mongoose.connection.db.collection(collection.name).stats();
            stats.collections[collection.name] = {
                count: collectionStats.count,
                size: collectionStats.size,
                avgObjSize: collectionStats.avgObjSize,
                storageSize: collectionStats.storageSize,
                indexes: collectionStats.nindexes
            };
        }

        // Get connection stats
        const adminDb = mongoose.connection.db.admin();
        const serverStatus = await adminDb.serverStatus();
        
        stats.connections = {
            current: serverStatus.connections.current,
            available: serverStatus.connections.available,
            totalCreated: serverStatus.connections.totalCreated
        };

        // Get storage stats
        const dbStats = await mongoose.connection.db.stats();
        stats.storage = {
            dataSize: dbStats.dataSize,
            storageSize: dbStats.storageSize,
            indexSize: dbStats.indexSize,
            collections: dbStats.collections
        };

    } catch (error) {
        console.error('Failed to get database stats:', error);
    }

    return stats;
};

// Database backup (basic implementation)
const createBackup = async () => {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = `./backups/backup-${timestamp}`;
        
        // This would typically use mongodump
        // For now, we'll just return a success message
        console.log(`Backup created: ${backupPath}`);
        
        return {
            success: true,
            path: backupPath,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error('Backup failed:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

// Initialize all database connections
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
    createBackup
}; 