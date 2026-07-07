const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const leagueRoutes = require('./routes/leagues');
const teamRoutes = require('./routes/teams');
const playerRoutes = require('./routes/players');
const draftRoutes = require('./routes/draft');
const auctionRoutes = require('./routes/auction');
const waiverRoutes = require('./routes/waivers');
const tradeRoutes = require('./routes/trades');
const scoringRoutes = require('./routes/scoring');
const statsRoutes = require('./routes/stats');

// Import middleware
const { authenticateToken } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errorHandler');
const { validateRequest } = require('./middleware/validation');

// Import services
const { initializeDatabase } = require('./services/database');
const { initializeWebSocket } = require('./services/websocket');
const { initializeBackgroundJobs } = require('./services/backgroundJobs');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', limiter);

// Compression
app.use(compression());

// Logging
app.use(morgan('combined'));

// CORS configuration
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use('/static', express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/leagues', authenticateToken, leagueRoutes);
app.use('/api/teams', authenticateToken, teamRoutes);
app.use('/api/players', authenticateToken, playerRoutes);
app.use('/api/draft', authenticateToken, draftRoutes);
app.use('/api/auction', authenticateToken, auctionRoutes);
app.use('/api/waivers', authenticateToken, waiverRoutes);
app.use('/api/trades', authenticateToken, tradeRoutes);
app.use('/api/scoring', authenticateToken, scoringRoutes);
app.use('/api/stats', authenticateToken, statsRoutes);

// API documentation
app.get('/api/docs', (req, res) => {
    res.json({
        message: 'Fantasy Football API Documentation',
        version: '1.0.0',
        endpoints: {
            auth: '/api/auth',
            leagues: '/api/leagues',
            teams: '/api/teams',
            players: '/api/players',
            draft: '/api/draft',
            auction: '/api/auction',
            waivers: '/api/waivers',
            trades: '/api/trades',
            scoring: '/api/scoring',
            stats: '/api/stats'
        }
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        path: req.originalUrl,
        method: req.method
    });
});

// Error handling middleware
app.use(errorHandler);

// Initialize services
async function initializeApp() {
    try {
        // Check if we're in test mode (no database required)
        const testMode = process.env.NODE_ENV === 'test' || process.argv.includes('--test');
        
        if (!testMode) {
            // Initialize database connection
            await initializeDatabase();
            console.log('✅ Database initialized');

            // Initialize WebSocket server
            initializeWebSocket(app);
            console.log('✅ WebSocket server initialized');

            // Initialize background jobs
            await initializeBackgroundJobs();
            console.log('✅ Background jobs initialized');
        } else {
            console.log('🧪 Running in test mode - skipping database initialization');
        }

        // Start server
        const server = app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📚 API Documentation: http://localhost:${PORT}/api/docs`);
            console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
            if (!testMode) {
                console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
            }
        });

        // Graceful shutdown
        process.on('SIGTERM', () => {
            console.log('SIGTERM received, shutting down gracefully');
            server.close(() => {
                console.log('Process terminated');
                process.exit(0);
            });
        });

    } catch (error) {
        console.error('❌ Failed to initialize app:', error);
        process.exit(1);
    }
}

// Start the application
initializeApp();

module.exports = app; 