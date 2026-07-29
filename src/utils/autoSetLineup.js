import { getPlayerDetails } from './helpers.js';
import {
    canPlayerFillSlot,
    cloneRoster,
    removePlayerFromRoster,
} from './tradeRosterUtils.js';

/** Injury / availability statuses treated as unavailable for active slots. */
const OUT_STATUSES = new Set(['OUT', 'IR', 'INJURED RESERVE', 'SUSPENDED', 'SUS']);

export const getProjectedPoints = (player = {}) => {
    const direct = Number(player.projected_points);
    if (Number.isFinite(direct)) return direct;
    const consensus = Number(player.consensus_projection?.projected_points);
    if (Number.isFinite(consensus)) return consensus;
    return 0;
};

export const isPlayerOut = (player = {}) => {
    const injury = String(player.injury_status ?? '').trim().toUpperCase();
    if (OUT_STATUSES.has(injury)) return true;

    const status = String(player.status ?? '').trim().toUpperCase();
    return OUT_STATUSES.has(status);
};

export const isPlayerHealthyForStart = (player = {}) => {
    if (!player?.id && !player?.position) return false;
    return !isPlayerOut(player);
};

const resolvePlayer = (playerId, allPlayers) => {
    if (!playerId) return null;
    const details = getPlayerDetails(playerId, allPlayers);
    if (!details || (!details.id && !details.position && !details.name)) {
        return { id: playerId };
    }
    return { ...details, id: details.id || playerId };
};

const getIrCapacity = (rosterLimits = {}) => {
    const limit = Number(rosterLimits.IR);
    return Number.isFinite(limit) && limit >= 0 ? limit : 3;
};

/**
 * Move an OUT starter to IR when there is room, otherwise to the bench.
 */
const demoteOutPlayer = (roster, playerId, irLimit) => {
    removePlayerFromRoster(roster, playerId);
    if ((roster.ir || []).length < irLimit) {
        roster.ir.push(playerId);
        return 'ir';
    }
    roster.bench.push(playerId);
    return 'bench';
};

/**
 * Highest-projected healthy bench player eligible for the given lineup slot.
 */
export const findBestBenchReplacement = (benchIds, slotKey, allPlayers) => {
    let bestId = null;
    let bestProjection = -Infinity;

    (benchIds || []).forEach((playerId) => {
        const player = resolvePlayer(playerId, allPlayers);
        if (!player || !isPlayerHealthyForStart(player)) return;
        if (!canPlayerFillSlot(slotKey, player.position)) return;

        const projection = getProjectedPoints(player);
        if (projection > bestProjection) {
            bestProjection = projection;
            bestId = playerId;
        }
    });

    return bestId;
};

/**
 * Pure auto-roster pass:
 * 1) Demote OUT starters to IR (if available) or bench
 * 2) Fill empty active slots from the highest-projected healthy eligible bench players
 *
 * @returns {{ roster, changes: Array<{ type: string, slot?: string, playerId: string, to?: string }> }}
 */
export const computeAutoSetLineup = (roster, allPlayers = [], options = {}) => {
    const nextRoster = cloneRoster(roster);
    const irLimit = getIrCapacity(options.rosterLimits);
    const slotOrder = Array.isArray(options.slotOrder) && options.slotOrder.length
        ? options.slotOrder
        : Object.keys(nextRoster.lineup || {});
    const changes = [];

    // Ensure every slot in order exists on the lineup object
    slotOrder.forEach((slot) => {
        if (!(slot in nextRoster.lineup)) {
            nextRoster.lineup[slot] = null;
        }
    });

    // 1) Clear OUT starters into IR/bench
    slotOrder.forEach((slot) => {
        const playerId = nextRoster.lineup[slot];
        if (!playerId) return;

        const player = resolvePlayer(playerId, allPlayers);
        if (!isPlayerOut(player)) return;

        const destination = demoteOutPlayer(nextRoster, playerId, irLimit);
        nextRoster.lineup[slot] = null;
        changes.push({
            type: 'demote_out',
            slot,
            playerId,
            to: destination,
        });
    });

    // 2) Fill empty active slots from bench (highest projected eligible healthy)
    slotOrder.forEach((slot) => {
        if (nextRoster.lineup[slot]) return;

        const replacementId = findBestBenchReplacement(
            nextRoster.bench,
            slot,
            allPlayers
        );
        if (!replacementId) return;

        nextRoster.bench = nextRoster.bench.filter((id) => id !== replacementId);
        nextRoster.lineup[slot] = replacementId;
        changes.push({
            type: 'promote_bench',
            slot,
            playerId: replacementId,
        });
    });

    return { roster: nextRoster, changes };
};
