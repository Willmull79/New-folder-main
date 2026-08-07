import React, { useEffect, useState } from 'react';
import {
    getTeamByeWeek,
    getTeamMatchups,
    isFreeAgentTeam,
    loadNflSchedule,
    normalizeNflTeamAbbr,
} from '../utils/nflScheduleService.js';

/**
 * Modal showing a player's NFL team schedule (from schedules/nfl_2026).
 * Free-agent / missing team → friendly message instead of a crash.
 */
export const PlayerScheduleModal = ({ isOpen, onClose, player }) => {
    const [schedule, setSchedule] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const teamAbbr = normalizeNflTeamAbbr(player?.nflTeam ?? player?.team);
    const isFa = isFreeAgentTeam(player?.nflTeam ?? player?.team);
    const playerName = player?.name || 'Player';

    useEffect(() => {
        if (!isOpen || isFa) return undefined;

        let cancelled = false;
        setLoading(true);
        setError(null);

        loadNflSchedule()
            .then((data) => {
                if (cancelled) return;
                setSchedule(data);
                if (!data?.teams) {
                    setError('NFL schedule is not available yet.');
                }
            })
            .catch((err) => {
                if (cancelled) return;
                console.error('PlayerScheduleModal schedule load failed:', err);
                setError('Could not load NFL schedule.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [isOpen, isFa, teamAbbr]);

    if (!isOpen) return null;

    const matchups = !isFa && schedule ? getTeamMatchups(schedule, teamAbbr) : [];
    const byeWeek = !isFa && schedule ? getTeamByeWeek(schedule, teamAbbr) : null;

    const formatHomeAway = (homeAway) => {
        const value = String(homeAway || '').toLowerCase();
        if (value === 'home') return 'Home';
        if (value === 'away') return 'Away';
        return homeAway || '—';
    };

    const opponentLabel = (matchup) => {
        const opp = matchup?.opponent || '—';
        const ha = String(matchup?.homeAway || '').toLowerCase();
        if (ha === 'home') return `vs ${opp}`;
        if (ha === 'away') return `@ ${opp}`;
        return opp;
    };

    return (
        <div
            className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 modal-enter-active p-3"
            role="dialog"
            aria-modal="true"
            aria-labelledby="player-schedule-modal-title"
            onClick={onClose}
        >
            <div
                className="bg-emerald-950 p-6 sm:p-8 rounded-lg shadow-xl w-full max-w-lg border border-emerald-600 max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                        <h3
                            id="player-schedule-modal-title"
                            className="text-2xl font-bold text-purple-300"
                        >
                            Schedule
                        </h3>
                        <p className="text-emerald-200 mt-1">
                            {playerName}
                            {!isFa && teamAbbr ? (
                                <span className="text-emerald-400"> · {teamAbbr}</span>
                            ) : null}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-3 py-1 bg-emerald-800 hover:bg-emerald-700 rounded-md text-sm font-semibold touch-target"
                        aria-label="Close schedule"
                    >
                        Close
                    </button>
                </div>

                {isFa ? (
                    <div className="rounded-md border border-emerald-700 bg-emerald-900/60 p-4 text-emerald-100">
                        <p className="font-semibold text-white mb-1">Free Agent</p>
                        <p className="text-sm text-emerald-300">
                            This player is not on an NFL roster, so there is no team schedule to show.
                        </p>
                    </div>
                ) : loading ? (
                    <p className="text-emerald-300 py-6 text-center">Loading schedule…</p>
                ) : error ? (
                    <p className="text-red-300 py-4">{error}</p>
                ) : matchups.length === 0 ? (
                    <p className="text-emerald-300 py-4">
                        No matchups found for {teamAbbr || 'this team'}.
                    </p>
                ) : (
                    <>
                        {byeWeek != null && (
                            <p className="text-sm text-emerald-400 mb-3">
                                Bye week: <span className="text-white font-semibold">{byeWeek}</span>
                            </p>
                        )}
                        <div className="overflow-x-auto rounded-md border border-emerald-700">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-emerald-900 text-emerald-300 uppercase tracking-wide text-xs">
                                    <tr>
                                        <th className="px-3 py-2 font-semibold">Week</th>
                                        <th className="px-3 py-2 font-semibold">Opponent</th>
                                        <th className="px-3 py-2 font-semibold">Home/Away</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {matchups.map((matchup) => (
                                        <tr
                                            key={`w${matchup.week}-${matchup.opponent}-${matchup.homeAway}`}
                                            className="border-t border-emerald-800 text-white"
                                        >
                                            <td className="px-3 py-2 tabular-nums">{matchup.week}</td>
                                            <td className="px-3 py-2 font-medium">
                                                {opponentLabel(matchup)}
                                            </td>
                                            <td className="px-3 py-2 text-emerald-200">
                                                {formatHomeAway(matchup.homeAway)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {schedule?.season != null && (
                            <p className="text-xs text-emerald-500 mt-3">
                                {schedule.season} NFL season
                                {schedule.updatedAt
                                    ? ` · updated ${String(schedule.updatedAt).slice(0, 10)}`
                                    : ''}
                            </p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default PlayerScheduleModal;
