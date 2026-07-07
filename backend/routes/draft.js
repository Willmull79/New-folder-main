const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateRequest, schemas } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const League = require('../models/League');
const User = require('../models/User');

const router = express.Router();

// GET /api/draft/:leagueId - Get draft status and data
router.get('/:leagueId', asyncHandler(async (req, res) => {
    const { leagueId } = req.params;
    const userId = req.user.id;

    const league = await League.findById(leagueId)
        .populate('teams')
        .populate('draft.draftOrder', 'teamName ownerId')
        .populate('draft.draftedPlayers.playerId', 'name position nflTeam rank')
        .populate('draft.draftedPlayers.teamId', 'teamName');

    if (!league) {
        throw new AppError('League not found', 404);
    }

    // Check if user is part of this league
    const userTeam = league.teams.find(team => team.ownerId.toString() === userId);
    if (!userTeam) {
        throw new AppError('Not authorized to access this league', 403);
    }

    const draftData = {
        status: league.draft?.status || 'pending',
        currentPick: league.draft?.currentPick || 0,
        currentRound: league.draft?.currentRound || 1,
        draftOrder: league.draft?.draftOrder || [],
        draftedPlayers: league.draft?.draftedPlayers || [],
        availablePlayers: league.draft?.availablePlayers || [],
        scheduledDateTime: league.draft?.scheduledDateTime,
        startTime: league.draft?.startTime,
        endTime: league.draft?.endTime,
        settings: league.draft?.settings || {},
        isMyTurn: false,
        picksUntilMyTurn: 0
    };

    // Calculate turn information
    if (draftData.status === 'live' && draftData.draftOrder.length > 0) {
        const myPosition = draftData.draftOrder.findIndex(team => team._id.toString() === userTeam._id.toString());
        if (myPosition !== -1) {
            draftData.isMyTurn = myPosition === draftData.currentPick;
            draftData.picksUntilMyTurn = Math.max(0, myPosition - draftData.currentPick);
        }
    }

    res.json({
        success: true,
        data: draftData
    });
}));

// POST /api/draft/:leagueId/configure - Configure draft settings (Commissioner only)
router.post('/:leagueId/configure', validateRequest(schemas.draft.settings), asyncHandler(async (req, res) => {
    const { leagueId } = req.params;
    const {
        draftType,
        draftFormat,
        draftOrder,
        roundOneOrder,
        rounds,
        pickTimeLimit,
        timeLimit,
        orderType,
        autoPick
    } = req.body;
    const userId = req.user.id;

    const league = await League.findById(leagueId);
    if (!league) {
        throw new AppError('League not found', 404);
    }

    // Check if user is commissioner
    if (league.commissionerId.toString() !== userId) {
        throw new AppError('Only commissioner can configure draft', 403);
    }

    const firstRoundOrder = roundOneOrder || draftOrder;
    if (firstRoundOrder && firstRoundOrder.length !== league.teams.length) {
        throw new AppError('Draft order must include all teams', 400);
    }

    const format = draftFormat || draftType || 'standard';
    const totalRounds = Math.min(Math.max(Number(rounds) || 20, 1), 20);
    const resolvedPickTime = pickTimeLimit !== undefined
        ? (pickTimeLimit === 0 ? null : pickTimeLimit)
        : (timeLimit || 60);

    const buildPickOrder = (order) => {
        const pickOrder = [];
        for (let round = 1; round <= totalRounds; round++) {
            if (format === 'snake' && round % 2 === 0) {
                pickOrder.push(...[...order].reverse());
            } else {
                pickOrder.push(...order);
            }
        }
        return pickOrder;
    };

    const updateData = {
        'draft.settings': {
            draftFormat: format,
            draftType: format,
            rounds: totalRounds,
            pickTimeLimit: resolvedPickTime,
            timeLimit: resolvedPickTime,
            orderType: orderType || 'random',
            autoPick: autoPick || false
        },
        'draft.status': firstRoundOrder ? 'order_set' : 'configured'
    };

    if (firstRoundOrder) {
        updateData['draft.roundOneOrder'] = firstRoundOrder;
        updateData['draft.draftOrder'] = buildPickOrder(firstRoundOrder);
    }

    await League.findByIdAndUpdate(leagueId, updateData);

    res.json({
        success: true,
        message: 'Draft configured successfully',
        data: updateData
    });
}));

// POST /api/draft/:leagueId/start - Start the draft (Commissioner only)
router.post('/:leagueId/start', asyncHandler(async (req, res) => {
    const { leagueId } = req.params;
    const userId = req.user.id;

    const league = await League.findById(leagueId)
        .populate('teams')
        .populate('draft.draftOrder');

    if (!league) {
        throw new AppError('League not found', 404);
    }

    // Check if user is commissioner
    if (league.commissionerId.toString() !== userId) {
        throw new AppError('Only commissioner can start draft', 403);
    }

    // Validate draft is ready to start
    if (league.draft?.status === 'live') {
        throw new AppError('Draft is already live', 400);
    }

    if (!league.draft?.draftOrder || league.draft.draftOrder.length === 0) {
        throw new AppError('Draft order must be set before starting', 400);
    }

    // Initialize draft state
    const draftState = {
        status: 'live',
        currentPick: 0,
        currentRound: 1,
        startTime: new Date(),
        availablePlayers: [], // Will be populated with player data
        draftedPlayers: [],
        picks: []
    };

    await League.findByIdAndUpdate(leagueId, {
        'draft': { ...league.draft, ...draftState }
    });

    res.json({
        success: true,
        message: 'Draft started successfully',
        data: draftState
    });
}));

// POST /api/draft/:leagueId/pick - Make a draft pick
router.post('/:leagueId/pick', validateRequest(schemas.draft.pick), asyncHandler(async (req, res) => {
    const { leagueId } = req.params;
    const { playerId, round, pick } = req.body;
    const userId = req.user.id;

    const league = await League.findById(leagueId)
        .populate('teams')
        .populate('draft.draftOrder');

    if (!league) {
        throw new AppError('League not found', 404);
    }

    // Check if user is part of this league
    const userTeam = league.teams.find(team => team.ownerId.toString() === userId);
    if (!userTeam) {
        throw new AppError('Not authorized to access this league', 403);
    }

    // Validate draft is live
    if (league.draft?.status !== 'live') {
        throw new AppError('Draft is not currently live', 400);
    }

    // Validate it's the user's turn
    const currentPickIndex = league.draft.currentPick;
    const currentTeamId = league.draft.draftOrder[currentPickIndex]?._id.toString();
    
    if (currentTeamId !== userTeam._id.toString()) {
        throw new AppError('It is not your turn to pick', 400);
    }

    // Validate player is available
    if (!league.draft.availablePlayers.includes(playerId)) {
        throw new AppError('Player is not available for drafting', 400);
    }

    // Create pick record
    const pickRecord = {
        playerId: playerId,
        teamId: userTeam._id,
        round: league.draft.currentRound,
        pick: currentPickIndex + 1,
        timestamp: new Date()
    };

    // Update league draft state
    const updatedDraft = {
        ...league.draft,
        currentPick: currentPickIndex + 1,
        currentRound: Math.floor((currentPickIndex + 1) / league.teams.length) + 1,
        draftedPlayers: [...(league.draft.draftedPlayers || []), pickRecord],
        availablePlayers: league.draft.availablePlayers.filter(id => id !== playerId),
        picks: [...(league.draft.picks || []), pickRecord]
    };

    const draftRounds = league.draft?.settings?.rounds || 20;
    const totalPicks = league.teams.length * draftRounds;

    // Check if draft is complete
    if (updatedDraft.currentPick >= totalPicks) {
        updatedDraft.status = 'completed';
        updatedDraft.endTime = new Date();
    }

    await League.findByIdAndUpdate(leagueId, {
        'draft': updatedDraft
    });

    res.json({
        success: true,
        message: 'Pick made successfully',
        data: {
            pick: pickRecord,
            nextPick: updatedDraft.currentPick,
            nextRound: updatedDraft.currentRound,
            isComplete: updatedDraft.status === 'completed'
        }
    });
}));

// POST /api/draft/:leagueId/pause - Pause the draft (Commissioner only)
router.post('/:leagueId/pause', asyncHandler(async (req, res) => {
    const { leagueId } = req.params;
    const userId = req.user.id;

    const league = await League.findById(leagueId);
    if (!league) {
        throw new AppError('League not found', 404);
    }

    // Check if user is commissioner
    if (league.commissionerId.toString() !== userId) {
        throw new AppError('Only commissioner can pause draft', 403);
    }

    if (league.draft?.status !== 'live') {
        throw new AppError('Draft is not currently live', 400);
    }

    await League.findByIdAndUpdate(leagueId, {
        'draft.status': 'paused'
    });

    res.json({
        success: true,
        message: 'Draft paused successfully'
    });
}));

// POST /api/draft/:leagueId/resume - Resume the draft (Commissioner only)
router.post('/:leagueId/resume', asyncHandler(async (req, res) => {
    const { leagueId } = req.params;
    const userId = req.user.id;

    const league = await League.findById(leagueId);
    if (!league) {
        throw new AppError('League not found', 404);
    }

    // Check if user is commissioner
    if (league.commissionerId.toString() !== userId) {
        throw new AppError('Only commissioner can resume draft', 403);
    }

    if (league.draft?.status !== 'paused') {
        throw new AppError('Draft is not currently paused', 400);
    }

    await League.findByIdAndUpdate(leagueId, {
        'draft.status': 'live'
    });

    res.json({
        success: true,
        message: 'Draft resumed successfully'
    });
}));

// POST /api/draft/:leagueId/end - End the draft (Commissioner only)
router.post('/:leagueId/end', asyncHandler(async (req, res) => {
    const { leagueId } = req.params;
    const userId = req.user.id;

    const league = await League.findById(leagueId);
    if (!league) {
        throw new AppError('League not found', 404);
    }

    // Check if user is commissioner
    if (league.commissionerId.toString() !== userId) {
        throw new AppError('Only commissioner can end draft', 403);
    }

    if (league.draft?.status === 'completed') {
        throw new AppError('Draft is already completed', 400);
    }

    await League.findByIdAndUpdate(leagueId, {
        'draft.status': 'completed',
        'draft.endTime': new Date(),
        'status': 'active' // Move league to active status
    });

    res.json({
        success: true,
        message: 'Draft ended successfully'
    });
}));

// GET /api/draft/:leagueId/order - Get current draft order
router.get('/:leagueId/order', asyncHandler(async (req, res) => {
    const { leagueId } = req.params;
    const userId = req.user.id;

    const league = await League.findById(leagueId)
        .populate('draft.draftOrder', 'teamName ownerId');

    if (!league) {
        throw new AppError('League not found', 404);
    }

    // Check if user is part of this league
    const userTeam = league.teams.find(team => team.ownerId.toString() === userId);
    if (!userTeam) {
        throw new AppError('Not authorized to access this league', 403);
    }

    res.json({
        success: true,
        data: {
            draftOrder: league.draft?.draftOrder || [],
            currentPick: league.draft?.currentPick || 0,
            currentRound: league.draft?.currentRound || 1
        }
    });
}));

// POST /api/draft/:leagueId/order - Set draft order (Commissioner only)
router.post('/:leagueId/order', asyncHandler(async (req, res) => {
    const { leagueId } = req.params;
    const { draftOrder } = req.body;
    const userId = req.user.id;

    const league = await League.findById(leagueId);
    if (!league) {
        throw new AppError('League not found', 404);
    }

    // Check if user is commissioner
    if (league.commissionerId.toString() !== userId) {
        throw new AppError('Only commissioner can set draft order', 403);
    }

    // Validate draft order
    if (!draftOrder || draftOrder.length !== league.teams.length) {
        throw new AppError('Draft order must include all teams', 400);
    }

    await League.findByIdAndUpdate(leagueId, {
        'draft.draftOrder': draftOrder,
        'draft.status': 'order_set'
    });

    res.json({
        success: true,
        message: 'Draft order set successfully'
    });
}));

// GET /api/draft/:leagueId/history - Get draft history
router.get('/:leagueId/history', asyncHandler(async (req, res) => {
    const { leagueId } = req.params;
    const userId = req.user.id;

    const league = await League.findById(leagueId)
        .populate('draft.draftedPlayers.playerId', 'name position nflTeam rank')
        .populate('draft.draftedPlayers.teamId', 'teamName');

    if (!league) {
        throw new AppError('League not found', 404);
    }

    // Check if user is part of this league
    const userTeam = league.teams.find(team => team.ownerId.toString() === userId);
    if (!userTeam) {
        throw new AppError('Not authorized to access this league', 403);
    }

    res.json({
        success: true,
        data: {
            draftedPlayers: league.draft?.draftedPlayers || [],
            picks: league.draft?.picks || [],
            startTime: league.draft?.startTime,
            endTime: league.draft?.endTime
        }
    });
}));

module.exports = router; 