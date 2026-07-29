import { useCallback, useEffect, useRef, useState } from 'react';
import { commitTeamAutoSetLineup } from '../utils/commitTeamAutoSetLineup.js';

/**
 * Auto-set lineup toggle + transactional apply.
 *
 * Usage:
 *   const { setEnabled, isSaving, runIfEnabled } = useAutoSetLineup({ ... });
 *   <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
 */
export const useAutoSetLineup = ({
    leagueId,
    teamId,
    allPlayers = [],
    rosterLimits,
    slotOrder,
    enabled = false,
    showMessage,
    /** When true, re-run lineup apply whenever the toggle is on and roster/players change. */
    autoApplyWhenEnabled = true,
} = {}) => {
    const [isSaving, setIsSaving] = useState(false);
    const runLockRef = useRef(false);
    const lastApplyKeyRef = useRef('');

    const summarize = useCallback((result, { toggled } = {}) => {
        if (toggled && result.enabled) {
            const demotions = result.changes.filter((c) => c.type === 'demote_out').length;
            const promotions = result.changes.filter((c) => c.type === 'promote_bench').length;
            if (result.changes.length) {
                showMessage?.(
                    `Auto-set lineup ON: ${promotions} starter(s) filled, ${demotions} OUT player(s) moved.`,
                    'success'
                );
            } else {
                showMessage?.('Auto-set lineup enabled.', 'success');
            }
            return;
        }
        if (toggled && !result.enabled) {
            showMessage?.('Auto-set lineup disabled.', 'success');
            return;
        }
        if (result.appliedLineup) {
            const demotions = result.changes.filter((c) => c.type === 'demote_out').length;
            const promotions = result.changes.filter((c) => c.type === 'promote_bench').length;
            showMessage?.(
                `Auto-set lineup: ${promotions} starter(s) filled, ${demotions} OUT player(s) moved.`,
                'success'
            );
        }
    }, [showMessage]);

    const setEnabled = useCallback(async (nextEnabled) => {
        if (!leagueId || !teamId) {
            showMessage?.('Team is not loaded yet.', 'error');
            return { success: false };
        }

        setIsSaving(true);
        try {
            const result = await commitTeamAutoSetLineup({
                leagueId,
                teamId,
                allPlayers,
                rosterLimits,
                slotOrder,
                enabled: Boolean(nextEnabled),
                applyLineup: Boolean(nextEnabled),
            });
            summarize(result, { toggled: true });
            return { success: true, ...result };
        } catch (error) {
            console.error('Failed to update auto-set lineup toggle:', error);
            showMessage?.(error?.message || 'Failed to update auto-set lineup.', 'error');
            return { success: false, error };
        } finally {
            setIsSaving(false);
        }
    }, [leagueId, teamId, allPlayers, rosterLimits, slotOrder, showMessage, summarize]);

    const runIfEnabled = useCallback(async ({ silent = true } = {}) => {
        if (!enabled || !leagueId || !teamId || runLockRef.current) {
            return { success: false, skipped: true };
        }

        runLockRef.current = true;
        setIsSaving(true);
        try {
            const result = await commitTeamAutoSetLineup({
                leagueId,
                teamId,
                allPlayers,
                rosterLimits,
                slotOrder,
                applyLineup: true,
            });
            if (!silent && result.appliedLineup) {
                summarize(result);
            }
            return { success: true, ...result };
        } catch (error) {
            console.error('Auto-set lineup apply failed:', error);
            if (!silent) {
                showMessage?.(error?.message || 'Failed to auto-set lineup.', 'error');
            }
            return { success: false, error };
        } finally {
            runLockRef.current = false;
            setIsSaving(false);
        }
    }, [enabled, leagueId, teamId, allPlayers, rosterLimits, slotOrder, showMessage, summarize]);

    // Keep lineup fresh while the toggle is ON (e.g. after injury/status updates land in allPlayers).
    useEffect(() => {
        if (!autoApplyWhenEnabled || !enabled || !leagueId || !teamId) return undefined;

        const applyKey = `${teamId}:${allPlayers.length}:${JSON.stringify(slotOrder || [])}`;
        // Avoid hammering on identical mounts; still re-run when player pool size changes.
        if (lastApplyKeyRef.current === applyKey) return undefined;
        lastApplyKeyRef.current = applyKey;

        const timer = setTimeout(() => {
            runIfEnabled({ silent: true });
        }, 400);

        return () => clearTimeout(timer);
    }, [
        autoApplyWhenEnabled,
        enabled,
        leagueId,
        teamId,
        allPlayers,
        slotOrder,
        runIfEnabled,
    ]);

    return {
        enabled: Boolean(enabled),
        setEnabled,
        runIfEnabled,
        isSaving,
        /** @deprecated use isSaving */
        isAutoSetting: isSaving,
    };
};

export default useAutoSetLineup;
