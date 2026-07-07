const Joi = require('joi');

// Validation schemas
const schemas = {
    // User validation
    user: {
        register: Joi.object({
            email: Joi.string().email().required(),
            password: Joi.string().min(8).required(),
            firstName: Joi.string().min(2).max(50).required(),
            lastName: Joi.string().min(2).max(50).required(),
            username: Joi.string().alphanum().min(3).max(30).optional()
        }),
        login: Joi.object({
            email: Joi.string().email().required(),
            password: Joi.string().required()
        }),
        update: Joi.object({
            firstName: Joi.string().min(2).max(50).optional(),
            lastName: Joi.string().min(2).max(50).optional(),
            username: Joi.string().alphanum().min(3).max(30).optional(),
            avatar: Joi.string().uri().optional(),
            preferences: Joi.object().optional()
        })
    },

    // League validation
    league: {
        create: Joi.object({
            name: Joi.string().min(3).max(100).required(),
            description: Joi.string().max(500).optional(),
            settings: Joi.object({
                teamSalary: Joi.number().min(100).max(10000).default(1000),
                rosterSize: Joi.number().min(10).max(50).default(20),
                scoringRules: Joi.object().optional(),
                draftType: Joi.string().valid('standard', 'snake', 'auction').default('standard'),
                tradeDeadline: Joi.date().optional(),
                playoffTeams: Joi.number().min(2).max(16).default(6)
            }).optional()
        }),
        update: Joi.object({
            name: Joi.string().min(3).max(100).optional(),
            description: Joi.string().max(500).optional(),
            settings: Joi.object().optional(),
            status: Joi.string().valid('draft', 'active', 'playoffs', 'completed').optional()
        })
    },

    // Team validation
    team: {
        create: Joi.object({
            name: Joi.string().min(2).max(50).required(),
            abbreviation: Joi.string().min(2).max(4).optional(),
            logo: Joi.string().uri().optional(),
            colors: Joi.object({
                primary: Joi.string().regex(/^#[0-9A-F]{6}$/i).optional(),
                secondary: Joi.string().regex(/^#[0-9A-F]{6}$/i).optional()
            }).optional()
        }),
        update: Joi.object({
            name: Joi.string().min(2).max(50).optional(),
            abbreviation: Joi.string().min(2).max(4).optional(),
            logo: Joi.string().uri().optional(),
            colors: Joi.object().optional()
        })
    },

    // Player validation
    player: {
        add: Joi.object({
            playerId: Joi.string().required(),
            position: Joi.string().valid('QB', 'RB', 'WR', 'TE', 'K', 'DL', 'LB', 'DB').required(),
            slot: Joi.string().optional()
        }),
        update: Joi.object({
            position: Joi.string().valid('QB', 'RB', 'WR', 'TE', 'K', 'DL', 'LB', 'DB').optional(),
            slot: Joi.string().optional(),
            status: Joi.string().valid('active', 'bench', 'ir').optional()
        })
    },

    // Draft validation
    draft: {
        pick: Joi.object({
            playerId: Joi.string().required(),
            round: Joi.number().min(1).max(20).optional(),
            pick: Joi.number().min(1).optional()
        }),
        settings: Joi.object({
            draftType: Joi.string().valid('standard', 'snake', 'auction').optional(),
            draftFormat: Joi.string().valid('standard', 'snake').optional(),
            draftOrder: Joi.array().items(Joi.string()).optional(),
            roundOneOrder: Joi.array().items(Joi.string()).optional(),
            rounds: Joi.number().min(1).max(20).optional(),
            pickTimeLimit: Joi.alternatives().try(Joi.number().min(15).max(300), Joi.valid(null)).optional(),
            timeLimit: Joi.number().min(15).max(300).optional(),
            orderType: Joi.string().valid('random', 'manual').optional(),
            autoPick: Joi.boolean().default(false)
        }),
        order: Joi.object({
            draftOrder: Joi.array().items(Joi.string()).required()
        })
    },

    // Auction validation
    auction: {
        bid: Joi.object({
            amount: Joi.number().min(1).max(1000).required(),
            playerId: Joi.string().required()
        }),
        nominate: Joi.object({
            playerId: Joi.string().required(),
            startingBid: Joi.number().min(1).max(1000).optional()
        })
    },

    // Trade validation
    trade: {
        create: Joi.object({
            teamIds: Joi.array().items(Joi.string()).min(2).required(),
            assets: Joi.object().pattern(Joi.string(), Joi.object({
                players: Joi.array().items(Joi.string()).optional(),
                draftPicks: Joi.array().items(Joi.object({
                    year: Joi.number().min(2024).max(2030).required(),
                    round: Joi.number().min(1).max(20).required()
                })).optional(),
                salary: Joi.number().min(0).optional()
            })).required(),
            expiresAt: Joi.date().optional()
        }),
        accept: Joi.object({
            accepted: Joi.boolean().required(),
            message: Joi.string().max(500).optional()
        })
    },

    // Waiver validation
    waiver: {
        claim: Joi.object({
            playerId: Joi.string().required(),
            dropPlayerId: Joi.string().optional(),
            bidAmount: Joi.number().min(0).max(1000).optional(),
            priority: Joi.number().min(1).optional()
        })
    },

    // Scoring validation
    scoring: {
        rules: Joi.object({
            passing: Joi.object({
                touchdowns: Joi.number().default(4),
                yards: Joi.number().default(0.05),
                interceptions: Joi.number().default(-2),
                bonus300: Joi.number().default(2),
                bonus400: Joi.number().default(4)
            }).optional(),
            rushing: Joi.object({
                touchdowns: Joi.number().default(6),
                yards: Joi.number().default(0.2),
                bonus100: Joi.number().default(2),
                bonus200: Joi.number().default(4)
            }).optional(),
            receiving: Joi.object({
                touchdowns: Joi.number().default(6),
                yards: Joi.number().default(0.2),
                receptions: Joi.number().default(1),
                bonus100: Joi.number().default(2),
                bonus200: Joi.number().default(4)
            }).optional(),
            kicking: Joi.object({
                fieldGoals: Joi.object({
                    '0-39': Joi.number().default(3),
                    '40-49': Joi.number().default(4),
                    '50+': Joi.number().default(5)
                }).optional(),
                extraPoints: Joi.number().default(1)
            }).optional(),
            defense: Joi.object({
                tackles: Joi.number().default(2),
                sacks: Joi.number().default(2),
                interceptions: Joi.number().default(4),
                fumbleRecoveries: Joi.number().default(4),
                forcedFumbles: Joi.number().default(3),
                passesDefended: Joi.number().default(0.5),
                touchdowns: Joi.number().default(7)
            }).optional()
        })
    }
};

// Validation middleware factory
const validateRequest = (schema, property = 'body') => {
    return (req, res, next) => {
        const { error, value } = schema.validate(req[property], {
            abortEarly: false,
            stripUnknown: true
        });

        if (error) {
            const errorMessage = error.details.map(detail => detail.message).join(', ');
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                message: errorMessage,
                details: error.details
            });
        }

        // Replace request data with validated data
        req[property] = value;
        next();
    };
};

// Custom validation functions
const validateObjectId = (id) => {
    const objectIdPattern = /^[0-9a-fA-F]{24}$/;
    return objectIdPattern.test(id);
};

const validateEmail = (email) => {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailPattern.test(email);
};

const validatePassword = (password) => {
    // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
    const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/;
    return passwordPattern.test(password);
};

module.exports = {
    schemas,
    validateRequest,
    validateObjectId,
    validateEmail,
    validatePassword
}; 