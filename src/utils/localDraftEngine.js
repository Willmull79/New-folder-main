import {
    clampRounds,
    draftTypeToFormat,
    generatePickOrder,
    MAX_ROUNDS,
} from './draftOrderUtils.js';

const normalizePlayer = (player) => ({
    id: player.id,
    name: player.name,
    position: player.position,
    nflTeam: player.nflTeam || player.team || 'FA',
    rank: player.rank || 999,
    salary: player.salary || 1,
});

export function buildTimerState(draft, leagueTeams = []) {
    if (!draft) {
        return {
            status: 'pending',
            currentPick: 0,
            draftOrder: [],
            roundOneOrder: [],
            currentTeamId: null,
            timeRemaining: 0,
            settings: {},
        };
    }

    if (draft.status !== 'live') {
        return {
            status: draft.status || 'pending',
            currentPick: draft.currentPick ?? 0,
            currentRound: draft.currentRound ?? 1,
            draftOrder: draft.draftOrder || [],
            roundOneOrder: draft.roundOneOrder || [],
            currentTeamId: draft.currentTeamId || null,
            timeRemaining: draft.status === 'paused' ? (draft.pausedTimeRemaining ?? 0) : 0,
            settings: draft.settings || {},
        };
    }

    const currentPick = draft.currentPick ?? 0;
    const draftOrder = draft.draftOrder || [];
    const roundOneOrder = draft.roundOneOrder || [];
    const numTeams = roundOneOrder.length || leagueTeams.length || 1;
    const currentTeamId = draftOrder[currentPick] || draft.currentTeamId || null;
    let timeRemaining = 0;

    if (draft.pickDeadline) {
        timeRemaining = Math.max(
            0,
            Math.floor((new Date(draft.pickDeadline).getTime() - Date.now()) / 1000)
        );
    }

    return {
        status: draft.status,
        currentPick,
        currentRound: draft.currentRound || Math.floor(currentPick / numTeams) + 1,
        draftOrder,
        roundOneOrder,
        currentTeamId,
        timeRemaining,
        settings: draft.settings || {},
        pickTimeLimit: draft.settings?.pickTimeLimit ?? draft.pickTimeLimit ?? 60,
    };
}

export async function startDraftLocal(db, leagueId, playerPool = []) {
    const leagueRef = db.doc(`leagues/${leagueId}`);
    const snap = await leagueRef.get();
    if (!snap.exists) throw new Error('League not found');

    const league = snap.data();
    const draft = league.draft || {};
    const draftType = league.settings?.draftType || draft.type || 'standard';

    if (draft.status === 'live') throw new Error('Draft is already live');

    let roundOneOrder = draft.roundOneOrder || [];
    if (!roundOneOrder.length) {
        roundOneOrder = league.teams || [];
    }
    if (!roundOneOrder.length) {
        throw new Error('Set the draft order before starting the draft.');
    }

    const rounds = clampRounds(draft.settings?.rounds ?? MAX_ROUNDS);
    const draftFormat = draftTypeToFormat(draftType);
    const draftOrder = draft.draftOrder?.length
        ? draft.draftOrder
        : generatePickOrder(roundOneOrder, draftFormat, rounds);

    const normalizedPool = (playerPool.length ? playerPool : draft.availablePlayers || [])
        .map(normalizePlayer);

    if (!normalizedPool.length) {
        throw new Error('No players available for the draft. Reload the page and try again.');
    }

    const pickTimeLimit = draft.settings?.pickTimeLimit ?? 60;
    const pickDeadline = pickTimeLimit
        ? new Date(Date.now() + pickTimeLimit * 1000).toISOString()
        : null;

    const nextDraft = {
        ...draft,
        type: draftType,
        status: 'live',
        roundOneOrder,
        draftOrder,
        currentPick: 0,
        currentRound: 1,
        availablePlayers: normalizedPool,
        draftedPlayers: [],
        picks: [],
        pickTimeLimit,
        pickDeadline,
        currentTeamId: draftOrder[0],
        startedAt: new Date().toISOString(),
        settings: {
            ...(draft.settings || {}),
            rounds,
            pickTimeLimit,
            draftFormat,
        },
    };

    await leagueRef.update({ draft: nextDraft });
    return buildTimerState(nextDraft, league.teams);
}

export async function makeDraftPickLocal(db, leagueId, teamId, playerId, playerPool = []) {
    const leagueRef = db.doc(`leagues/${leagueId}`);

    return db.runTransaction(async (transaction) => {
        const snap = await transaction.get(leagueRef);
        if (!snap.exists) throw new Error('League not found');

        const league = snap.data();
        const draft = league.draft || {};

        if (draft.status !== 'live') throw new Error('Draft is not currently live');

        const currentPick = draft.currentPick ?? 0;
        const draftOrder = draft.draftOrder || [];
        const onClockTeam = draftOrder[currentPick];

        if (onClockTeam !== teamId) throw new Error("It's not your turn to pick");

        const available = draft.availablePlayers || [];
        let player = available.find((entry) => entry.id === playerId);
        if (!player) {
            player = playerPool.find((entry) => entry.id === playerId);
        }
        if (!player) throw new Error('Player is not available');

        const normalizedPlayer = normalizePlayer(player);
        const newAvailable = available.filter((entry) => entry.id !== playerId);
        const numTeams = draft.roundOneOrder?.length || league.teams?.length || 1;
        const pickRecord = {
            pickNumber: currentPick + 1,
            round: draft.currentRound || Math.floor(currentPick / numTeams) + 1,
            teamId,
            playerId: normalizedPlayer.id,
            player: normalizedPlayer,
            timestamp: new Date().toISOString(),
        };

        const picks = [...(draft.picks || []), pickRecord];
        const draftedPlayers = [
            ...(draft.draftedPlayers || []),
            { ...normalizedPlayer, teamId, pickNumber: currentPick + 1 },
        ];
        const nextPick = currentPick + 1;
        const isComplete = nextPick >= draftOrder.length;
        const pickTimeLimit = draft.settings?.pickTimeLimit ?? draft.pickTimeLimit ?? 60;
        const pickDeadline = !isComplete && pickTimeLimit
            ? new Date(Date.now() + pickTimeLimit * 1000).toISOString()
            : null;

        const teamRef = db.doc(`leagues/${leagueId}/teams/${teamId}`);
        const teamSnap = await transaction.get(teamRef);
        if (teamSnap.exists) {
            const team = teamSnap.data();
            const roster = team.roster || { lineup: {}, bench: [], ir: [] };
            transaction.update(teamRef, {
                roster: {
                    ...roster,
                    bench: [...(roster.bench || []), normalizedPlayer.id],
                },
            });
        }

        transaction.update(leagueRef, {
            allRosteredPlayerIds: firebase.firestore.FieldValue.arrayUnion(normalizedPlayer.id),
            draft: {
                ...draft,
                currentPick: isComplete ? currentPick : nextPick,
                currentRound: isComplete
                    ? draft.currentRound
                    : Math.floor(nextPick / numTeams) + 1,
                currentTeamId: isComplete ? null : draftOrder[nextPick],
                availablePlayers: newAvailable,
                picks,
                draftedPlayers,
                pickDeadline,
                status: isComplete ? 'completed' : 'live',
                completedAt: isComplete ? new Date().toISOString() : draft.completedAt || null,
            },
        });

        return { success: true, pick: pickRecord, complete: isComplete };
    });
}

export async function pauseDraftLocal(db, leagueId) {
    const leagueRef = db.doc(`leagues/${leagueId}`);
    const snap = await leagueRef.get();
    if (!snap.exists) throw new Error('League not found');

    const draft = snap.data().draft || {};
    if (draft.status !== 'live') throw new Error('Draft is not live');

    let pausedTimeRemaining = draft.settings?.pickTimeLimit ?? draft.pickTimeLimit ?? 60;
    if (draft.pickDeadline) {
        pausedTimeRemaining = Math.max(
            0,
            Math.floor((new Date(draft.pickDeadline).getTime() - Date.now()) / 1000)
        );
    }

    const nextDraft = {
        ...draft,
        status: 'paused',
        pausedAt: new Date().toISOString(),
        pausedTimeRemaining,
        pickDeadline: null,
    };

    await leagueRef.update({ draft: nextDraft });
    return buildTimerState(nextDraft, snap.data().teams);
}

export async function resumeDraftLocal(db, leagueId) {
    const leagueRef = db.doc(`leagues/${leagueId}`);
    const snap = await leagueRef.get();
    if (!snap.exists) throw new Error('League not found');

    const draft = snap.data().draft || {};
    if (draft.status !== 'paused') throw new Error('Draft is not paused');

    const remaining = draft.pausedTimeRemaining ?? draft.settings?.pickTimeLimit ?? 60;
    const pickDeadline = remaining
        ? new Date(Date.now() + remaining * 1000).toISOString()
        : null;

    const nextDraft = {
        ...draft,
        status: 'live',
        pickDeadline,
        pausedAt: null,
        pausedTimeRemaining: null,
    };

    await leagueRef.update({ draft: nextDraft });
    return buildTimerState(nextDraft, snap.data().teams);
}

export async function stopDraftLocal(db, leagueId) {
    const leagueRef = db.doc(`leagues/${leagueId}`);
    const snap = await leagueRef.get();
    if (!snap.exists) throw new Error('League not found');

    const draft = snap.data().draft || {};
    if (!['live', 'paused'].includes(draft.status)) {
        throw new Error('Draft is not currently running');
    }

    const nextDraft = {
        ...draft,
        status: 'completed',
        pickDeadline: null,
        pausedAt: null,
        pausedTimeRemaining: null,
        completedAt: new Date().toISOString(),
        stoppedByCommissioner: true,
    };

    await leagueRef.update({ draft: nextDraft });
    return buildTimerState(nextDraft, snap.data().teams);
}

export async function resetDraftLocal(db, leagueId, playerPool = []) {
    const leagueRef = db.doc(`leagues/${leagueId}`);
    const snap = await leagueRef.get();
    if (!snap.exists) throw new Error('League not found');

    const league = snap.data();
    const draft = league.draft || {};
    const draftedIds = [
        ...new Set([
            ...(draft.draftedPlayers || []).map((player) => player.id),
            ...(draft.picks || []).map((pick) => pick.playerId),
        ]),
    ];

    const teamUpdates = await Promise.all((league.teams || []).map(async (teamId) => {
        const teamRef = db.doc(`leagues/${leagueId}/teams/${teamId}`);
        const teamSnap = await teamRef.get();
        if (!teamSnap.exists) return null;
        const roster = teamSnap.data().roster || { lineup: {}, bench: [], ir: [] };
        return {
            ref: teamRef,
            roster: {
                ...roster,
                bench: (roster.bench || []).filter((playerId) => !draftedIds.includes(playerId)),
            },
        };
    }));

    const resetBatch = db.batch();
    teamUpdates.filter(Boolean).forEach(({ ref, roster }) => {
        resetBatch.update(ref, { roster });
    });

    const roundOneOrder = draft.roundOneOrder || league.teams || [];
    const normalizedPool = (playerPool.length ? playerPool : draft.availablePlayers || []).map(normalizePlayer);
    const leagueUpdate = {
        draft: {
            ...draft,
            status: roundOneOrder.length ? 'order_set' : 'pending',
            currentPick: 0,
            currentRound: 1,
            currentTeamId: roundOneOrder[0] || null,
            availablePlayers: normalizedPool,
            draftedPlayers: [],
            picks: [],
            pickDeadline: null,
            pausedAt: null,
            pausedTimeRemaining: null,
            completedAt: null,
            startedAt: null,
            stoppedByCommissioner: null,
        },
    };

    if (draftedIds.length) {
        leagueUpdate.allRosteredPlayerIds = firebase.firestore.FieldValue.arrayRemove(...draftedIds);
    }

    resetBatch.update(leagueRef, leagueUpdate);
    await resetBatch.commit();
    return buildTimerState(leagueUpdate.draft, league.teams);
}
