import React, { useId } from 'react';

/**
 * On/off switch for auto-set lineup.
 */
export const AutoSetLineupToggle = ({
    enabled = false,
    onChange,
    disabled = false,
    label = 'Auto-Set Lineup',
    description = 'When on, empty starters and OUT players are filled from the highest-projected healthy bench players.',
    compact = false,
}) => {
    const toggleId = useId();

    return (
        <div
            className={
                compact
                    ? 'flex items-center justify-between gap-3'
                    : 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-md border border-emerald-600 bg-emerald-950/40 px-3 py-2'
            }
        >
            <div className="min-w-0">
                <label htmlFor={toggleId} className="text-sm font-semibold text-emerald-100 cursor-pointer">
                    {label}
                </label>
                {!compact && description ? (
                    <p className="text-xs text-emerald-400 mt-0.5">{description}</p>
                ) : null}
            </div>
            <button
                id={toggleId}
                type="button"
                role="switch"
                aria-checked={enabled}
                disabled={disabled}
                onClick={() => onChange?.(!enabled)}
                className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors touch-target disabled:opacity-50 ${
                    enabled ? 'bg-purple-600' : 'bg-emerald-700'
                }`}
            >
                <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                        enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                />
                <span className="sr-only">{enabled ? 'On' : 'Off'}</span>
            </button>
        </div>
    );
};

export default AutoSetLineupToggle;
