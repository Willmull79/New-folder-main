import React, { useMemo } from 'react';
import {
    DEFENSE_FORMAT_LABELS,
    DEFENSE_FORMATS,
    STANDARD_SCORING_RULES,
    WAIVER_TYPE_OPTIONS,
    buildStartingSlots,
    countStartingSlots,
    formatDepthChartSummary,
    formatPositionLabel,
    inferDefenseFormat,
    isPlayerSalaryEnabled,
    isTeamSalaryCapEnabled,
    resolveRosterLimits,
    splitStartingSlots,
} from '../constants/leagueDefaults.js';
import {
    DEFAULT_AUCTION_BID_TIME,
    DRAFT_TYPE_OPTIONS,
    PICK_TIME_OPTIONS,
    clampAuctionBidSeconds,
    formatPickTimeLabel,
} from '../utils/draftOrderUtils.js';

const flexEligibleLabel = (settings = {}) => {
    const positions = ['RB', 'WR', 'TE'];
    if (settings.flexAllowsQb === true) positions.push('QB');
    if (settings.flexAllowsKicker === true) positions.push('K');
    return positions.join(', ');
};

const formatScheduledLabel = (value) => {
    if (!value) return '';
    const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
};

const SCORING_GROUPS = [
    {
        title: 'Offense',
        rules: [
            ['Passing TD', 'passTd'],
            ['Rushing TD', 'rushTd'],
            ['Receiving TD', 'recTd'],
            ['Return TD', 'returnTd'],
            ['2-Point Conv.', 'twoPointConversion'],
            ['Completion', 'completion'],
            ['Passing Yard', 'passYard'],
            ['Rush/Rec Yard', 'rushRecYard'],
            ['Reception (PPR)', 'reception'],
            ['300+ Pass Yd Bonus', 'pass300YardBonus'],
            ['400+ Pass Yd Bonus', 'pass400YardBonus'],
            ['100+ Rush/Rec Yd Bonus', 'rushRec100YardBonus'],
            ['200+ Rush/Rec Yd Bonus', 'rushRec200YardBonus'],
            ['Fumble Recovery', 'fumbleRecovery'],
            ['Sack (QB)', 'sack'],
            ['Interception (QB)', 'interception'],
            ['Fumble Lost', 'fumble'],
        ],
    },
    {
        title: 'Kicking',
        rules: [
            ['Extra Point Made', 'extraPoint'],
            ['FG Made (0-39 yds)', 'fg39Less'],
            ['FG Made (40-49 yds)', 'fg40_49'],
            ['FG Made (50+ yds)', 'fg50Plus'],
            ['Missed FG/EP', 'missedFgEp'],
        ],
    },
    {
        title: 'Defense & ST',
        rules: [
            ['Tackle (Solo)', 'tackle'],
            ['Assisted Tackle', 'assistedTackle'],
            ['Tackle for Loss', 'tackleForLoss'],
            ['Forced Fumble', 'forcedFumble'],
            ['Fumble Recovery', 'fumbleRecoveryDef'],
            ['Interception', 'interceptionDef'],
            ['Pass Defended', 'passDefended'],
            ['Def/ST TD', 'defensiveStTd'],
            ['Def/ST Return Yard', 'returnYardDefSt'],
        ],
    },
];

const DRAFT_STATUS_LABELS = {
    pending: 'Not started',
    order_set: 'Order set',
    scheduled: 'Scheduled',
    live: 'Live',
    paused: 'Paused',
    completed: 'Completed',
};

const formatOnOff = (enabled) => (enabled ? 'On' : 'Off');

const formatPoints = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return String(number);
};

const formatCount = (value, singular, plural = `${singular}s`) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return `${number} ${number === 1 ? singular : plural}`;
};

const SettingValue = ({ label, value }) => (
    <div>
        <p className="text-emerald-200 font-medium text-sm">{label}</p>
        <p className="mt-1 rounded-md bg-emerald-950/70 border border-emerald-700 px-3 py-3 text-white">
            {value ?? '—'}
        </p>
    </div>
);

const ScoringValue = ({ label, value }) => (
    <div>
        <p className="text-emerald-200 font-medium text-sm">{label}</p>
        <p className="mt-1 rounded-md bg-emerald-950/70 border border-emerald-700 px-3 py-2 text-white tabular-nums">
            {formatPoints(value)}
        </p>
    </div>
);

const SlotList = ({ title, slots }) => (
    <div>
        <h5 className="text-lg font-semibold mb-3 text-emerald-200">{title}</h5>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {Object.entries(slots).map(([position, count]) => (
                <SettingValue
                    key={position}
                    label={formatPositionLabel(position)}
                    value={Number(count) === 0 ? 'Off' : formatCount(count, 'starter')}
                />
            ))}
        </div>
    </div>
);

export const LeagueSettingsView = ({ currentLeague }) => {
    const view = useMemo(() => {
        const settings = currentLeague?.settings || {};
        const draft = currentLeague?.draft || {};
        const draftSettings = draft.settings || {};
        const scoringRules = {
            ...STANDARD_SCORING_RULES,
            ...(settings.scoringRules || {}),
        };
        const split = splitStartingSlots(settings.startingSlots);
        const defenseFormat = settings.defenseFormat || inferDefenseFormat(settings.startingSlots);
        const startingSlots = buildStartingSlots({
            offenseSlots: split.offense,
            defenseFormat,
            idpSlots: split.idp,
            dstSlots: split.dst,
        });
        const rosterLimits = resolveRosterLimits(settings.rosterLimits);
        const divisions = Array.isArray(settings.divisions) ? settings.divisions : [];
        const waiverOption = WAIVER_TYPE_OPTIONS.find((option) => option.value === (settings.waiverType || 'auction'));
        const draftType = settings.draftType || draft.type || 'auction';
        const draftTypeOption = DRAFT_TYPE_OPTIONS.find((option) => option.value === draftType);
        const orderType = draftSettings.orderType || draft.orderType || 'random';
        const rawPickTime = draftSettings.pickTimeLimit ?? draftSettings.timeLimit;
        const isAuction = draftType === 'auction';
        const pickTimeLabel = isAuction
            ? `${clampAuctionBidSeconds(rawPickTime ?? DEFAULT_AUCTION_BID_TIME)} seconds`
            : (
                PICK_TIME_OPTIONS.find((option) => (
                    option.value === rawPickTime || (option.value == null && (rawPickTime == null || rawPickTime === 0))
                ))?.label || formatPickTimeLabel(rawPickTime)
            );
        return {
            scoringRules,
            defenseFormat,
            startingSlots,
            offenseSlots: split.offense,
            idpSlots: split.idp,
            dstSlots: split.dst,
            rosterLimits,
            divisions,
            divisionsEnabled: divisions.length > 0,
            useTeamSalaryCap: isTeamSalaryCapEnabled(settings),
            usePlayerSalaries: isPlayerSalaryEnabled(settings),
            teamSalary: settings.teamSalary ?? 1000,
            playersToDrop: settings.playersToDrop ?? 5,
            salaryRaisePercentage: settings.salaryRaisePercentage ?? 10,
            minPlayerSalary: settings.minPlayerSalary ?? 0.5,
            numTeams: settings.numTeams ?? 12,
            numWeeks: settings.numWeeks ?? 14,
            playoffWeeks: settings.playoffWeeks ?? 3,
            waiverLabel: waiverOption?.label || 'Auction (FAAB)',
            flexLabel: flexEligibleLabel(settings),
            draftTypeLabel: draftTypeOption?.label || 'Auction Draft',
            isAuction,
            orderLabel: orderType === 'manual' ? 'Manual' : 'Random',
            pickTimeLabel,
            draftRounds: draftSettings.rounds ?? 20,
            draftStatus: DRAFT_STATUS_LABELS[draft.status] || 'Not started',
            scheduledLabel: formatScheduledLabel(draft.scheduledDateTime) || 'Not scheduled',
            totalStarters: countStartingSlots(startingSlots),
            depthChartSummary: formatDepthChartSummary(startingSlots),
        };
    }, [currentLeague]);

    return (
        <div className="p-4 sm:p-6 bg-emerald-950 rounded-lg shadow-xl max-w-7xl mx-auto my-2 sm:my-8 text-white">
            <div className="mb-6">
                <h2 className="text-3xl font-bold text-white mb-2">League Settings</h2>
                <p className="text-emerald-300">League: {currentLeague?.name || '—'}</p>
                <p className="text-emerald-300">Review scoring and league setup. Only the commissioner can change these.</p>
            </div>

            <section className="bg-emerald-900 p-6 rounded-lg shadow-lg mb-6" aria-label="General settings">
                <h3 className="text-2xl font-bold text-purple-400 mb-4">General Settings</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                    <div className="sm:col-span-2 md:col-span-3">
                        <SettingValue label="League Name" value={currentLeague?.name || '—'} />
                    </div>
                    <SettingValue label="Number of Teams" value={formatCount(view.numTeams, 'team')} />
                    <SettingValue label="Regular Season Weeks" value={formatCount(view.numWeeks, 'week')} />
                    <SettingValue label="Playoff Weeks" value={formatCount(view.playoffWeeks, 'week')} />
                    <SettingValue label="Waiver Wire Type" value={view.waiverLabel} />
                    <SettingValue label="Team Salary Cap" value={formatOnOff(view.useTeamSalaryCap)} />
                    <SettingValue
                        label="Salary Cap Amount"
                        value={view.useTeamSalaryCap ? `$${view.teamSalary}` : 'Off'}
                    />
                    <SettingValue label="Player Salaries" value={formatOnOff(view.usePlayerSalaries)} />
                    <SettingValue label="Players to Drop" value={String(view.playersToDrop)} />
                    <SettingValue
                        label="Salary Raise %"
                        value={view.usePlayerSalaries ? `${view.salaryRaisePercentage}%` : 'Off'}
                    />
                    <SettingValue
                        label="Min Player Salary"
                        value={view.usePlayerSalaries ? `$${view.minPlayerSalary}` : 'Off'}
                    />
                    <SettingValue label="Divisions" value={formatOnOff(view.divisionsEnabled)} />
                </div>
            </section>

            <section className="bg-emerald-900 p-6 rounded-lg shadow-lg mb-6" aria-label="Roster settings">
                <h3 className="text-2xl font-bold text-purple-400 mb-4">Roster</h3>
                <div className="mb-6 p-4 rounded-lg bg-emerald-950/70 border border-emerald-700">
                    <p className="text-sm text-emerald-200 font-medium mb-1">
                        Lineup preview ({view.totalStarters} starters)
                    </p>
                    <p className="text-sm text-emerald-100">{view.depthChartSummary}</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                    <SettingValue
                        label="Defense Format"
                        value={DEFENSE_FORMAT_LABELS[view.defenseFormat] || view.defenseFormat}
                    />
                    <SettingValue label="Flex Eligibility" value={view.flexLabel} />
                </div>
                <div className="space-y-6">
                    <SlotList title="Offensive Starters" slots={view.offenseSlots} />
                    {(view.defenseFormat === DEFENSE_FORMATS.IDP || view.defenseFormat === DEFENSE_FORMATS.BOTH) && (
                        <SlotList title="Individual Defensive Player (IDP) Starters" slots={view.idpSlots} />
                    )}
                    {(view.defenseFormat === DEFENSE_FORMATS.TEAM || view.defenseFormat === DEFENSE_FORMATS.BOTH) && (
                        <SlotList title="Team Defense / D/ST Starters" slots={view.dstSlots} />
                    )}
                </div>
                <div className="mt-6 pt-6 border-t border-emerald-700">
                    <h4 className="text-xl font-semibold mb-4 text-yellow-400">Bench, IR &amp; Rookie Limits</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {Object.entries(view.rosterLimits).map(([position, count]) => (
                            <SettingValue
                                key={position}
                                label={position}
                                value={formatCount(count, 'slot')}
                            />
                        ))}
                    </div>
                </div>
            </section>

            {view.divisionsEnabled && (
                <section className="bg-emerald-900 p-6 rounded-lg shadow-lg mb-6" aria-label="Divisions">
                    <h3 className="text-2xl font-bold text-purple-400 mb-4">Divisions</h3>
                    <ul className="space-y-3">
                        {view.divisions.map((division, index) => {
                            const name = typeof division === 'string' ? division : division?.name;
                            return (
                                <li
                                    key={`${name || 'division'}-${index}`}
                                    className="rounded-md bg-emerald-950/70 border border-emerald-700 px-3 py-3 text-white"
                                >
                                    {name || `Division ${index + 1}`}
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}

            <section className="bg-emerald-900 p-6 rounded-lg shadow-lg mb-6" aria-label="Draft settings">
                <h3 className="text-2xl font-bold text-purple-400 mb-4">Draft</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                    <SettingValue label="Draft Type" value={view.draftTypeLabel} />
                    <SettingValue label="Status" value={view.draftStatus} />
                    <SettingValue label="Scheduled Time" value={view.scheduledLabel} />
                    <SettingValue label="Draft Order" value={view.orderLabel} />
                    {view.isAuction ? (
                        <SettingValue label="Bid Timer" value={view.pickTimeLabel} />
                    ) : (
                        <>
                            <SettingValue label="Rounds" value={String(view.draftRounds)} />
                            <SettingValue label="Pick Timer" value={view.pickTimeLabel} />
                        </>
                    )}
                </div>
            </section>

            <section className="bg-emerald-900 p-6 rounded-lg shadow-lg" aria-label="Scoring rules">
                <h3 className="text-2xl font-bold text-purple-400 mb-4">Scoring Rules</h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-8">
                    <div>
                        <h4 className="text-lg font-bold mb-3 text-emerald-200 border-b border-emerald-500 pb-2">
                            {SCORING_GROUPS[0].title}
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                            {SCORING_GROUPS[0].rules.map(([label, rule]) => (
                                <ScoringValue key={rule} label={label} value={view.scoringRules[rule]} />
                            ))}
                        </div>
                    </div>
                    <div className="space-y-8">
                        {SCORING_GROUPS.slice(1).map((group) => (
                            <div key={group.title}>
                                <h4 className="text-lg font-bold mb-3 text-emerald-200 border-b border-emerald-500 pb-2">
                                    {group.title}
                                </h4>
                                <div className="grid grid-cols-2 gap-4">
                                    {group.rules.map(([label, rule]) => (
                                        <ScoringValue key={rule} label={label} value={view.scoringRules[rule]} />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        </div>
    );
};

export default LeagueSettingsView;
