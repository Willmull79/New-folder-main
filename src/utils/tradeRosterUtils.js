import {
    isDefensivePlayerPosition,
    isTeamDefensePosition,
} from '../constants/leagueDefaults.js';

export const cloneRoster = (roster = {}) => {
    const lineup = roster.lineup && typeof roster.lineup === 'object' && !Array.isArray(roster.lineup)
        ? { ...roster.lineup }
        : {};
    return {
        lineup,
        bench: Array.isArray(roster.bench) ? [...roster.bench] : [],
        ir: Array.isArray(roster.ir) ? [...roster.ir] : [],
    };
};

export const canPlayerFillSlot = (slotKey, position) => {
    const slotPosition = String(slotKey).replace(/[0-9]/g, '');
    if (slotPosition === position) return true;
    if (slotPosition === 'Flex' && ['RB', 'WR', 'TE'].includes(position)) return true;
    if (slotPosition === 'DFlex' && isDefensivePlayerPosition(position)) return true;
    if (slotPosition === 'DST' && isTeamDefensePosition(position)) return true;
    if (slotPosition === 'DEF' && isTeamDefensePosition(position)) return true;
    return false;
};

export const findPlayerLocation = (roster, playerId) => {
    const lineup = roster?.lineup || {};
    for (const slot of Object.keys(lineup)) {
        if (lineup[slot] === playerId) {
            return { type: 'lineup', slot };
        }
    }
    const benchIndex = (roster?.bench || []).indexOf(playerId);
    if (benchIndex >= 0) {
        return { type: 'bench', index: benchIndex };
    }
    const irIndex = (roster?.ir || []).indexOf(playerId);
    if (irIndex >= 0) {
        return { type: 'ir', index: irIndex };
    }
    return null;
};

export const removePlayerFromRoster = (roster, playerId) => {
    Object.keys(roster.lineup || {}).forEach((slot) => {
        if (roster.lineup[slot] === playerId) {
            roster.lineup[slot] = null;
        }
    });
    roster.bench = (roster.bench || []).filter((id) => id !== playerId);
    roster.ir = (roster.ir || []).filter((id) => id !== playerId);
};

export const placePlayerInOpenSlot = (roster, playerId, position, teamName) => {
    const lineup = roster.lineup || {};
    const openSlots = Object.keys(lineup).filter((slot) => !lineup[slot]);

    const exact = openSlots.filter((slot) => {
        const slotPosition = String(slot).replace(/[0-9]/g, '');
        return slotPosition === position
            || (slotPosition === 'DST' && isTeamDefensePosition(position))
            || (slotPosition === 'DEF' && isTeamDefensePosition(position));
    });
    const flex = openSlots.filter((slot) => {
        const slotPosition = String(slot).replace(/[0-9]/g, '');
        return slotPosition === 'Flex' || slotPosition === 'DFlex';
    });

    const ordered = [...exact, ...flex].filter((slot) => canPlayerFillSlot(slot, position));
    const targetSlot = ordered[0];

    if (!targetSlot) {
        throw new Error(
            `${teamName || 'A team'} does not have an open ${position || 'matching'} roster slot for a player.`
        );
    }

    roster.lineup[targetSlot] = playerId;
    return targetSlot;
};

/** Restore a player to a previously recorded location, or the first open positional slot. */
export const placePlayerAtLocation = (roster, playerId, location, position, teamName) => {
    if (location?.type === 'lineup' && location.slot) {
        if (!roster.lineup[location.slot]) {
            roster.lineup[location.slot] = playerId;
            return location.slot;
        }
    }
    if (location?.type === 'bench') {
        roster.bench.push(playerId);
        return 'bench';
    }
    if (location?.type === 'ir') {
        roster.ir.push(playerId);
        return 'ir';
    }
    return placePlayerInOpenSlot(roster, playerId, position, teamName);
};

export const getTradeParties = (trade = {}) => {
    const senderTeamId = trade.senderTeamId || trade.proposedBy;
    const receiverTeamId = trade.receiverTeamId
        || (Array.isArray(trade.teams) ? trade.teams.find((id) => id !== senderTeamId) : null);
    return { senderTeamId, receiverTeamId };
};
