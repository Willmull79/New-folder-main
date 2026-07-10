const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const userService = require('../services/userService');
const leagueService = require('../services/leagueService');

const generateToken = (userId) => jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
);

const verifyToken = (token) => {
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
        return null;
    }
};

const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                error: 'Access token required',
                message: 'Please provide a valid authentication token',
            });
        }

        const decoded = verifyToken(token);
        if (!decoded) {
            return res.status(403).json({
                error: 'Invalid token',
                message: 'The provided token is invalid or expired',
            });
        }

        const user = await userService.findById(decoded.userId);
        if (!user) {
            return res.status(404).json({
                error: 'User not found',
                message: 'The user associated with this token no longer exists',
            });
        }

        if (!user.isActive) {
            return res.status(403).json({
                error: 'Account deactivated',
                message: 'Your account has been deactivated. Please contact support.',
            });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        return res.status(500).json({
            error: 'Authentication failed',
            message: 'An error occurred during authentication',
        });
    }
};

const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];

        if (token) {
            const decoded = verifyToken(token);
            if (decoded) {
                const user = await userService.findById(decoded.userId);
                if (user && user.isActive) {
                    req.user = user;
                }
            }
        }
        next();
    } catch (error) {
        next();
    }
};

const requireLeagueAccess = async (req, res, next) => {
    try {
        const { leagueId } = req.params;
        const userId = req.user._id || req.user.id;

        const league = await leagueService.findById(leagueId);
        if (!league) {
            return res.status(404).json({
                error: 'League not found',
                message: 'The specified league does not exist',
            });
        }

        if (!leagueService.isCommissioner(league, userId)) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You do not have permission to perform this action',
            });
        }

        req.league = league;
        next();
    } catch (error) {
        console.error('League access check error:', error);
        return res.status(500).json({
            error: 'Access check failed',
            message: 'An error occurred while checking permissions',
        });
    }
};

const requireTeamAccess = async (req, res, next) => {
    try {
        const { teamId, leagueId } = req.params;
        const userId = req.user._id || req.user.id;

        const league = await leagueService.findById(leagueId);
        if (!league) {
            return res.status(404).json({
                error: 'Team not found',
                message: 'The specified team does not exist',
            });
        }

        const team = league.teams.find((t) => t.id === teamId || t._id === teamId);
        if (!team) {
            return res.status(404).json({
                error: 'Team not found',
                message: 'The specified team does not exist',
            });
        }

        if (team.ownerId !== userId && team.ownerId?.toString?.() !== userId) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You do not have permission to perform this action',
            });
        }

        req.team = team;
        next();
    } catch (error) {
        console.error('Team access check error:', error);
        return res.status(500).json({
            error: 'Access check failed',
            message: 'An error occurred while checking permissions',
        });
    }
};

const hashPassword = async (password) => {
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;
    return bcrypt.hash(password, saltRounds);
};

const comparePassword = async (password, hashedPassword) => bcrypt.compare(password, hashedPassword);

module.exports = {
    generateToken,
    verifyToken,
    authenticateToken,
    optionalAuth,
    requireLeagueAccess,
    requireTeamAccess,
    hashPassword,
    comparePassword,
};
