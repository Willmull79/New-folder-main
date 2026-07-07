const mongoose = require('mongoose');

const leagueSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'League name is required'],
        trim: true,
        maxlength: [100, 'League name cannot exceed 100 characters']
    },
    description: {
        type: String,
        maxlength: [500, 'Description cannot exceed 500 characters'],
        default: ''
    },
    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'League owner is required']
    },
    commissioners: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    members: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        role: {
            type: String,
            enum: ['owner', 'commissioner', 'member'],
            default: 'member'
        },
        joinedAt: {
            type: Date,
            default: Date.now
        },
        isActive: {
            type: Boolean,
            default: true
        }
    }],
    status: {
        type: String,
        enum: ['setup', 'draft', 'active', 'playoffs', 'completed'],
        default: 'setup'
    },
    season: {
        type: Number,
        required: true,
        default: 2024
    },
    settings: {
        teamSalary: {
            type: Number,
            default: 1000,
            min: [100, 'Team salary cap must be at least 100'],
            max: [10000, 'Team salary cap cannot exceed 10000']
        },
        rosterSize: {
            type: Number,
            default: 20,
            min: [10, 'Roster size must be at least 10'],
            max: [50, 'Roster size cannot exceed 50']
        },
        startingLineup: {
            QB: { type: Number, default: 1 },
            RB: { type: Number, default: 2 },
            WR: { type: Number, default: 2 },
            TE: { type: Number, default: 1 },
            K: { type: Number, default: 1 },
            DL: { type: Number, default: 2 },
            LB: { type: Number, default: 2 },
            DB: { type: Number, default: 2 }
        },
        benchSize: {
            type: Number,
            default: 7,
            min: [0, 'Bench size cannot be negative'],
            max: [20, 'Bench size cannot exceed 20']
        },
        irSize: {
            type: Number,
            default: 2,
            min: [0, 'IR size cannot be negative'],
            max: [10, 'IR size cannot exceed 10']
        },
        scoringRules: {
            passing: {
                touchdowns: { type: Number, default: 4 },
                yards: { type: Number, default: 0.05 },
                interceptions: { type: Number, default: -2 },
                bonus300: { type: Number, default: 2 },
                bonus400: { type: Number, default: 4 }
            },
            rushing: {
                touchdowns: { type: Number, default: 6 },
                yards: { type: Number, default: 0.2 },
                bonus100: { type: Number, default: 2 },
                bonus200: { type: Number, default: 4 }
            },
            receiving: {
                touchdowns: { type: Number, default: 6 },
                yards: { type: Number, default: 0.2 },
                receptions: { type: Number, default: 1 },
                bonus100: { type: Number, default: 2 },
                bonus200: { type: Number, default: 4 }
            },
            kicking: {
                fieldGoals: {
                    '0-39': { type: Number, default: 3 },
                    '40-49': { type: Number, default: 4 },
                    '50+': { type: Number, default: 5 }
                },
                extraPoints: { type: Number, default: 1 }
            },
            defense: {
                tackles: { type: Number, default: 2 },
                sacks: { type: Number, default: 2 },
                interceptions: { type: Number, default: 4 },
                fumbleRecoveries: { type: Number, default: 4 },
                forcedFumbles: { type: Number, default: 3 },
                passesDefended: { type: Number, default: 0.5 },
                touchdowns: { type: Number, default: 7 }
            }
        },
        draftType: {
            type: String,
            enum: ['standard', 'snake', 'auction'],
            default: 'standard'
        },
        draftSettings: {
            draftFormat: { type: String, enum: ['standard', 'snake'], default: 'standard' },
            rounds: { type: Number, default: 20, min: 1, max: 20 },
            pickTimeLimit: { type: Number, default: 60, min: 15, max: 300 },
            timeLimit: { type: Number, default: 60, min: 15, max: 300 },
            autoPick: { type: Boolean, default: false },
            orderType: { type: String, enum: ['random', 'manual'], default: 'random' },
            draftOrder: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }]
        },
        tradeSettings: {
            allowTrades: { type: Boolean, default: true },
            tradeDeadline: { type: Date, default: null },
            requireApproval: { type: Boolean, default: false },
            vetoPeriod: { type: Number, default: 48, min: 0, max: 168 } // hours
        },
        waiverSettings: {
            waiverType: {
                type: String,
                enum: ['continuous', 'daily', 'weekly'],
                default: 'continuous'
            },
            waiverPeriod: { type: Number, default: 24, min: 1, max: 168 }, // hours
            allowBidding: { type: Boolean, default: true },
            maxBid: { type: Number, default: 1000 }
        },
        playoffSettings: {
            playoffTeams: { type: Number, default: 6, min: 2, max: 16 },
            playoffRounds: { type: Number, default: 3, min: 1, max: 4 },
            playoffStartWeek: { type: Number, default: 15, min: 14, max: 18 },
            consolationBracket: { type: Boolean, default: true }
        }
    },
    schedule: {
        regularSeasonWeeks: { type: Number, default: 14, min: 13, max: 18 },
        playoffWeeks: { type: Number, default: 3, min: 1, max: 4 },
        byeWeeks: [{ type: Number, min: 1, max: 18 }]
    },
    standings: [{
        teamId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Team',
            required: true
        },
        rank: { type: Number, required: true },
        wins: { type: Number, default: 0 },
        losses: { type: Number, default: 0 },
        ties: { type: Number, default: 0 },
        pointsFor: { type: Number, default: 0 },
        pointsAgainst: { type: Number, default: 0 },
        divisionWins: { type: Number, default: 0 },
        divisionLosses: { type: Number, default: 0 },
        streak: { type: Number, default: 0 },
        lastUpdated: { type: Date, default: Date.now }
    }],
    allRosteredPlayerIds: [{
        type: String,
        ref: 'Player'
    }],
    transactions: [{
        type: {
            type: String,
            enum: ['add', 'drop', 'trade', 'draft', 'auction', 'waiver'],
            required: true
        },
        teamId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Team',
            required: true
        },
        playerId: { type: String },
        details: { type: mongoose.Schema.Types.Mixed },
        timestamp: { type: Date, default: Date.now }
    }],
    isPrivate: {
        type: Boolean,
        default: false
    },
    inviteCode: {
        type: String,
        unique: true,
        sparse: true
    },
    maxTeams: {
        type: Number,
        default: 12,
        min: [2, 'League must have at least 2 teams'],
        max: [32, 'League cannot have more than 32 teams']
    },
    currentWeek: {
        type: Number,
        default: 1,
        min: [1, 'Current week must be at least 1'],
        max: [18, 'Current week cannot exceed 18']
    },
    lastScoringUpdate: {
        type: Date,
        default: null
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for total teams
leagueSchema.virtual('totalTeams').get(function() {
    return this.members.filter(member => member.isActive).length;
});

// Virtual for available spots
leagueSchema.virtual('availableSpots').get(function() {
    return this.maxTeams - this.totalTeams;
});

// Virtual for isFull
leagueSchema.virtual('isFull').get(function() {
    return this.totalTeams >= this.maxTeams;
});

// Virtual for canJoin
leagueSchema.virtual('canJoin').get(function() {
    return this.status === 'setup' && !this.isFull;
});

// Indexes for better query performance
leagueSchema.index({ ownerId: 1 });
leagueSchema.index({ status: 1 });
leagueSchema.index({ inviteCode: 1 });
leagueSchema.index({ 'members.userId': 1 });
leagueSchema.index({ season: 1, status: 1 });

// Pre-save middleware to generate invite code
leagueSchema.pre('save', function(next) {
    if (!this.inviteCode) {
        this.inviteCode = this.generateInviteCode();
    }
    next();
});

// Instance method to generate invite code
leagueSchema.methods.generateInviteCode = function() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

// Instance method to add member
leagueSchema.methods.addMember = function(userId, role = 'member') {
    const existingMember = this.members.find(member => 
        member.userId.toString() === userId.toString()
    );

    if (existingMember) {
        existingMember.role = role;
        existingMember.isActive = true;
    } else {
        this.members.push({
            userId,
            role,
            joinedAt: new Date(),
            isActive: true
        });
    }

    return this.save();
};

// Instance method to remove member
leagueSchema.methods.removeMember = function(userId) {
    const member = this.members.find(member => 
        member.userId.toString() === userId.toString()
    );

    if (member) {
        member.isActive = false;
        return this.save();
    }

    return Promise.resolve(this);
};

// Instance method to check if user is member
leagueSchema.methods.isMember = function(userId) {
    return this.members.some(member => 
        member.userId.toString() === userId.toString() && member.isActive
    );
};

// Instance method to check if user is commissioner
leagueSchema.methods.isCommissioner = function(userId) {
    return this.members.some(member => 
        member.userId.toString() === userId.toString() && 
        member.isActive && 
        (member.role === 'commissioner' || member.role === 'owner')
    );
};

// Instance method to get member role
leagueSchema.methods.getMemberRole = function(userId) {
    const member = this.members.find(member => 
        member.userId.toString() === userId.toString() && member.isActive
    );
    return member ? member.role : null;
};

// Static method to find by invite code
leagueSchema.statics.findByInviteCode = function(inviteCode) {
    return this.findOne({ inviteCode, isPrivate: false });
};

// Static method to get user leagues
leagueSchema.statics.getUserLeagues = function(userId) {
    return this.find({
        'members.userId': userId,
        'members.isActive': true
    }).populate('ownerId', 'firstName lastName username');
};

// Static method to get league stats
leagueSchema.statics.getLeagueStats = async function(leagueId) {
    const league = await this.findById(leagueId)
        .populate('members.userId', 'firstName lastName username')
        .populate('standings.teamId', 'name abbreviation');

    if (!league) return null;

    return {
        totalTeams: league.totalTeams,
        availableSpots: league.availableSpots,
        isFull: league.isFull,
        canJoin: league.canJoin,
        currentWeek: league.currentWeek,
        status: league.status,
        standings: league.standings
    };
};

module.exports = mongoose.model('League', leagueSchema); 