export const OFFENSIVE_STARTING_SLOTS = {
    QB: 1,
    RB: 2,
    WR: 3,
    TE: 1,
    Flex: 2,
    K: 1,
};

export const POSITION_DISPLAY_LABELS = {
    Flex: 'Any',
    DFlex: 'DFlex',
    DST: 'D/ST',
};

export const formatPositionLabel = (pos) => POSITION_DISPLAY_LABELS[pos] || pos;

export const formatLineupSlotLabel = (slotKey = '') => {
    const match = String(slotKey).match(/^([A-Za-z]+)(\d+)$/);
    if (!match) return slotKey;
    return `${formatPositionLabel(match[1])} ${match[2]}`;
};

export const IDP_STARTING_SLOTS = {
    DL: 2,
    LB: 2,
    DB: 2,
    DFlex: 1,
};

export const DST_STARTING_SLOTS = {
    DST: 1,
};

export const DEFAULT_STARTING_SLOTS = {
    ...OFFENSIVE_STARTING_SLOTS,
    ...IDP_STARTING_SLOTS,
};

export const INITIAL_ROSTER_LIMITS = {
    Bench: 14,
    IR: 3,
};

export const DEFENSE_FORMATS = {
    IDP: 'idp',
    TEAM: 'team',
    BOTH: 'both',
    NONE: 'none',
};

export const DEFENSE_FORMAT_LABELS = {
    idp: 'Individual Defensive Players (IDP)',
    team: 'Team Defense / Special Teams (D/ST)',
    both: 'Both IDP and D/ST',
    none: 'No defensive starters',
};

const LINEUP_POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'Flex', 'DL', 'LB', 'DB', 'DFlex', 'DST', 'K'];

export const splitStartingSlots = (startingSlots = DEFAULT_STARTING_SLOTS) => {
    const saved = startingSlots && typeof startingSlots === 'object' ? startingSlots : {};
    const hasSaved = Object.keys(saved).length > 0;

    const pickGroup = (defaults) => {
        const result = {};
        const groupHasAny = Object.keys(defaults).some((pos) => saved[pos] != null);
        Object.entries(defaults).forEach(([pos, defaultCount]) => {
            if (!hasSaved) {
                result[pos] = defaultCount;
            } else if (saved[pos] != null) {
                result[pos] = Number(saved[pos]);
            } else if (groupHasAny) {
                // Omitted after being set to 0 (legacy saves filtered zeros out)
                result[pos] = 0;
            } else {
                // Group not configured yet (e.g. IDP when league uses team D/ST only)
                result[pos] = defaultCount;
            }
        });
        return result;
    };

    return {
        offense: pickGroup(OFFENSIVE_STARTING_SLOTS),
        idp: pickGroup(IDP_STARTING_SLOTS),
        dst: pickGroup(DST_STARTING_SLOTS),
    };
};

export const inferDefenseFormat = (startingSlots = DEFAULT_STARTING_SLOTS) => {
    const hasIdp = (startingSlots.DL || 0) + (startingSlots.LB || 0) + (startingSlots.DB || 0) + (startingSlots.DFlex || 0) > 0;
    const hasDst = (startingSlots.DST || 0) > 0;
    if (hasIdp && hasDst) return DEFENSE_FORMATS.BOTH;
    if (hasDst) return DEFENSE_FORMATS.TEAM;
    if (hasIdp) return DEFENSE_FORMATS.IDP;
    return DEFENSE_FORMATS.NONE;
};

export const buildStartingSlots = ({
    offenseSlots = OFFENSIVE_STARTING_SLOTS,
    defenseFormat = DEFENSE_FORMATS.IDP,
    idpSlots = IDP_STARTING_SLOTS,
    dstSlots = DST_STARTING_SLOTS,
} = {}) => {
    const slots = { ...offenseSlots };

    if (defenseFormat === DEFENSE_FORMATS.IDP || defenseFormat === DEFENSE_FORMATS.BOTH) {
        Object.assign(slots, idpSlots);
    }
    if (defenseFormat === DEFENSE_FORMATS.TEAM || defenseFormat === DEFENSE_FORMATS.BOTH) {
        Object.assign(slots, dstSlots);
    }

    return Object.fromEntries(
        Object.entries(slots).map(([pos, count]) => [pos, Math.max(0, Number(count) || 0)])
    );
};

export const buildLineupDisplayOrder = (startingSlots = DEFAULT_STARTING_SLOTS) => {
    const order = [];
    LINEUP_POSITION_ORDER.forEach((pos) => {
        const count = Number(startingSlots[pos] || 0);
        for (let i = 1; i <= count; i += 1) {
            order.push(`${pos}${i}`);
        }
    });
    return order;
};

export const buildInitialLineup = (startingSlots = DEFAULT_STARTING_SLOTS) => {
    const lineup = {};
    buildLineupDisplayOrder(startingSlots).forEach((slot) => {
        lineup[slot] = null;
    });
    return lineup;
};

/** Rebuild lineup to match startingSlots; players in removed slots go to bench. */
export const realignRosterToStartingSlots = (roster = {}, startingSlots = DEFAULT_STARTING_SLOTS) => {
    const nextLineup = buildInitialLineup(startingSlots);
    const bench = Array.isArray(roster.bench) ? [...roster.bench.filter(Boolean)] : [];
    const ir = Array.isArray(roster.ir) ? [...roster.ir.filter(Boolean)] : [];
    const oldLineup = roster.lineup && typeof roster.lineup === 'object' && !Array.isArray(roster.lineup)
        ? roster.lineup
        : {};

    Object.entries(oldLineup).forEach(([slot, playerId]) => {
        if (!playerId) return;
        if (Object.prototype.hasOwnProperty.call(nextLineup, slot)) {
            nextLineup[slot] = playerId;
        } else if (!bench.includes(playerId) && !ir.includes(playerId)) {
            bench.push(playerId);
        }
    });

    return { lineup: nextLineup, bench, ir };
};

export const formatDepthChartSummary = (startingSlots = DEFAULT_STARTING_SLOTS) => {
    const parts = [];
    LINEUP_POSITION_ORDER.forEach((pos) => {
        const count = Number(startingSlots[pos] || 0);
        if (count > 0) {
            parts.push(`${count} ${formatPositionLabel(pos)}`);
        }
    });
    return parts.length > 0 ? parts.join(', ') : 'No starters configured';
};

export const countStartingSlots = (startingSlots = DEFAULT_STARTING_SLOTS) => (
    Object.values(startingSlots).reduce((total, count) => total + Math.max(0, Number(count) || 0), 0)
);

export const LINEUP_DISPLAY_ORDER = buildLineupDisplayOrder(DEFAULT_STARTING_SLOTS);

export const STANDARD_SCORING_RULES = {
    passTd: 4,
    rushTd: 6,
    twoPointConversion: 2,
    completion: 0.5,
    passYard: 0.05,
    pass300YardBonus: 2,
    pass400YardBonus: 4,
    sack: -1,
    interception: -2,
    fumble: -2,
    recTd: 6,
    returnTd: 6,
    reception: 1,
    rushRecYard: 0.2,
    rushRec100YardBonus: 2,
    rushRec200YardBonus: 4,
    fumbleRecovery: 1,
    extraPoint: 1,
    fg39Less: 3,
    fg40_49: 4,
    fg50Plus: 5,
    missedFgEp: -1,
    tackle: 2,
    forcedFumble: 3,
    fumbleRecoveryDef: 4,
    interceptionDef: 4,
    returnYardDefSt: 0.2,
    passDefended: 0.5,
    defensiveStTd: 7,
    assistedTackle: 0.2,
    tackleForLoss: 1,
    dstPointsAllowed: 1,
    dstSack: 1,
    dstInterception: 2,
    dstFumbleRecovery: 2,
    dstTouchdown: 6,
    dstSafety: 2,
};

export const isDefensivePlayerPosition = (position) => ['DL', 'LB', 'DB'].includes(position);

export const isTeamDefensePosition = (position) => ['DST', 'DEF', 'D/ST'].includes(position);

export const WAIVER_TYPE_OPTIONS = [
    { value: 'auction', label: 'Auction (FAAB)' },
    { value: 'traditional', label: 'Traditional Priority' },
];

export const isFaabWaiver = (settings = {}) => (settings.waiverType || 'auction') === 'auction';

export const isPlayerSalaryEnabled = (settings = {}) => settings.usePlayerSalaries !== false;

export const isTeamSalaryCapEnabled = (settings = {}) => settings.useTeamSalaryCap !== false;

export const formatPlayerLabel = (player, settings = {}) => {
    if (!player) return '';
    const base = `${player.name} (${player.position})`;
    if (!isPlayerSalaryEnabled(settings)) {
        return base;
    }
    return `${base} - $${player.salary ?? 0}`;
};
