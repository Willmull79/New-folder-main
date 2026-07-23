/**
 * Draft Slot Salary Scale for snake / standard (linear) drafts when team salary caps are active.
 * Uses exponential decay from a high 1st-overall salary down to a late-round floor.
 */

const FIRST_PICK_SHARE = 0.15;
const LAST_PICK_SHARE = 0.01;
const ABSOLUTE_MIN_SALARY = 1;

const toPositiveNumber = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * Build a deterministic chat-style pick list salary curve for the full draft.
 *
 * @param {number} totalSalaryCap - League team salary cap (e.g. 200)
 * @param {number} totalTeams - Number of teams in the draft
 * @param {number} totalRounds - Number of draft rounds
 * @returns {Array<{ overallPick: number, round: number, assignedSalary: number }>}
 */
export const generateDraftSlotSalaryScale = (totalSalaryCap, totalTeams, totalRounds) => {
    const cap = toPositiveNumber(totalSalaryCap);
    const teams = Math.max(1, Math.floor(toPositiveNumber(totalTeams, 1)));
    const rounds = Math.max(1, Math.floor(toPositiveNumber(totalRounds, 1)));
    const totalPicks = teams * rounds;

    if (!cap || totalPicks < 1) {
        return [];
    }

    const firstSalary = cap * FIRST_PICK_SHARE;
    const lastSalary = Math.max(ABSOLUTE_MIN_SALARY, cap * LAST_PICK_SHARE);

    const scale = [];

    for (let i = 0; i < totalPicks; i += 1) {
        const overallPick = i + 1;
        const round = Math.floor(i / teams) + 1;

        let rawSalary;
        if (totalPicks === 1) {
            rawSalary = firstSalary;
        } else if (i === 0) {
            rawSalary = firstSalary;
        } else if (i === totalPicks - 1) {
            rawSalary = lastSalary;
        } else {
            // Exponential decay: S(i) = first * (last/first)^(i/(n-1))
            // Early rounds drop fast; late rounds flatten toward the floor.
            const t = i / (totalPicks - 1);
            const ratio = lastSalary / firstSalary;
            rawSalary = firstSalary * (ratio ** t);
        }

        scale.push({
            overallPick,
            round,
            assignedSalary: Math.max(ABSOLUTE_MIN_SALARY, Math.round(rawSalary)),
        });
    }

    // Guarantee exact first / last targets after rounding edge cases
    if (scale.length > 0) {
        scale[0].assignedSalary = Math.max(
            ABSOLUTE_MIN_SALARY,
            Math.round(firstSalary)
        );
        scale[scale.length - 1].assignedSalary = Math.max(
            ABSOLUTE_MIN_SALARY,
            Math.round(lastSalary)
        );
    }

    return scale;
};

/**
 * Immediately deduct a drafted player's slot salary from the team's remaining cap space.
 *
 * @param {number} currentCapSpace - Team's remaining salary room before the pick
 * @param {number} draftedPlayerSlotSalary - Salary assigned to this draft slot
 * @returns {{ remainingCapSpace: number, deducted: number, success: boolean, error?: string }}
 */
export const draftPlayerWithSalary = (currentCapSpace, draftedPlayerSlotSalary) => {
    const capSpace = Number(currentCapSpace);
    const slotSalary = Number(draftedPlayerSlotSalary);

    if (!Number.isFinite(capSpace)) {
        return {
            remainingCapSpace: 0,
            deducted: 0,
            success: false,
            error: 'Invalid current cap space.',
        };
    }

    if (!Number.isFinite(slotSalary) || slotSalary < 0) {
        return {
            remainingCapSpace: capSpace,
            deducted: 0,
            success: false,
            error: 'Invalid drafted player slot salary.',
        };
    }

    if (slotSalary > capSpace) {
        return {
            remainingCapSpace: capSpace,
            deducted: 0,
            success: false,
            error: `Insufficient cap space. Need $${slotSalary}, have $${capSpace}.`,
        };
    }

    const remainingCapSpace = Math.round((capSpace - slotSalary) * 100) / 100;

    return {
        remainingCapSpace,
        deducted: slotSalary,
        success: true,
    };
};

/**
 * Look up the assigned salary for a 1-based overall pick from a generated scale.
 */
export const getSalaryForOverallPick = (salaryScale, overallPick) => {
    if (!Array.isArray(salaryScale) || !overallPick) return null;
    const entry = salaryScale.find((row) => row.overallPick === Number(overallPick));
    return entry ? entry.assignedSalary : null;
};

export default {
    generateDraftSlotSalaryScale,
    draftPlayerWithSalary,
    getSalaryForOverallPick,
};
