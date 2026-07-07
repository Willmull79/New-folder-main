export const MIN_PICK_TIME = 15;
export const MIN_ROUNDS = 1;
export const MAX_ROUNDS = 20;

export const PICK_TIME_OPTIONS = [
    { value: 15, label: '15 seconds' },
    { value: 30, label: '30 seconds' },
    { value: 45, label: '45 seconds' },
    { value: 60, label: '60 seconds' },
    { value: 90, label: '90 seconds' },
    { value: 120, label: '2 minutes' },
    { value: 180, label: '3 minutes' },
    { value: 300, label: '5 minutes' },
    { value: null, label: 'Unlimited' }
];

export const DRAFT_FORMAT_OPTIONS = [
    { value: 'standard', label: 'Standard Draft' },
    { value: 'snake', label: 'Snake Draft' }
];

export const DRAFT_TYPE_OPTIONS = [
    { value: 'auction', label: 'Auction Draft' },
    { value: 'standard', label: 'Standard Draft' },
    { value: 'snake', label: 'Snake Draft' },
];

export function toDateTimeLocalValue(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (part) => String(part).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function draftTypeToFormat(draftType) {
    if (draftType === 'snake') return 'snake';
    if (draftType === 'standard') return 'standard';
    return 'standard';
}

export function shuffleArray(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

export function clampRounds(rounds) {
    const value = Number(rounds);
    if (Number.isNaN(value)) return MAX_ROUNDS;
    return Math.min(Math.max(value, MIN_ROUNDS), MAX_ROUNDS);
}

export function generatePickOrder(roundOneOrder, draftFormat = 'standard', rounds = MAX_ROUNDS) {
    if (!roundOneOrder?.length) return [];

    const totalRounds = clampRounds(rounds);
    const pickOrder = [];

    for (let round = 1; round <= totalRounds; round++) {
        if (draftFormat === 'snake' && round % 2 === 0) {
            pickOrder.push(...[...roundOneOrder].reverse());
        } else {
            pickOrder.push(...roundOneOrder);
        }
    }

    return pickOrder;
}

export function getRoundFromPickIndex(pickIndex, numTeams) {
    if (!numTeams) return 1;
    return Math.floor(pickIndex / numTeams) + 1;
}

export function isDraftComplete(currentPick, pickOrder) {
    return currentPick >= (pickOrder?.length || 0);
}

export function resolvePickTimeLimit(settings) {
    const limit = settings?.pickTimeLimit ?? settings?.timeLimit;
    if (limit === null || limit === undefined) return null;
    return limit === 0 ? null : limit;
}

export function formatPickTimeLabel(seconds) {
    if (seconds === null || seconds === undefined) return 'Unlimited';
    return `${seconds}s`;
}
