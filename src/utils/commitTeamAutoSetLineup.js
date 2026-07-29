import { doc, runTransaction } from 'firebase/firestore';
import { getModularFirestore } from '../config/firebaseModular.js';
import { computeAutoSetLineup } from './autoSetLineup.js';

/**
 * Persist auto-set toggle and optionally apply lineup changes in one transaction.
 *
 * @param {object} options
 * @param {string} options.leagueId
 * @param {string} options.teamId
 * @param {Array} [options.allPlayers]
 * @param {object} [options.rosterLimits]
 * @param {string[]} [options.slotOrder]
 * @param {boolean} [options.enabled] - when set, writes autoSetLineupEnabled
 * @param {boolean} [options.applyLineup=false] - when true, demote OUT / fill empty slots
 */
export const commitTeamAutoSetLineup = async ({
    leagueId,
    teamId,
    allPlayers = [],
    rosterLimits,
    slotOrder,
    enabled,
    applyLineup = false,
} = {}) => {
    if (!leagueId || !teamId) {
        throw new Error('Team is not loaded yet.');
    }

    const db = getModularFirestore();
    const teamRef = doc(db, 'leagues', leagueId, 'teams', teamId);

    return runTransaction(db, async (transaction) => {
        const teamSnap = await transaction.get(teamRef);
        if (!teamSnap.exists()) {
            throw new Error('Team not found.');
        }

        const teamData = teamSnap.data() || {};
        const updates = {};
        let changes = [];

        if (typeof enabled === 'boolean') {
            updates.autoSetLineupEnabled = enabled;
        }

        const shouldApply = applyLineup || enabled === true;
        if (shouldApply) {
            const result = computeAutoSetLineup(teamData.roster, allPlayers, {
                rosterLimits,
                slotOrder,
            });
            changes = result.changes;
            if (changes.length) {
                updates.roster = result.roster;
            }
        }

        if (!Object.keys(updates).length) {
            return {
                skipped: true,
                changes: [],
                enabled: teamData.autoSetLineupEnabled === true,
            };
        }

        transaction.update(teamRef, updates);
        return {
            skipped: changes.length === 0 && typeof enabled !== 'boolean',
            changes,
            enabled: typeof enabled === 'boolean'
                ? enabled
                : teamData.autoSetLineupEnabled === true,
            appliedLineup: Boolean(updates.roster),
        };
    });
};
