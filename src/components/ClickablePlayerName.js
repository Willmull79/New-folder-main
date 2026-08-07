import React from 'react';

/**
 * Player name as the schedule control (no separate Sched button).
 * Pass onOpenSchedule from usePlayerScheduleModal().
 */
export const ClickablePlayerName = ({
    player,
    children,
    onOpenSchedule,
    className = '',
    title = 'View NFL schedule',
}) => {
    const label = children ?? player?.name ?? 'Player';

    if (!player || !onOpenSchedule) {
        return <span className={className}>{label}</span>;
    }

    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                onOpenSchedule(player);
            }}
            className={`text-left hover:text-purple-300 underline-offset-2 hover:underline transition-colors cursor-pointer ${className}`}
            title={title}
            aria-label={`View schedule for ${player.name || 'player'}`}
        >
            {label}
        </button>
    );
};

export default ClickablePlayerName;
