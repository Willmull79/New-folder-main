import React, { useState, useEffect, useRef } from 'react';
import { useFirebase } from '../contexts/FirebaseContext';

/**
 * Standings are finalized weekly (Tuesday), not live.
 * Mid-week fantasy points belong on the Live Scores tab.
 */
const Standings = ({ currentLeague, showMessage }) => {
    const { db } = useFirebase();
    const [teamsData, setTeamsData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const showMessageRef = useRef(showMessage);

    useEffect(() => {
        showMessageRef.current = showMessage;
    }, [showMessage]);

    useEffect(() => {
        if (!db || !currentLeague?.id) {
            setTeamsData([]);
            setIsLoading(false);
            return undefined;
        }

        let cancelled = false;
        setIsLoading(true);

        // One-shot load — standings are finalized Tuesdays, not live mid-week.
        // Avoid onSnapshot so liveScore writes don't re-render / flicker this page.
        db.collection(`leagues/${currentLeague.id}/teams`)
            .limit(50)
            .get()
            .then((snapshot) => {
                if (cancelled) return;
                const teams = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
                setTeamsData(teams);
                setIsLoading(false);
            })
            .catch((error) => {
                if (cancelled) return;
                console.error('Team data load error:', error);
                showMessageRef.current?.('Error loading team data.', 'error');
                setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [db, currentLeague?.id]);

    const standings = teamsData.map((team) => {
        const wins = team.wins || 0;
        const losses = team.losses || 0;
        const ties = team.ties || 0;
        // Prefer finalized weekly/season standings fields — not live mid-week scores
        const pointsFor = team.standings?.pointsFor
            ?? team.pointsFor
            ?? team.finalizedScore?.totalPoints
            ?? 0;
        const pointsAgainst = team.standings?.pointsAgainst
            ?? team.pointsAgainst
            ?? 0;
        const lastFinalizedWeek = team.standings?.week
            ?? team.finalizedScore?.week
            ?? null;

        return {
            ...team,
            wins,
            losses,
            ties,
            pointsFor,
            pointsAgainst,
            lastFinalizedWeek,
            winPercentage: wins + losses + ties > 0
                ? (wins + (ties * 0.5)) / (wins + losses + ties)
                : 0,
        };
    }).sort((a, b) => {
        if (b.winPercentage !== a.winPercentage) {
            return b.winPercentage - a.winPercentage;
        }
        return b.pointsFor - a.pointsFor;
    });

    const finalizedWeek = standings.find((t) => t.lastFinalizedWeek)?.lastFinalizedWeek || null;
    const lastStandingsUpdate = teamsData
        .map((t) => t.standings?.updatedAt || t.finalizedScore?.finalizedAt)
        .filter(Boolean)
        .sort()
        .pop() || null;

    const rankBadgeClass = (index) => {
        if (index === 0) return 'bg-yellow-500 text-yellow-900';
        if (index === 1) return 'bg-gray-400 text-gray-900';
        if (index === 2) return 'bg-orange-600 text-orange-100';
        return 'bg-emerald-700 text-emerald-200';
    };

    const formatRecord = (team) => (
        `${team.wins}-${team.losses}${team.ties > 0 ? `-${team.ties}` : ''}`
    );

    if (isLoading) {
        return (
            <div className="flex items-center justify-center pt-20">
                <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-purple-500"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="bg-emerald-950 p-4 sm:p-6 rounded-lg shadow-md">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                    <h2 className="text-2xl sm:text-3xl font-bold text-emerald-200 text-center sm:text-left">
                        {currentLeague?.name} - League Standings
                    </h2>
                    <p className="text-xs text-emerald-400 text-center sm:text-right">
                        Updated Tuesdays after the week completes
                        {finalizedWeek ? ` · Last finalized: Week ${finalizedWeek}` : ''}
                        {lastStandingsUpdate ? ` · ${new Date(lastStandingsUpdate).toLocaleString()}` : ''}
                    </p>
                </div>

                <div className="mb-4 p-3 rounded-md bg-emerald-900/70 border border-emerald-700 text-sm text-emerald-300">
                    Standings are official weekly results. For in-progress games, use the{' '}
                    <span className="text-purple-300 font-semibold">Live Scores</span> tab.
                </div>

                {standings.length === 0 ? (
                    <div className="text-center text-emerald-300 py-8">
                        <p className="text-lg">No teams found in this league.</p>
                        <p className="text-sm text-emerald-400 mt-2">Teams will appear here once they join the league.</p>
                    </div>
                ) : (
                    <>
                        {/* Mobile card layout */}
                        <div className="md:hidden space-y-3">
                            {standings.map((team, index) => (
                                <div
                                    key={team.id}
                                    className={`rounded-lg border p-4 ${
                                        index === 0
                                            ? 'bg-purple-900/80 border-purple-600'
                                            : 'bg-emerald-900 border-emerald-700'
                                    }`}
                                >
                                    <div className="flex items-center gap-3 mb-4">
                                        {team.avatarUrl ? (
                                            <img
                                                src={team.avatarUrl}
                                                alt=""
                                                className="h-12 w-12 rounded-full object-cover flex-shrink-0 border-2 border-emerald-600"
                                            />
                                        ) : (
                                            <div
                                                className={`h-12 w-12 rounded-full flex items-center justify-center text-base font-bold flex-shrink-0 ${rankBadgeClass(index)}`}
                                            >
                                                {index + 1}
                                            </div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className={`inline-flex h-6 min-w-[1.5rem] px-1.5 items-center justify-center rounded-full text-xs font-bold ${rankBadgeClass(index)}`}>
                                                    #{index + 1}
                                                </span>
                                                <h3 className="font-semibold text-lg text-white truncate">{team.teamName}</h3>
                                            </div>
                                            <p className="text-sm text-emerald-300 truncate">
                                                {team.ownerName || 'Unknown Owner'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-2 text-center">
                                        <div className="bg-emerald-950/60 rounded-md p-2">
                                            <p className="text-[11px] uppercase tracking-wide text-emerald-400 mb-1">Record</p>
                                            <p className="text-lg font-bold text-white">{formatRecord(team)}</p>
                                            <p className="text-xs text-emerald-300">{((team.winPercentage * 100).toFixed(1))}%</p>
                                        </div>
                                        <div className="bg-emerald-950/60 rounded-md p-2">
                                            <p className="text-[11px] uppercase tracking-wide text-emerald-400 mb-1">PF</p>
                                            <p className="text-lg font-bold text-green-300">
                                                {Number(team.pointsFor || 0).toFixed(1)}
                                            </p>
                                        </div>
                                        <div className="bg-emerald-950/60 rounded-md p-2">
                                            <p className="text-[11px] uppercase tracking-wide text-emerald-400 mb-1">PA</p>
                                            <p className="text-lg font-bold text-red-300">
                                                {Number(team.pointsAgainst || 0).toFixed(1)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Desktop table layout */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="min-w-full bg-emerald-900 rounded-lg shadow-lg">
                                <thead>
                                    <tr className="bg-emerald-800 text-emerald-200">
                                        <th className="py-4 px-6 text-left font-bold text-lg">Team</th>
                                        <th className="py-4 px-6 text-center font-bold text-lg">Record</th>
                                        <th className="py-4 px-6 text-center font-bold text-lg">Points For</th>
                                        <th className="py-4 px-6 text-center font-bold text-lg">Points Against</th>
                                    </tr>
                                </thead>
                                <tbody className="text-emerald-100">
                                    {standings.map((team, index) => (
                                        <tr
                                            key={team.id}
                                            className={`border-b border-emerald-700 hover:bg-emerald-800 transition-colors ${
                                                index === 0 ? 'bg-purple-900' : ''
                                            }`}
                                        >
                                            <td className="py-4 px-6 text-left">
                                                <div className="flex items-center gap-3">
                                                    {team.avatarUrl ? (
                                                        <img
                                                            src={team.avatarUrl}
                                                            alt=""
                                                            className="w-8 h-8 rounded-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${rankBadgeClass(index)}`}>
                                                            {index + 1}
                                                        </div>
                                                    )}
                                                    <div>
                                                        <div className="font-semibold text-lg">{team.teamName}</div>
                                                        <div className="text-sm text-emerald-300">
                                                            {team.ownerName || 'Unknown Owner'}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-4 px-6 text-center">
                                                <div className="text-xl font-bold">{formatRecord(team)}</div>
                                                <div className="text-sm text-emerald-300">
                                                    {((team.winPercentage * 100).toFixed(1))}%
                                                </div>
                                            </td>
                                            <td className="py-4 px-6 text-center">
                                                <div className="text-xl font-bold text-green-300">
                                                    {Number(team.pointsFor || 0).toFixed(1)}
                                                </div>
                                            </td>
                                            <td className="py-4 px-6 text-center">
                                                <div className="text-xl font-bold text-red-300">
                                                    {Number(team.pointsAgainst || 0).toFixed(1)}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>

            <div className="bg-emerald-950 p-4 rounded-lg shadow-md">
                <h3 className="text-xl font-bold text-emerald-200 mb-3">League Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="bg-emerald-900 p-3 rounded">
                        <span className="text-emerald-300">Total Teams:</span>
                        <span className="ml-2 font-bold text-emerald-100">{standings.length}</span>
                    </div>
                    <div className="bg-emerald-900 p-3 rounded">
                        <span className="text-emerald-300">League Type:</span>
                        <span className="ml-2 font-bold text-emerald-100">
                            {currentLeague?.settings?.draftType === 'auction' ? 'Auction'
                                : currentLeague?.settings?.draftType === 'snake' ? 'Snake' : 'Standard'}
                        </span>
                    </div>
                    <div className="bg-emerald-900 p-3 rounded">
                        <span className="text-emerald-300">Standings Update:</span>
                        <span className="ml-2 font-bold text-emerald-100">Every Tuesday</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Standings;
