import React, { useEffect, useMemo, useState } from 'react';
import { useFirebase } from '../contexts/FirebaseContext.js';

/**
 * League Matchups tab:
 * 1) Weekly matchups for the whole league (week selector)
 * 2) Full-season opponents for the current user's team
 */
export const Matchups = ({
    currentLeague,
    currentTeam,
    showMessage,
}) => {
    const { db } = useFirebase();
    const [teamsData, setTeamsData] = useState([]);
    const [selectedWeek, setSelectedWeek] = useState(1);

    const schedule = currentLeague?.schedule || null;
    const weeks = schedule?.weeks || [];

    useEffect(() => {
        if (!db || !currentLeague?.id) {
            setTeamsData([]);
            return undefined;
        }

        const unsubscribe = db.collection(`leagues/${currentLeague.id}/teams`)
            .limit(50)
            .onSnapshot((snapshot) => {
                const teams = snapshot.docs.map((docSnap) => ({
                    id: docSnap.id,
                    ...docSnap.data(),
                }));
                setTeamsData(teams);
            }, (error) => {
                console.error('Error loading teams for matchups:', error);
                showMessage?.('Error loading teams for matchups.', 'error');
            });

        return () => unsubscribe();
    }, [db, currentLeague?.id, showMessage]);

    useEffect(() => {
        if (weeks.length) {
            setSelectedWeek(Number(weeks[0].week) || 1);
        } else {
            setSelectedWeek(1);
        }
    }, [currentLeague?.id, weeks.length]);

    const getTeamName = (teamId) => {
        if (!teamId) return 'BYE';
        return teamsData.find((team) => team.id === teamId)?.teamName || 'Unknown Team';
    };

    const weekOptions = useMemo(
        () => weeks.map((week) => Number(week.week)).filter(Boolean),
        [weeks]
    );

    const leagueWeekMatchups = useMemo(() => {
        const week = weeks.find((entry) => Number(entry.week) === Number(selectedWeek));
        return week?.matchups || [];
    }, [weeks, selectedWeek]);

    const mySeasonMatchups = useMemo(() => {
        const myTeamId = currentTeam?.id;
        if (!myTeamId || !weeks.length) return [];

        return weeks.map((week) => {
            const matchup = (week.matchups || []).find((entry) => (
                entry.homeTeamId === myTeamId || entry.awayTeamId === myTeamId
            ));

            if (!matchup) {
                return {
                    week: week.week,
                    opponentId: null,
                    isHome: null,
                    isBye: false,
                    missing: true,
                };
            }

            const isBye = !matchup.awayTeamId;
            const isHome = matchup.homeTeamId === myTeamId;
            const opponentId = isBye
                ? null
                : (isHome ? matchup.awayTeamId : matchup.homeTeamId);

            return {
                week: week.week,
                opponentId,
                isHome: isBye ? true : isHome,
                isBye,
                missing: false,
            };
        });
    }, [weeks, currentTeam?.id]);

    if (!schedule?.weeks?.length) {
        return (
            <div className="p-4 sm:p-6 bg-emerald-950 rounded-lg shadow-xl max-w-5xl mx-auto my-2 sm:my-8 text-white">
                <h2 className="text-3xl font-bold mb-2">Matchups</h2>
                <p className="text-emerald-300">
                    No season schedule has been created yet.
                    {currentLeague?.commissionerId
                        ? ' The commissioner can build one under Commissioner Tools → Season Schedule.'
                        : ''}
                </p>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-6 bg-emerald-950 rounded-lg shadow-xl max-w-5xl mx-auto my-2 sm:my-8 text-white">
            <div className="mb-6">
                <h2 className="text-3xl font-bold mb-2">Matchups</h2>
                <p className="text-emerald-300">
                    League: {currentLeague?.name}
                    {schedule.numWeeks ? ` · ${schedule.numWeeks} weeks` : ''}
                </p>
            </div>

            <section className="mb-8 p-4 sm:p-5 rounded-lg bg-emerald-900 border border-emerald-700">
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
                    <div>
                        <h3 className="text-xl font-semibold text-purple-300">League Week</h3>
                        <p className="text-sm text-emerald-400">All matchups for the selected week</p>
                    </div>
                    <label className="block min-w-[10rem]">
                        <span className="text-emerald-200 text-sm font-medium">Week</span>
                        <select
                            value={selectedWeek}
                            onChange={(e) => setSelectedWeek(Number(e.target.value))}
                            className="w-full p-3 mt-1 rounded-md bg-emerald-100 text-emerald-900 border-2 border-emerald-300 focus:border-purple-500"
                        >
                            {weekOptions.map((week) => (
                                <option key={week} value={week}>Week {week}</option>
                            ))}
                        </select>
                    </label>
                </div>

                {leagueWeekMatchups.length === 0 ? (
                    <p className="text-emerald-400 text-sm">No matchups scheduled for this week.</p>
                ) : (
                    <ul className="space-y-2">
                        {leagueWeekMatchups.map((matchup, index) => (
                            <li
                                key={`league-${selectedWeek}-${index}`}
                                className="flex items-center justify-between gap-3 p-3 rounded-md bg-emerald-950/60 border border-emerald-800"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-white truncate">
                                        {getTeamName(matchup.homeTeamId)}
                                    </p>
                                    <p className="text-xs uppercase tracking-wide text-emerald-500">Home</p>
                                </div>
                                <span className="text-emerald-400 font-bold flex-shrink-0">vs</span>
                                <div className="min-w-0 flex-1 text-right">
                                    <p className="font-semibold text-white truncate">
                                        {matchup.awayTeamId
                                            ? getTeamName(matchup.awayTeamId)
                                            : <span className="text-yellow-300">BYE</span>}
                                    </p>
                                    <p className="text-xs uppercase tracking-wide text-emerald-500">
                                        {matchup.awayTeamId ? 'Away' : 'Bye week'}
                                    </p>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section className="p-4 sm:p-5 rounded-lg bg-emerald-900 border border-emerald-700">
                <div className="mb-4">
                    <h3 className="text-xl font-semibold text-purple-300">My Season</h3>
                    <p className="text-sm text-emerald-400">
                        {currentTeam?.teamName || 'Your team'} — opponents by week
                    </p>
                </div>

                {!currentTeam?.id ? (
                    <p className="text-emerald-400 text-sm">Select a team to see your season matchups.</p>
                ) : (
                    <ul className="space-y-2">
                        {mySeasonMatchups.map((entry) => (
                            <li
                                key={`mine-${entry.week}`}
                                className="flex items-center justify-between gap-3 p-3 rounded-md bg-emerald-950/60 border border-emerald-800"
                            >
                                <span className="font-bold text-emerald-300 w-20 flex-shrink-0">
                                    Week {entry.week}
                                </span>
                                <div className="min-w-0 flex-1 text-right sm:text-left">
                                    {entry.missing && (
                                        <span className="text-emerald-500">Not scheduled</span>
                                    )}
                                    {!entry.missing && entry.isBye && (
                                        <span className="text-yellow-300 font-semibold">BYE</span>
                                    )}
                                    {!entry.missing && !entry.isBye && (
                                        <span className="text-white font-semibold">
                                            {entry.isHome ? 'vs' : '@'}{' '}
                                            {getTeamName(entry.opponentId)}
                                            <span className="ml-2 text-xs text-emerald-400 font-normal">
                                                ({entry.isHome ? 'Home' : 'Away'})
                                            </span>
                                        </span>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
};

export default Matchups;
