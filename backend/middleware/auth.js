const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

// Generate JWT token
const generateToken = (userId) => {
    return jwt.sign(
        { userId },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
};

// Verify JWT token
const verifyToken = (token) => {
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
        return null;
    }
};

// Authenticate token middleware
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({
                error: 'Access token required',
                message: 'Please provide a valid authentication token'
            });
        }

        const decoded = verifyToken(token);
        if (!decoded) {
            return res.status(403).json({
                error: 'Invalid token',
                message: 'The provided token is invalid or expired'
            });
        }

        // Get user from database
        const user = await User.findById(decoded.userId).select('-password');
        if (!user) {
            return res.status(404).json({
                error: 'User not found',
                message: 'The user associated with this token no longer exists'
            });
        }

        // Check if user is active
        if (!user.isActive) {
            return res.status(403).json({
                error: 'Account deactivated',
                message: 'Your account has been deactivated. Please contact support.'
            });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        return res.status(500).json({
            error: 'Authentication failed',
            message: 'An error occurred during authentication'
        });
    }
};

// Optional authentication (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (token) {
            const decoded = verifyToken(token);
            if (decoded) {
                const user = await User.findById(decoded.userId).select('-password');
                if (user && user.isActive) {
                    req.user = user;
                }
            }
        }
        next();
    } catch (error) {
        // Continue without authentication
        next();
    }
};

// Check if user is league owner or commissioner
const requireLeagueAccess = async (req, res, next) => {
    try {
        const { leagueId } = req.params;
        const userId = req.user._id;

        // Check if user is league owner or commissioner
        const league = await League.findById(leagueId);
        if (!league) {
            return res.status(404).json({
                error: 'League not found',
                message: 'The specified league does not exist'
            });
        }

        if (league.ownerId.toString() !== userId.toString() && 
            !league.commissioners.includes(userId)) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You do not have permission to perform this action'
            });
        }

        req.league = league;
        next();
    } catch (error) {
        console.error('League access check error:', error);
        return res.status(500).json({
            error: 'Access check failed',
            message: 'An error occurred while checking permissions'
        });
    }
};

// Check if user is team owner
const requireTeamAccess = async (req, res, next) => {
    try {
        const { teamId } = req.params;
        const userId = req.user._id;

        const team = await Team.findById(teamId);
        if (!team) {
            return res.status(404).json({
                error: 'Team not found',
                message: 'The specified team does not exist'
            });
        }

        if (team.ownerId.toString() !== userId.toString()) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You do not have permission to perform this action'
            });
        }

        req.team = team;
        next();
    } catch (error) {
        console.error('Team access check error:', error);
        return res.status(500).json({
            error: 'Access check failed',
            message: 'An error occurred while checking permissions'
        });
    }
};

// Hash password
const hashPassword = async (password) => {
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    return await bcrypt.hash(password, saltRounds);
};

// Compare password
const comparePassword = async (password, hashedPassword) => {
    return await bcrypt.compare(password, hashedPassword);
};

module.exports = {
    generateToken,
    verifyToken,
    authenticateToken,
    optionalAuth,
    requireLeagueAccess,
    requireTeamAccess,
    hashPassword,
    comparePassword
}; 