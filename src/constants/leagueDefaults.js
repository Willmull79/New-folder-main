export const OFFENSIVE_STARTING_SLOTS = {
    QB: 1,
    RB: 2,
    WR: 3,
    TE: 1,
    Flex: 2,
    K: 1,
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
    const offense = {};
    const idp = {};
    const dst = {};

    Object.entries(OFFENSIVE_STARTING_SLOTS).forEach(([pos]) => {
        if (startingSlots[pos] != null) offense[pos] = startingSlots[pos];
    });
    Object.entries(IDP_STARTING_SLOTS).forEach(([pos]) => {
        if (startingSlots[pos] != null) idp[pos] = startingSlots[pos];
    });
    Object.entries(DST_STARTING_SLOTS).forEach(([pos]) => {
        if (startingSlots[pos] != null) dst[pos] = startingSlots[pos];
    });

    return {
        offense: { ...OFFENSIVE_STARTING_SLOTS, ...offense },
        idp: { ...IDP_STARTING_SLOTS, ...idp },
        dst: { ...DST_STARTING_SLOTS, ...dst },
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
        Object.entries(slots).filter(([, count]) => Number(count) > 0)
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

export const formatDepthChartSummary = (startingSlots = DEFAULT_STARTING_SLOTS) => {
    const parts = [];
    LINEUP_POSITION_ORDER.forEach((pos) => {
        const count = Number(startingSlots[pos] || 0);
        if (count > 0) {
            parts.push(`${count} ${pos}`);
        }
    });
    return parts.length > 0 ? parts.join(', ') : 'No starters configured';
};

export const countStartingSlots = (startingSlots = DEFAULT_STARTING_SLOTS) => (
    Object.values(startingSlots).reduce((total, count) => total + Number(count || 0), 0)
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
