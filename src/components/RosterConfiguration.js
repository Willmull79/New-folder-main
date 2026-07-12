import React, { useMemo } from 'react';
import {
    buildStartingSlots,
    countStartingSlots,
    DEFENSE_FORMAT_LABELS,
    DEFENSE_FORMATS,
    formatDepthChartSummary,
    formatPositionLabel,
} from '../constants/leagueDefaults.js';

const SlotInputs = ({ title, slots, onChange, inputClassName }) => (
    <div>
        <h4 className="text-lg font-semibold mb-3 text-emerald-200">{title}</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {Object.entries(slots).map(([pos, count]) => (
                <label key={pos} className="block">
                    <span className="text-emerald-200">{formatPositionLabel(pos)}</span>
                    <input
                        type="number"
                        min="0"
                        max="8"
                        value={count}
                        onChange={(e) => onChange(pos, Number(e.target.value))}
                        className={inputClassName}
                    />
                    {Number(count) === 0 && (
                        <span className="block text-xs text-emerald-400 mt-1">Disabled</span>
                    )}
                </label>
            ))}
        </div>
    </div>
);

export const RosterConfiguration = ({
    defenseFormat,
    onDefenseFormatChange,
    offenseSlots,
    onOffenseSlotChange,
    idpSlots,
    onIdpSlotChange,
    dstSlots,
    onDstSlotChange,
    rosterLimits,
    onRosterLimitChange,
    variant = 'create',
    embedded = false,
}) => {
    const inputClassName = variant === 'commissioner'
        ? 'w-full p-3 mt-1 rounded-md bg-emerald-100 text-emerald-900 border-2 border-emerald-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-colors'
        : 'w-full p-2 mt-1 rounded-md bg-emerald-800 text-white border border-emerald-600 focus:border-purple-500 focus:ring-2 focus:ring-purple-200';

    const selectClassName = variant === 'commissioner'
        ? 'w-full p-3 mt-1 rounded-md bg-emerald-100 text-emerald-900 border-2 border-emerald-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-colors'
        : 'w-full p-3 mt-1 rounded-md bg-emerald-800 text-white border border-emerald-600 focus:border-purple-500 focus:ring-2 focus:ring-purple-200';

    const sectionClassName = embedded
        ? 'mt-6 pt-6 border-t border-emerald-700 space-y-6'
        : variant === 'commissioner'
            ? 'mb-8 p-4 sm:p-6 bg-emerald-800 rounded-lg border-2 border-emerald-600'
            : 'mb-8 p-4 sm:p-6 bg-emerald-900 rounded-lg';

    const subsectionClassName = embedded
        ? 'p-4 rounded-lg bg-emerald-800/60 border border-emerald-700'
        : '';

    const headingClassName = embedded
        ? 'text-xl font-semibold mb-2 text-yellow-400'
        : 'text-2xl font-semibold mb-2 text-purple-400';

    const startingSlots = useMemo(() => buildStartingSlots({
        offenseSlots,
        defenseFormat,
        idpSlots,
        dstSlots,
    }), [offenseSlots, defenseFormat, idpSlots, dstSlots]);

    const depthChartSummary = formatDepthChartSummary(startingSlots);
    const totalStarters = countStartingSlots(startingSlots);

    return (
        <>
            <div className={sectionClassName}>
                {!embedded && (
                    <h3 className={headingClassName}>Depth Chart &amp; Roster Format</h3>
                )}
                {embedded && (
                    <h4 className={headingClassName}>Depth Chart</h4>
                )}
                <p className="text-sm text-emerald-300 mb-4">
                    Customize your starting lineup. Set any position to 0 to disable it (including Any / Flex). Choose individual defensive players (IDP), a full team defense (D/ST), both, or offense only.
                </p>

                <div className={`mb-6 p-4 rounded-lg ${embedded ? 'bg-emerald-950/70 border border-emerald-700' : 'bg-emerald-950/50 border border-emerald-700'}`}>
                    <p className="text-sm text-emerald-200 font-medium mb-1">Lineup preview ({totalStarters} starters)</p>
                    <p className="text-sm text-emerald-100">{depthChartSummary}</p>
                </div>

                <div className={subsectionClassName}>
                    <label className="block mb-6">
                        <span className="text-emerald-200 font-medium">Defense Format</span>
                        <select
                            value={defenseFormat}
                            onChange={(e) => onDefenseFormatChange(e.target.value)}
                            className={selectClassName}
                        >
                            {Object.entries(DEFENSE_FORMAT_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                            ))}
                        </select>
                        <p className="text-xs text-emerald-400 mt-2">
                            {defenseFormat === DEFENSE_FORMATS.TEAM && 'Rosters use one full team defense slot instead of individual defensive players.'}
                            {defenseFormat === DEFENSE_FORMATS.IDP && 'Rosters use DL, LB, DB, and DFlex slots for individual defensive players.'}
                            {defenseFormat === DEFENSE_FORMATS.BOTH && 'Rosters include both individual defensive players and a team D/ST slot.'}
                            {defenseFormat === DEFENSE_FORMATS.NONE && 'No defensive starters. Offense and kicker only.'}
                        </p>
                    </label>

                    <div className="space-y-6">
                        <SlotInputs
                            title="Offensive Starters"
                            slots={offenseSlots}
                            onChange={onOffenseSlotChange}
                            inputClassName={inputClassName}
                        />

                        {(defenseFormat === DEFENSE_FORMATS.IDP || defenseFormat === DEFENSE_FORMATS.BOTH) && (
                            <SlotInputs
                                title="Individual Defensive Player (IDP) Starters"
                                slots={idpSlots}
                                onChange={onIdpSlotChange}
                                inputClassName={inputClassName}
                            />
                        )}

                        {(defenseFormat === DEFENSE_FORMATS.TEAM || defenseFormat === DEFENSE_FORMATS.BOTH) && (
                            <SlotInputs
                                title="Team Defense / D/ST Starters"
                                slots={dstSlots}
                                onChange={onDstSlotChange}
                                inputClassName={inputClassName}
                            />
                        )}
                    </div>
                </div>
            </div>

            <div className={embedded ? 'mt-6 pt-6 border-t border-emerald-700' : sectionClassName}>
                {!embedded && (
                    <h3 className="text-2xl font-semibold mb-4 text-purple-400">Bench &amp; IR Limits</h3>
                )}
                {embedded && (
                    <h4 className="text-xl font-semibold mb-2 text-yellow-400">Bench &amp; IR Limits</h4>
                )}
                <p className="text-sm text-emerald-300 mb-4">Set the maximum number of players for non-starter positions.</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {Object.keys(rosterLimits).map((pos) => (
                        <label key={pos} className="block">
                            <span className="text-emerald-200">{pos}</span>
                            <input
                                type="number"
                                min="0"
                                value={rosterLimits[pos]}
                                onChange={(e) => onRosterLimitChange(pos, Number(e.target.value))}
                                className={inputClassName}
                            />
                        </label>
                    ))}
                </div>
            </div>
        </>
    );
};
