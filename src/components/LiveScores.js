import React, { useState, useEffect } from 'react';

const LiveScores = ({ showMessage }) => {
    const [liveGames, setLiveGames] = useState([]);
    const [loading, setLoading] = useState(false);
    const [playerUpdates, setPlayerUpdates] = useState([]);
    const [injuries, setInjuries] = useState([]);
    const [autoRefresh, setAutoRefresh] = useState(true);

    // Load live scores
    const loadLiveScores = async () => {
        setLoading(true);
        try {
            const games = await window.fantasyAPIService.getLiveGameData();
            setLiveGames(games);
        } catch (error) {
            console.error('Failed to load live scores:', error);
            showMessage('Failed to load live scores', 'error');
        } finally {
            setLoading(false);
        }
    };

    // Load injury updates
    const loadInjuries = async () => {
        try {
            const injuryData = await window.fantasyAPIService.getInjuryUpdates();
            setInjuries(injuryData);
        } catch (error) {
            console.error('Failed to load injuries:', error);
        }
    };

    // Update player information
    const updatePlayer = async (playerName, position) => {
        try {
            const updatedPlayer = await window.fantasyAPIService.updatePlayerInfo(playerName, position);
            if (updatedPlayer) {
                setPlayerUpdates(prev => {
                    const filtered = prev.filter(p => p.name !== playerName);
                    return [...filtered, updatedPlayer];
                });
                showMessage(`Updated ${playerName}'s information`, 'success');
            }
        } catch (error) {
            console.error('Failed to update player:', error);
            showMessage(`Failed to update ${playerName}`, 'error');
        }
    };

    // Batch update players
    const batchUpdatePlayers = async (players) => {
        setLoading(true);
        try {
            const updates = await window.fantasyAPIService.batchUpdatePlayers(players);
            setPlayerUpdates(updates);
            showMessage(`Updated ${updates.length} players`, 'success');
        } catch (error) {
            console.error('Failed to batch update players:', error);
            showMessage('Failed to update players', 'error');
        } finally {
            setLoading(false);
        }
    };

    // Start live updates
    useEffect(() => {
        loadLiveScores();
        loadInjuries();

        if (autoRefresh) {
            const interval = setInterval(() => {
                loadLiveScores();
                loadInjuries();
            }, 30000); // Update every 30 seconds

            return () => clearInterval(interval);
        }
    }, [autoRefresh]);

    // Subscribe to live updates
    useEffect(() => {
        const unsubscribe = window.fantasyAPIService.subscribe((data) => {
            if (data.length > 0) {
                setLiveGames(data);
            }
        });

        return unsubscribe;
    }, []);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-emerald-950 p-4 rounded-lg">
                <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-purple-400">Live NFL Scores & Updates</h2>
                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 text-sm text-emerald-200">
                            <input
                                type="checkbox"
                                checked={autoRefresh}
                                onChange={(e) => setAutoRefresh(e.target.checked)}
                                className="rounded bg-emerald-100 border-emerald-300 text-purple-500 focus:ring-purple-500"
                            />
                            Auto-refresh
                        </label>
                        <button
                            onClick={loadLiveScores}
                            disabled={loading}
                            className="px-4 py-2 bg-purple-800 hover:bg-purple-900 text-white rounded-md disabled:opacity-50"
                        >
                            {loading ? 'Loading...' : 'Refresh'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Live Games */}
            <div className="bg-emerald-950 p-4 rounded-lg">
                <h3 className="text-lg font-semibold mb-4 text-purple-300">Live Games</h3>
                {liveGames.length === 0 ? (
                    <p className="text-emerald-400">No live games currently</p>
                ) : (
                    <div className="space-y-3">
                        {liveGames.map(game => (
                            <div key={game.id} className="bg-emerald-900 p-3 rounded-lg">
                                <div className="flex justify-between items-center">
                                    <div className="flex-1">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="font-semibold text-white">{game.awayTeam?.team?.name}</span>
                                            <span className="text-xl font-bold text-white">{game.score?.away || 0}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="font-semibold text-white">{game.homeTeam?.team?.name}</span>
                                            <span className="text-xl font-bold text-white">{game.score?.home || 0}</span>
                                        </div>
                                    </div>
                                    <div className="ml-4 text-right">
                                        <div className="text-sm text-emerald-300">{game.status?.type?.description}</div>
                                        <div className="text-xs text-emerald-400">
                                            {new Date(game.time).toLocaleTimeString()}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Player Updates */}
            <div className="bg-emerald-950 p-4 rounded-lg">
                <h3 className="text-lg font-semibold mb-4 text-purple-300">Player Updates</h3>
                <div className="mb-4">
                    <button
                        onClick={() => batchUpdatePlayers([
                            { name: 'Patrick Mahomes', position: 'QB' },
                            { name: 'Christian McCaffrey', position: 'RB' },
                            { name: 'Justin Jefferson', position: 'WR' }
                        ])}
                        disabled={loading}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md disabled:opacity-50"
                    >
                        Update Top Players
                    </button>
                </div>
                
                {playerUpdates.length > 0 && (
                    <div className="space-y-2">
                        {playerUpdates.map(player => (
                            <div key={player.id} className="bg-emerald-900 p-3 rounded-lg">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <div className="font-semibold text-white">{player.name}</div>
                                        <div className="text-sm text-emerald-300">
                                            {player.position} - {player.nflTeam} - {player.status}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-lg font-bold text-emerald-400">
                                            {player.fantasyPoints} pts
                                        </div>
                                        <div className="text-xs text-emerald-400">
                                            Updated: {new Date(player.lastUpdated).toLocaleTimeString()}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Injury Updates */}
            <div className="bg-emerald-950 p-4 rounded-lg">
                <h3 className="text-lg font-semibold mb-4 text-red-300">Injury Updates</h3>
                {injuries.length === 0 ? (
                    <p className="text-emerald-400">No injury updates available</p>
                ) : (
                    <div className="space-y-2">
                        {injuries.slice(0, 10).map((player, index) => (
                            <div key={index} className="bg-emerald-900 p-3 rounded-lg">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <div className="font-semibold text-white">{player.fullName}</div>
                                        <div className="text-sm text-emerald-300">
                                            {player.position?.abbreviation} - {player.team}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm text-red-400 font-semibold">
                                            {player.status?.description}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* API Status */}
            <div className="bg-emerald-950 p-4 rounded-lg">
                <h3 className="text-lg font-semibold mb-4 text-purple-300">API Status</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <span className="text-emerald-300">Cache Size:</span>
                        <span className="ml-2 text-white">
                            {window.fantasyAPIService.getCacheStats().size} items
                        </span>
                    </div>
                    <div>
                        <span className="text-emerald-300">Auto-refresh:</span>
                        <span className={`ml-2 ${autoRefresh ? 'text-emerald-400' : 'text-red-400'}`}>
                            {autoRefresh ? 'Enabled' : 'Disabled'}
                        </span>
                    </div>
                </div>
                <button
                    onClick={() => window.fantasyAPIService.clearCache()}
                    className="mt-2 px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white text-sm rounded-md"
                >
                    Clear Cache
                </button>
            </div>
        </div>
    );
};

export default LiveScores; 