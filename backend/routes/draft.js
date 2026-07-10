const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateRequest, schemas } = require('../middleware/validation');
const { AppError } = require('../middleware/errorHandler');
const leagueService = require('../services/leagueService');

const router = express.Router();

const getUserId = (req) => req.user._id || req.user.id;

const getLeagueOrThrow = async (leagueId) => {
    const league = await leagueService.findById(leagueId);
    if (!league) {
        throw new AppError('League not found', 404);
    }
    return league;
};

const requireCommissioner = (league, userId) => {
    if (!leagueService.isCommissioner(league, userId)) {
        throw new AppError('Only commissioner can perform this action', 403);
    }
};

router.get('/:leagueId', asyncHandler(async (req, res) => {
    const { leagueId } = req.params;
    const userId = getUserId(req);
    const league = await getLeagueOrThrow(leagueId);

    const userTeam = leagueService.findUserTeam(league.teams, userId);
    if (!userTeam) {
        throw new AppError('Not authorized to access this league', 403);
    }

    const draft = league.draft || {};
    const draftOrder = draft.draftOrder || [];
    const currentPick = draft.currentPick || 0;

    const draftData = {
        status: draft.status || 'pending',
        currentPick,
        currentRound: draft.currentRound || 1,
        draftOrder,
        draftedPlayers: draft.draftedPlayers || [],
        availablePlayers: draft.availablePlayers || [],
        scheduledDateTime: draft.scheduledDateTime,
        startTime: draft.startTime || draft.startedAt,
        endTime: draft.endTime,
        settings: draft.settings || {},
        isMyTurn: false,
        picksUntilMyTurn: 0,
    };

    if (draftData.status === 'live' && draftOrder.length > 0) {
        const myPosition = draftOrder.findIndex(
            (teamId) => teamId === userTeam.id || teamId === userTeam._id
                || teamId?.toString?.() === userTeam.id,
        );
        if (myPosition !== -1) {
            draftData.isMyTurn = myPosition === currentPick;
            draftData.picksUntilMyTurn = Math.max(0, myPosition - currentPick);
        }
    }

    res.json({ success: true, data: draftData });
}));

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
        autoPick,
    } = req.body;
    const userId = getUserId(req);

    const league = await getLeagueOrThrow(leagueId);
    requireCommissioner(league, userId);

    const firstRoundOrder = roundOneOrder || draftOrder;
    if (firstRoundOrder && firstRoundOrder.length !== league.teams.length) {
        throw new AppError('Draft order must include all teams', 400);
    }

    const format = draftFormat || draftType || 'standard';
    const totalRounds = Math.min(Math.max(Number(rounds) || 20, 1), 20);
    const resolvedPickTime = pickTimeLimit !== undefined
        ? (pickTimeLimit === 0 ? null : pickTimeLimit)
        : (timeLimit || 60);

    const updateData = {
        'draft.settings': {
            draftFormat: format,
            draftType: format,
            rounds: totalRounds,
            pickTimeLimit: resolvedPickTime,
            timeLimit: resolvedPickTime,
            orderType: orderType || 'random',
            autoPick: autoPick || false,
        },
        'draft.status': firstRoundOrder ? 'order_set' : 'configured',
    };

    if (firstRoundOrder) {
        updateData['draft.roundOneOrder'] = firstRoundOrder;
        updateData['draft.draftOrder'] = leagueService.buildPickOrder(
            firstRoundOrder,
            format,
            totalRounds,
            league.teams.length,
        );
    }

    await leagueService.updateLeague(leagueId, updateData);

    res.json({
        success: true,
        message: 'Draft configured successfully',
        data: updateData,
    });
}));

router.post('/:leagueId/start', asyncHandler(async (req, res) => {
    const { leagueId } = req.params;
    const userId = getUserId(req);
    const league = await getLeagueOrThrow(leagueId);
    requireCommissioner(league, userId);

    if (league.draft?.status === 'live') {
        throw new AppError('Draft is already live', 400);
    }

    if (!league.draft?.draftOrder || league.draft.draftOrder.length === 0) {
        throw new AppError('Draft order must be set before starting', 400);
    }

    const draftState = {
        status: 'live',
        currentPick: 0,
        currentRound: 1,
        startTime: new Date(),
        availablePlayers: league.draft.availablePlayers || [],
        draftedPlayers: [],
        picks: [],
    };

    await leagueService.updateLeague(leagueId, { draft: { ...league.draft, ...draftState } });

    res.json({
        success: true,
        message: 'Draft started successfully',
        data: draftState,
    });
}));

router.post('/:leagueId/pick', validateRequest(schemas.draft.pick), asyncHandler(async (req, res) => {
    const { leagueId } = req.params;
    const { playerId } = req.body;
    const userId = getUserId(req);
    const league = await getLeagueOrThrow(leagueId);

    const userTeam = leagueService.findUserTeam(league.teams, userId);
    if (!userTeam) {
        throw new AppError('Not authorized to access this league', 403);
    }

    if (league.draft?.status !== 'live') {
        throw new AppError('Draft is not currently live', 400);
    }

    const currentPickIndex = league.draft.currentPick || 0;
    const draftOrder = league.draft.draftOrder || [];
    const currentTeamId = draftOrder[currentPickIndex];

    if (currentTeamId !== userTeam.id && currentTeamId !== userTeam._id
        && currentTeamId?.toString?.() !== userTeam.id) {
        throw new AppError('It is not your turn to pick', 400);
    }

    const availablePlayers = league.draft.availablePlayers || [];
    const playerAvailable = availablePlayers.some(
        (id) => id === playerId || id?.toString?.() === playerId,
    );
    if (!playerAvailable) {
        throw new AppError('Player is not available for drafting', 400);
    }

    const pickRecord = {
        playerId,
        teamId: userTeam.id || userTeam._id,
        round: league.draft.currentRound || 1,
        pick: currentPickIndex + 1,
        timestamp: new Date(),
    };

    const nextPick = currentPickIndex + 1;
    const teamCount = league.teams.length;
    const draftRounds = league.draft?.settings?.rounds || 20;
    const totalPicks = teamCount * draftRounds;

    const updatedDraft = {
        ...league.draft,
        currentPick: nextPick,
        currentRound: Math.floor(nextPick / teamCount) + 1,
        draftedPlayers: [...(league.draft.draftedPlayers || []), pickRecord],
        availablePlayers: availablePlayers.filter(
            (id) => id !== playerId && id?.toString?.() !== playerId,
        ),
        picks: [...(league.draft.picks || []), pickRecord],
    };

    if (nextPick >= totalPicks) {
        updatedDraft.status = 'completed';
        updatedDraft.endTime = new Date();
    }

    await leagueService.updateLeague(leagueId, { draft: updatedDraft });

    res.json({
        success: true,
        message: 'Pick made successfully',
        data: {
            pick: pickRecord,
            nextPick: updatedDraft.currentPick,
            nextRound: updatedDraft.currentRound,
            isComplete: updatedDraft.status === 'completed',
        },
    });
}));

router.post('/:leagueId/pause', asyncHandler(async (req, res) => {
    const { leagueId } = req.params;
    const userId = getUserId(req);
    const league = await getLeagueOrThrow(leagueId);
    requireCommissioner(league, userId);

    if (league.draft?.status !== 'live') {
        throw new AppError('Draft is not currently live', 400);
    }

    await leagueService.updateLeague(leagueId, { 'draft.status': 'paused' });
    res.json({ success: true, message: 'Draft paused successfully' });
}));

router.post('/:leagueId/resume', asyncHandler(async (req, res) => {
    const { leagueId } = req.params;
    const userId = getUserId(req);
    const league = await getLeagueOrThrow(leagueId);
    requireCommissioner(league, userId);

    if (league.draft?.status !== 'paused') {
        throw new AppError('Draft is not currently paused', 400);
    }

    await leagueService.updateLeague(leagueId, { 'draft.status': 'live' });
    res.json({ success: true, message: 'Draft resumed successfully' });
}));

router.post('/:leagueId/end', asyncHandler(async (req, res) => {
    const { leagueId } = req.params;
    const userId = getUserId(req);
    const league = await getLeagueOrThrow(leagueId);
    requireCommissioner(league, userId);

    if (league.draft?.status === 'completed') {
        throw new AppError('Draft is already completed', 400);
    }

    await leagueService.updateLeague(leagueId, {
        'draft.status': 'completed',
        'draft.endTime': new Date(),
        status: 'active',
    });

    res.json({ success: true, message: 'Draft ended successfully' });
}));

router.get('/:leagueId/order', asyncHandler(async (req, res) => {
    const { leagueId } = req.params;
    const userId = getUserId(req);
    const league = await getLeagueOrThrow(leagueId);

    const userTeam = leagueService.findUserTeam(league.teams, userId);
    if (!userTeam) {
        throw new AppError('Not authorized to access this league', 403);
    }

    res.json({
        success: true,
        data: {
            draftOrder: league.draft?.draftOrder || [],
            currentPick: league.draft?.currentPick || 0,
            currentRound: league.draft?.currentRound || 1,
        },
    });
}));

router.post('/:leagueId/order', asyncHandler(async (req, res) => {
    const { leagueId } = req.params;
    const { draftOrder } = req.body;
    const userId = getUserId(req);
    const league = await getLeagueOrThrow(leagueId);
    requireCommissioner(league, userId);

    if (!draftOrder || draftOrder.length !== league.teams.length) {
        throw new AppError('Draft order must include all teams', 400);
    }

    await leagueService.updateLeague(leagueId, {
        'draft.draftOrder': draftOrder,
        'draft.status': 'order_set',
    });

    res.json({ success: true, message: 'Draft order set successfully' });
}));

router.get('/:leagueId/history', asyncHandler(async (req, res) => {
    const { leagueId } = req.params;
    const userId = getUserId(req);
    const league = await getLeagueOrThrow(leagueId);

    const userTeam = leagueService.findUserTeam(league.teams, userId);
    if (!userTeam) {
        throw new AppError('Not authorized to access this league', 403);
    }

    res.json({
        success: true,
        data: {
            draftedPlayers: league.draft?.draftedPlayers || [],
            picks: league.draft?.picks || [],
            startTime: league.draft?.startTime || league.draft?.startedAt,
            endTime: league.draft?.endTime,
        },
    });
}));

module.exports = router;
