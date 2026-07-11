/**
 * Local Firestore auction draft engine.
 * Nomination → bidding → award on bid deadline.
 */

const firebase = typeof window !== 'undefined' ? window.firebase : null;

const normalizePlayer = (player) => {
    const firstName = (player.first_name || '').trim();
    const lastName = (player.last_name || '').trim();
    const name = (player.name || `${firstName} ${lastName}`.trim() || 'Unknown').trim();

    return {
        id: player.id,
        name,
        first_name: firstName || name.split(/\s+/)[0] || '',
        last_name: lastName || name.split(/\s+/).slice(1).join(' ') || '',
        position: player.position,
        nflTeam: player.nflTeam || player.team || 'FA',
        team: player.nflTeam || player.team || 'FA',
        rank: player.rank || 999,
        salary: player.salary || 1,
    };
};

const toFiniteNumber = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

const getMinBid = (league) => {
    const settings = league.settings || {};
    if (settings.usePlayerSalaries === false) return 1;
    return Math.max(1, toFiniteNumber(settings.minPlayerSalary, 1));
};

const getBidSeconds = (draft) => {
    const limit = draft.settings?.pickTimeLimit ?? draft.pickTimeLimit ?? 30;
    if (limit == null) return 30;
    return Math.max(10, Number(limit) || 30);
};

const getNominationOrder = (draft, league) => {
    if (draft.nominationOrder?.length) return draft.nominationOrder;
    if (draft.roundOneOrder?.length) return draft.roundOneOrder;
    return league.teams || [];
};

/**
 * Start an auction draft (called from startDraftLocal when type is auction).
 */
export async function startAuctionLocal(db, leagueId, playerPool = []) {
    const leagueRef = db.doc(`leagues/${leagueId}`);
    const snap = await leagueRef.get();
    if (!snap.exists) throw new Error('League not found');

    const league = snap.data();
    const draft = league.draft || {};

    if (draft.status === 'live' || league.auction?.status === 'live') {
        throw new Error('Auction is already live');
    }

    let nominationOrder = getNominationOrder(draft, league);
    if (!nominationOrder.length) {
        throw new Error('Set the nomination / draft order before starting the auction.');
    }

    const normalizedPool = (playerPool.length ? playerPool : draft.availablePlayers || [])
        .map(normalizePlayer)
        .filter((player) => {
            const team = String(player.nflTeam ?? player.team ?? '').trim().toUpperCase();
            return Boolean(team) && team !== 'FA' && team !== 'FREE AGENT';
        });

    if (!normalizedPool.length) {
        throw new Error('No players available for the auction. Reload the page and try again.');
    }

    const bidSeconds = getBidSeconds(draft);
    const nextDraft = {
        ...draft,
        type: 'auction',
        status: 'live',
        availablePlayers: normalizedPool,
        draftedPlayers: [],
        picks: [],
        nominationOrder,
        currentNominatorIndex: 0,
        currentTeamId: nominationOrder[0],
        startedAt: new Date().toISOString(),
        auctionLive: {
            currentPlayer: null,
            currentBid: 0,
            currentBidder: null,
            bidDeadline: null,
            isActive: false,
            nominatorTeamId: nominationOrder[0],
            bidSeconds,
        },
        settings: {
            ...(draft.settings || {}),
            pickTimeLimit: draft.settings?.pickTimeLimit ?? bidSeconds,
        },
    };

    await leagueRef.update({
        draft: nextDraft,
        auction: {
            ...(league.auction || {}),
            status: 'live',
            startedAt: new Date().toISOString(),
        },
    });

    return {
        status: 'live',
        type: 'auction',
        currentTeamId: nominationOrder[0],
        timeRemaining: 0,
        draftOrder: nominationOrder,
    };
}

/**
 * Nominate a player to start bidding.
 */
export async function nominatePlayerLocal(db, leagueId, teamId, playerId, playerPool = []) {
    const leagueRef = db.doc(`leagues/${leagueId}`);

    return db.runTransaction(async (transaction) => {
        const snap = await transaction.get(leagueRef);
        if (!snap.exists) throw new Error('League not found');

        const league = snap.data();
        const draft = league.draft || {};
        if (draft.status !== 'live' || draft.type !== 'auction') {
            throw new Error('Auction is not live');
        }

        const auctionLive = draft.auctionLive || {};
        if (auctionLive.isActive && auctionLive.currentPlayer) {
            throw new Error('An auction is already in progress');
        }

        const nominationOrder = getNominationOrder(draft, league);
        const nominatorIndex = draft.currentNominatorIndex ?? 0;
        const nominatorId = nominationOrder[nominatorIndex % nominationOrder.length];
        if (nominatorId !== teamId) {
            throw new Error("It's not your turn to nominate");
        }

        const available = draft.availablePlayers || [];
        let player = available.find((entry) => entry.id === playerId);
        if (!player) {
            player = playerPool.find((entry) => entry.id === playerId);
        }
        if (!player) throw new Error('Player is not available');

        const normalized = normalizePlayer(player);
        const minBid = getMinBid(league);
        const bidSeconds = getBidSeconds(draft);
        const bidDeadline = new Date(Date.now() + bidSeconds * 1000).toISOString();

        transaction.update(leagueRef, {
            draft: {
                ...draft,
                currentTeamId: teamId,
                auctionLive: {
                    currentPlayer: normalized,
                    currentBid: minBid,
                    currentBidder: teamId,
                    bidDeadline,
                    isActive: true,
                    nominatorTeamId: teamId,
                    bidSeconds,
                    nominatedAt: new Date().toISOString(),
                },
            },
        });

        return {
            success: true,
            player: normalized,
            currentBid: minBid,
            bidDeadline,
        };
    });
}

/**
 * Place a bid on the active auction player.
 */
export async function placeAuctionBidLocal(db, leagueId, teamId, amount) {
    const leagueRef = db.doc(`leagues/${leagueId}`);
    const bidAmount = toFiniteNumber(amount, 0);

    return db.runTransaction(async (transaction) => {
        const snap = await transaction.get(leagueRef);
        if (!snap.exists) throw new Error('League not found');

        const league = snap.data();
        const draft = league.draft || {};
        const auctionLive = draft.auctionLive || {};

        if (draft.status !== 'live' || draft.type !== 'auction') {
            throw new Error('Auction is not live');
        }
        if (!auctionLive.isActive || !auctionLive.currentPlayer) {
            throw new Error('No player is up for auction');
        }

        const minBid = auctionLive.currentBid + 1;
        if (bidAmount < minBid) {
            throw new Error(`Bid must be at least $${minBid}`);
        }

        const settings = league.settings || {};
        if (settings.useTeamSalaryCap !== false) {
            const teamRef = db.doc(`leagues/${leagueId}/teams/${teamId}`);
            const teamSnap = await transaction.get(teamRef);
            if (!teamSnap.exists) throw new Error('Team not found');

            const team = teamSnap.data() || {};
            const spent = toFiniteNumber(team.salarySpent, 0);
            const cap = toFiniteNumber(settings.teamSalary, 1000);
            if (spent + bidAmount > cap) {
                throw new Error(
                    `Bid would exceed salary cap (spent $${spent}, cap $${cap})`,
                );
            }
        }

        const bidSeconds = auctionLive.bidSeconds || getBidSeconds(draft);
        const bidDeadline = new Date(Date.now() + bidSeconds * 1000).toISOString();

        transaction.update(leagueRef, {
            draft: {
                ...draft,
                auctionLive: {
                    ...auctionLive,
                    currentBid: bidAmount,
                    currentBidder: teamId,
                    bidDeadline,
                    lastBidAt: new Date().toISOString(),
                },
            },
        });

        return {
            success: true,
            currentBid: bidAmount,
            currentBidder: teamId,
            bidDeadline,
        };
    });
}

/**
 * Award the current auction player when the bid timer expires.
 * Safe to call from multiple clients — transaction no-ops if already resolved.
 */
export async function resolveExpiredAuctionLocal(db, leagueId) {
    const leagueRef = db.doc(`leagues/${leagueId}`);

    return db.runTransaction(async (transaction) => {
        const snap = await transaction.get(leagueRef);
        if (!snap.exists) throw new Error('League not found');

        const league = snap.data();
        const draft = league.draft || {};
        const auctionLive = draft.auctionLive || {};

        if (draft.status !== 'live' || draft.type !== 'auction') {
            return { resolved: false, reason: 'not_live' };
        }
        if (!auctionLive.isActive || !auctionLive.currentPlayer || !auctionLive.currentBidder) {
            return { resolved: false, reason: 'no_active_auction' };
        }
        if (auctionLive.bidDeadline) {
            const remaining = new Date(auctionLive.bidDeadline).getTime() - Date.now();
            if (remaining > 500) {
                return { resolved: false, reason: 'timer_active' };
            }
        }

        const player = normalizePlayer(auctionLive.currentPlayer);
        const winningTeamId = auctionLive.currentBidder;
        const winningBid = toFiniteNumber(auctionLive.currentBid, getMinBid(league));
        player.salary = winningBid;

        const available = (draft.availablePlayers || []).filter((entry) => entry.id !== player.id);
        const draftedPlayers = [
            ...(draft.draftedPlayers || []),
            {
                ...player,
                teamId: winningTeamId,
                bid: winningBid,
                pickNumber: (draft.draftedPlayers || []).length + 1,
            },
        ];
        const picks = [
            ...(draft.picks || []),
            {
                teamId: winningTeamId,
                playerId: player.id,
                player,
                bid: winningBid,
                timestamp: new Date().toISOString(),
            },
        ];

        const nominationOrder = getNominationOrder(draft, league);
        const nextNominatorIndex = ((draft.currentNominatorIndex ?? 0) + 1) % Math.max(nominationOrder.length, 1);
        const nextNominator = nominationOrder[nextNominatorIndex] || null;

        const teamRef = db.doc(`leagues/${leagueId}/teams/${winningTeamId}`);
        const teamSnap = await transaction.get(teamRef);
        if (teamSnap.exists) {
            const team = teamSnap.data() || {};
            const roster = team.roster || { lineup: {}, bench: [], ir: [] };
            transaction.update(teamRef, {
                roster: {
                    ...roster,
                    bench: [...(roster.bench || []), player.id],
                },
                salarySpent: toFiniteNumber(team.salarySpent, 0) + winningBid,
                playerSalaries: {
                    ...(team.playerSalaries || {}),
                    [player.id]: winningBid,
                },
            });
        }

        const rosteredUpdate = firebase?.firestore?.FieldValue
            ? { allRosteredPlayerIds: firebase.firestore.FieldValue.arrayUnion(player.id) }
            : {
                allRosteredPlayerIds: [...new Set([
                    ...(league.allRosteredPlayerIds || []),
                    player.id,
                ])],
            };

        transaction.update(leagueRef, {
            ...rosteredUpdate,
            draft: {
                ...draft,
                availablePlayers: available,
                draftedPlayers,
                picks,
                currentNominatorIndex: nextNominatorIndex,
                currentTeamId: nextNominator,
                auctionLive: {
                    currentPlayer: null,
                    currentBid: 0,
                    currentBidder: null,
                    bidDeadline: null,
                    isActive: false,
                    nominatorTeamId: nextNominator,
                    bidSeconds: auctionLive.bidSeconds || getBidSeconds(draft),
                    lastAwardedAt: new Date().toISOString(),
                    lastAwardedPlayerId: player.id,
                },
            },
        });

        return {
            resolved: true,
            player,
            winningTeamId,
            winningBid,
            nextNominator,
        };
    });
}

export async function completeAuctionLocal(db, leagueId) {
    const leagueRef = db.doc(`leagues/${leagueId}`);
    const snap = await leagueRef.get();
    if (!snap.exists) throw new Error('League not found');

    const league = snap.data();
    const draft = league.draft || {};

    await leagueRef.update({
        'draft.status': 'completed',
        'draft.completedAt': new Date().toISOString(),
        'draft.auctionLive': {
            currentPlayer: null,
            currentBid: 0,
            currentBidder: null,
            bidDeadline: null,
            isActive: false,
        },
        'auction.status': 'complete',
    });

    return { success: true, draft: { ...draft, status: 'completed' } };
}
