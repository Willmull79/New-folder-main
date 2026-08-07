import React, { useCallback, useEffect, useState } from 'react';
import { PlayerScheduleModal } from '../components/PlayerScheduleModal.js';
import { loadNflSchedule } from '../utils/nflScheduleService.js';

/**
 * Shared NFL player schedule modal state + optional cache prefetch.
 *
 * Usage:
 *   const { openSchedule, scheduleModal } = usePlayerScheduleModal();
 *   <ClickablePlayerName player={player} onOpenSchedule={openSchedule} />
 *   {scheduleModal}
 */
export const usePlayerScheduleModal = ({ prefetch = true } = {}) => {
    const [schedulePlayer, setSchedulePlayer] = useState(null);

    useEffect(() => {
        if (!prefetch) return undefined;
        loadNflSchedule().catch((err) => {
            console.warn('NFL schedule prefetch skipped:', err);
        });
        return undefined;
    }, [prefetch]);

    const openSchedule = useCallback((player) => {
        if (player) setSchedulePlayer(player);
    }, []);

    const closeSchedule = useCallback(() => {
        setSchedulePlayer(null);
    }, []);

    const scheduleModal = (
        <PlayerScheduleModal
            isOpen={Boolean(schedulePlayer)}
            onClose={closeSchedule}
            player={schedulePlayer}
        />
    );

    return {
        openSchedule,
        closeSchedule,
        schedulePlayer,
        scheduleModal,
    };
};

export default usePlayerScheduleModal;
