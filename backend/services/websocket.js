const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { getRedisClient } = require('./database');

let io = null;

// Initialize WebSocket server
const initializeWebSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: process.env.FRONTEND_URL || "http://localhost:3000",
            methods: ["GET", "POST"],
            credentials: true
        },
        transports: ['websocket', 'polling'],
        allowEIO3: true,
        pingTimeout: 60000,
        pingInterval: 25000
    });

    // Authentication middleware
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
            
            if (!token) {
                return next(new Error('Authentication token required'));
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.userId = decoded.userId;
            next();
        } catch (error) {
            return next(new Error('Invalid authentication token'));
        }
    });

    // Connection handler
    io.on('connection', (socket) => {
        console.log(`User ${socket.userId} connected`);

        // Join user to their personal room
        socket.join(`user:${socket.userId}`);

        // Handle league joins
        socket.on('join-league', (leagueId) => {
            socket.join(`league:${leagueId}`);
            console.log(`User ${socket.userId} joined league ${leagueId}`);
        });

        // Handle league leaves
        socket.on('leave-league', (leagueId) => {
            socket.leave(`league:${leagueId}`);
            console.log(`User ${socket.userId} left league ${leagueId}`);
        });

        // Handle draft room joins
        socket.on('join-draft', (leagueId) => {
            socket.join(`draft:${leagueId}`);
            console.log(`User ${socket.userId} joined draft ${leagueId}`);
        });

        // Handle auction room joins
        socket.on('join-auction', (leagueId) => {
            socket.join(`auction:${leagueId}`);
            console.log(`User ${socket.userId} joined auction ${leagueId}`);
        });

        // Handle trade room joins
        socket.on('join-trade', (tradeId) => {
            socket.join(`trade:${tradeId}`);
            console.log(`User ${socket.userId} joined trade ${tradeId}`);
        });

        // Handle disconnection
        socket.on('disconnect', (reason) => {
            console.log(`User ${socket.userId} disconnected: ${reason}`);
        });

        // Handle errors
        socket.on('error', (error) => {
            console.error(`Socket error for user ${socket.userId}:`, error);
        });
    });

    console.log('✅ WebSocket server initialized');
    return io;
};

// Get WebSocket instance
const getIO = () => {
    return io;
};

// Emit to specific user
const emitToUser = (userId, event, data) => {
    if (!io) return;
    
    io.to(`user:${userId}`).emit(event, {
        ...data,
        timestamp: new Date().toISOString()
    });
};

// Emit to league
const emitToLeague = (leagueId, event, data) => {
    if (!io) return;
    
    io.to(`league:${leagueId}`).emit(event, {
        ...data,
        timestamp: new Date().toISOString()
    });
};

// Emit to draft room
const emitToDraft = (leagueId, event, data) => {
    if (!io) return;
    
    io.to(`draft:${leagueId}`).emit(event, {
        ...data,
        timestamp: new Date().toISOString()
    });
};

// Emit to auction room
const emitToAuction = (leagueId, event, data) => {
    if (!io) return;
    
    io.to(`auction:${leagueId}`).emit(event, {
        ...data,
        timestamp: new Date().toISOString()
    });
};

// Emit to trade room
const emitToTrade = (tradeId, event, data) => {
    if (!io) return;
    
    io.to(`trade:${tradeId}`).emit(event, {
        ...data,
        timestamp: new Date().toISOString()
    });
};

// Emit to all connected clients
const emitToAll = (event, data) => {
    if (!io) return;
    
    io.emit(event, {
        ...data,
        timestamp: new Date().toISOString()
    });
};

// Fantasy football specific events
const fantasyEvents = {
    // League events
    leagueUpdated: (leagueId, leagueData) => {
        emitToLeague(leagueId, 'league:updated', leagueData);
    },

    leagueMemberJoined: (leagueId, memberData) => {
        emitToLeague(leagueId, 'league:member:joined', memberData);
    },

    leagueMemberLeft: (leagueId, memberData) => {
        emitToLeague(leagueId, 'league:member:left', memberData);
    },

    // Team events
    teamUpdated: (leagueId, teamData) => {
        emitToLeague(leagueId, 'team:updated', teamData);
    },

    rosterUpdated: (leagueId, teamId, rosterData) => {
        emitToLeague(leagueId, 'roster:updated', { teamId, ...rosterData });
    },

    // Scoring events
    scoreUpdated: (leagueId, scoreData) => {
        emitToLeague(leagueId, 'score:updated', scoreData);
    },

    liveScoring: (leagueId, liveData) => {
        emitToLeague(leagueId, 'live:scoring', liveData);
    },

    // Draft events
    draftStarted: (leagueId, draftData) => {
        emitToDraft(leagueId, 'draft:started', draftData);
    },

    draftPick: (leagueId, pickData) => {
        emitToDraft(leagueId, 'draft:pick', pickData);
    },

    draftTimer: (leagueId, timerData) => {
        emitToDraft(leagueId, 'draft:timer', timerData);
    },

    draftComplete: (leagueId, draftData) => {
        emitToDraft(leagueId, 'draft:complete', draftData);
    },

    // Auction events
    auctionStarted: (leagueId, auctionData) => {
        emitToAuction(leagueId, 'auction:started', auctionData);
    },

    auctionBid: (leagueId, bidData) => {
        emitToAuction(leagueId, 'auction:bid', bidData);
    },

    auctionTimer: (leagueId, timerData) => {
        emitToAuction(leagueId, 'auction:timer', timerData);
    },

    auctionComplete: (leagueId, auctionData) => {
        emitToAuction(leagueId, 'auction:complete', auctionData);
    },

    // Trade events
    tradeProposed: (tradeId, tradeData) => {
        emitToTrade(tradeId, 'trade:proposed', tradeData);
    },

    tradeAccepted: (tradeId, tradeData) => {
        emitToTrade(tradeId, 'trade:accepted', tradeData);
    },

    tradeRejected: (tradeId, tradeData) => {
        emitToTrade(tradeId, 'trade:rejected', tradeData);
    },

    tradeVetoed: (tradeId, tradeData) => {
        emitToTrade(tradeId, 'trade:vetoed', tradeData);
    },

    tradeComplete: (tradeId, tradeData) => {
        emitToTrade(tradeId, 'trade:complete', tradeData);
    },

    // Waiver events
    waiverClaim: (leagueId, claimData) => {
        emitToLeague(leagueId, 'waiver:claim', claimData);
    },

    waiverProcessed: (leagueId, waiverData) => {
        emitToLeague(leagueId, 'waiver:processed', waiverData);
    },

    // Player events
    playerInjured: (leagueId, playerData) => {
        emitToLeague(leagueId, 'player:injured', playerData);
    },

    playerActivated: (leagueId, playerData) => {
        emitToLeague(leagueId, 'player:activated', playerData);
    },

    // Notification events
    notification: (userId, notificationData) => {
        emitToUser(userId, 'notification', notificationData);
    },

    // System events
    systemMaintenance: (message) => {
        emitToAll('system:maintenance', { message });
    },

    systemUpdate: (updateData) => {
        emitToAll('system:update', updateData);
    }
};

// Get connected users count
const getConnectedUsers = () => {
    if (!io) return 0;
    return io.engine.clientsCount;
};

// Get users in a specific room
const getUsersInRoom = (room) => {
    if (!io) return 0;
    const roomSockets = io.sockets.adapter.rooms.get(room);
    return roomSockets ? roomSockets.size : 0;
};

// Broadcast to all users in a room except sender
const broadcastToRoom = (room, event, data, excludeSocketId = null) => {
    if (!io) return;
    
    const roomSockets = io.sockets.adapter.rooms.get(room);
    if (!roomSockets) return;

    roomSockets.forEach(socketId => {
        if (socketId !== excludeSocketId) {
            io.to(socketId).emit(event, {
                ...data,
                timestamp: new Date().toISOString()
            });
        }
    });
};

// Rate limiting for WebSocket events
const rateLimiter = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 100; // max events per window

const checkRateLimit = (userId, event) => {
    const key = `${userId}:${event}`;
    const now = Date.now();
    
    if (!rateLimiter.has(key)) {
        rateLimiter.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
        return true;
    }
    
    const limit = rateLimiter.get(key);
    
    if (now > limit.resetTime) {
        limit.count = 1;
        limit.resetTime = now + RATE_LIMIT_WINDOW;
        return true;
    }
    
    if (limit.count >= RATE_LIMIT_MAX) {
        return false;
    }
    
    limit.count++;
    return true;
};

// Clean up rate limiter periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, limit] of rateLimiter.entries()) {
        if (now > limit.resetTime) {
            rateLimiter.delete(key);
        }
    }
}, RATE_LIMIT_WINDOW);

module.exports = {
    initializeWebSocket,
    getIO,
    emitToUser,
    emitToLeague,
    emitToDraft,
    emitToAuction,
    emitToTrade,
    emitToAll,
    fantasyEvents,
    getConnectedUsers,
    getUsersInRoom,
    broadcastToRoom,
    checkRateLimit
}; 