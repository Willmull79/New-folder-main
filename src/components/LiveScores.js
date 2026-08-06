import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useFirebase } from '../contexts/FirebaseContext.js';
import backgroundScoring, {
    calculateTeamWeeklyScore,
    fetchSleeperNflState,
    fetchSleeperWeekStats,
} from '../utils/backgroundScoring.js';

const buildPlayerMeta = (allPlayers = []) => {
    const meta = {};
    allPlayers.forEach((player) => {
        if (!player?.id) return;
        meta[String(player.id)] = {
            name: player.name || `${player.first_name || ''} ${player.last_name || ''}`.trim(),
            position: player.position || null,
            team: player.nflTeam || player.team || null,
        };
    });
    return meta;
};

/**
 * Mid-week live fantasy scoring.
 * Does not update official Standings (those finalize on Tuesdays).
 */
const LiveScores = ({
    currentLeague,
    currentTeam,
    currentTeamId,
    allPlayers = [],
    showMessage,
}) => {
    const { db } = useFirebase();
    const [teamsData, setTeamsData] = useState([]);
    const [teamScores, setTeamScores] = useState([]);
    const [weekContext, setWeekContext] = useState(null);
    const [loading, setLoading] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [expandedTeamId, setExpandedTeamId] = useState(currentTeamId || null);
    const [lastUpdated, setLastUpdated] = useState(null);
    const showMessageRef = useRef(showMessage);
    const teamsDataRef = useRef([]);
    const hasScoredRef = useRef(false);

    useEffect(() => {
        showMessageRef.current = showMessage;
    }, [showMessage]);

    useEffect(() => {
        teamsDataRef.current = teamsData;
    }, [teamsData]);

    useEffect(() => {
        if (!db || !currentLeague?.id) {
            setTeamsData([]);
            return undefined;
        }

        const unsubscribe = db.collection(`leagues/${currentLeague.id}/teams`)
            .limit(50)
            .onSnapshot((snapshot) => {
                const teams = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
                setTeamsData(teams);
            }, (error) => {
                console.error('Error listening to teams for live scores:', error);
                showMessageRef.current?.('Error loading teams for live scores.', 'error');
            });

        return () => unsubscribe();
    }, [db, currentLeague?.id]);

    const refreshFantasyScores = useCallback(async ({ silent = false } = {}) => {
        const teams = teamsDataRef.current;
        if (!currentLeague?.id || teams.length === 0) return;

        setLoading(true);
        try {
            const state = await fetchSleeperNflState();
            const weekStats = await fetchSleeperWeekStats({
                seasonType: state.seasonType,
                season: state.season,
                week: state.week,
            });
            const playerMeta = buildPlayerMeta(allPlayers);
            const scoringRules = currentLeague.settings?.scoringRules || {};

            if (db) {
                backgroundScoring.db = db;
            }

            const scoredTeams = [];

            for (const team of teams) {
                const result = await calculateTeamWeeklyScore({
                    lineup: team.roster?.lineup,
                    scoringRules,
                    weekStats,
                    playerMeta,
                    week: state.week,
                    season: state.season,
                    seasonType: state.seasonType,
                });

                scoredTeams.push({
                    teamId: team.id,
                    teamName: team.teamName || 'Unnamed Team',
                    isCurrentTeam: team.id === currentTeamId,
                    totalScore: result.totalScore,
                    players: result.players,
                    errors: result.errors,
                });

                // Persist live scores only — never overwrite official standings/pointsFor
                if (db) {
                    await backgroundScoring.updateTeamScore(
                        currentLeague.id,
                        team,
                        scoringRules,
                        state,
                        weekStats,
                        playerMeta,
                    );
                }
            }

            scoredTeams.sort((a, b) => b.totalScore - a.totalScore);
            setTeamScores(scoredTeams);
            setWeekContext(state);
            setLastUpdated(new Date());
            hasScoredRef.current = true;

            if (!silent) {
                showMessageRef.current?.(
                    `Live fantasy scores updated for week ${state.week}.`,
                    'success',
                );
            }
        } catch (error) {
            console.error('Failed to refresh live fantasy scores:', error);
            showMessageRef.current?.(`Failed to load live scores: ${error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    }, [currentLeague, allPlayers, currentTeamId, db]);

    // Score once when teams first load; optional 15-minute refresh
    useEffect(() => {
        hasScoredRef.current = false;
    }, [currentLeague?.id]);

    useEffect(() => {
        if (teamsData.length === 0) return undefined;

        if (!hasScoredRef.current) {
            refreshFantasyScores({ silent: true });
        }

        if (!autoRefresh) return undefined;

        const interval = setInterval(() => {
            refreshFantasyScores({ silent: true });
        }, 15 * 60 * 1000); // 15 minutes — cost-efficient live scoring

        return () => clearInterval(interval);
    }, [teamsData.length, autoRefresh, currentLeague?.id, refreshFantasyScores]);

    useEffect(() => {
        if (currentTeamId) {
            setExpandedTeamId(currentTeamId);
        }
    }, [currentTeamId]);

    const myScore = teamScores.find((team) => team.teamId === currentTeamId);

    if (!currentLeague) {
        return (
            <div className="bg-emerald-950 p-6 rounded-lg text-center text-emerald-300">
                Select a league to view live fantasy scores.
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="bg-emerald-950 p-4 rounded-lg">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                    <div>
                        <h2 className="text-2xl font-bold text-purple-400">Live Fantasy Scores</h2>
                        <p className="text-emerald-300 text-sm mt-1">
                            {currentLeague.name}
                            {weekContext ? ` · Week ${weekContext.week}` : ''}
                            {lastUpdated ? ` · Updated ${lastUpdated.toLocaleTimeString()}` : ''}
                        </p>
                        <p className="text-xs text-emerald-500 mt-1">
                            In-progress only. Official standings finalize every Tuesday.
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 text-sm text-emerald-200">
                            <input
                                type="checkbox"
                                checked={autoRefresh}
                                onChange={(e) => setAutoRefresh(e.target.checked)}
                                className="rounded bg-emerald-100 border-emerald-300 text-purple-500 focus:ring-purple-500"
                            />
                            Auto-refresh (15 min)
                        </label>
                        <button
                            type="button"
                            onClick={() => refreshFantasyScores({ silent: false })}
                            disabled={loading || teamsData.length === 0}
                            className="px-4 py-2 bg-purple-800 hover:bg-purple-900 text-white rounded-md disabled:opacity-50"
                        >
                            {loading ? 'Scoring...' : 'Refresh'}
                        </button>
                    </div>
                </div>
            </div>

            {myScore && (
                <div className="bg-purple-950/60 border border-purple-700 p-4 rounded-lg">
                    <div className="flex justify-between items-center">
                        <div>
                            <p className="text-sm text-purple-300">Your Team</p>
                            <h3 className="text-xl font-bold text-white">
                                {myScore.teamName || currentTeam?.teamName}
                            </h3>
                        </div>
                        <div className="text-right">
                            <p className="text-3xl font-extrabold text-emerald-300">
                                {Number(myScore.totalScore || 0).toFixed(1)}
                            </p>
                            <p className="text-xs text-emerald-400">live fantasy points</p>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-emerald-950 p-4 rounded-lg">
                <h3 className="text-lg font-semibold mb-4 text-purple-300">League Scoreboard</h3>

                {loading && teamScores.length === 0 ? (
                    <div className="flex justify-center py-10">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
                    </div>
                ) : teamScores.length === 0 ? (
                    <p className="text-emerald-400">No team scores yet. Tap Refresh to calculate.</p>
                ) : (
                    <div className="space-y-3">
                        {teamScores.map((team, index) => {
                            const isExpanded = expandedTeamId === team.teamId;
                            return (
                                <div
                                    key={team.teamId}
                                    className={`rounded-lg border ${
                                        team.isCurrentTeam
                                            ? 'bg-purple-900/40 border-purple-600'
                                            : 'bg-emerald-900 border-emerald-700'
                                    }`}
                                >
                                    <button
                                        type="button"
                                        className="w-full p-4 flex justify-between items-center text-left"
                                        onClick={() => setExpandedTeamId(isExpanded ? null : team.teamId)}
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="w-8 h-8 rounded-full bg-emerald-800 flex items-center justify-center font-bold text-sm">
                                                {index + 1}
                                            </span>
                                            <div>
                                                <div className="font-semibold text-white">
                                                    {team.teamName}
                                                    {team.isCurrentTeam ? ' (You)' : ''}
                                                </div>
                                                <div className="text-xs text-emerald-400">
                                                    {team.players?.length || 0} starters scored
                                                    {team.errors?.length
                                                        ? ` · ${team.errors.length} missing`
                                                        : ''}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-2xl font-bold text-emerald-300">
                                                {Number(team.totalScore || 0).toFixed(1)}
                                            </div>
                                            <div className="text-xs text-emerald-400">
                                                {isExpanded ? 'Hide lineup' : 'Show lineup'}
                                            </div>
                                        </div>
                                    </button>

                                    {isExpanded && (
                                        <div className="px-4 pb-4">
                                            <div className="bg-emerald-950/70 rounded-md overflow-hidden">
                                                <table className="min-w-full text-sm">
                                                    <thead>
                                                        <tr className="text-emerald-300 border-b border-emerald-800">
                                                            <th className="py-2 px-3 text-left">Slot</th>
                                                            <th className="py-2 px-3 text-left">Player</th>
                                                            <th className="py-2 px-3 text-right">Pts</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {(team.players || []).map((player) => (
                                                            <tr
                                                                key={`${team.teamId}-${player.slot}`}
                                                                className="border-b border-emerald-900/60"
                                                            >
                                                                <td className="py-2 px-3 text-emerald-400">
                                                                    {player.slot}
                                                                </td>
                                                                <td className="py-2 px-3 text-white">
                                                                    {player.name || player.playerId}
                                                                    {player.position ? (
                                                                        <span className="text-emerald-400">
                                                                            {' '}({player.position}
                                                                            {player.nflTeam ? ` · ${player.nflTeam}` : ''})
                                                                        </span>
                                                                    ) : null}
                                                                    {player.missingStats ? (
                                                                        <span className="ml-2 text-xs text-yellow-400">
                                                                            no stats yet
                                                                        </span>
                                                                    ) : null}
                                                                </td>
                                                                <td className="py-2 px-3 text-right font-semibold text-emerald-300">
                                                                    {Number(player.points || 0).toFixed(1)}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default LiveScores;
