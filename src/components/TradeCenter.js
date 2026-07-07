import React, { useState, useEffect } from 'react';
import { useFirebase } from '../contexts/FirebaseContext.js';
import { getPlayerDetails } from '../utils/helpers.js';
import { appId } from '../config/firebase.js';
import { SleeperPlayerList } from './SleeperPlayerList.js';

// Import firebase globally (it's loaded in the HTML)
const firebase = window.firebase;

export const TradeCenter = ({ currentLeague, currentTeam, allPlayers, showMessage, currentTeamId }) => {
    const { db } = useFirebase();
    const [teamsData, setTeamsData] = useState([]);
    const [pendingTrades, setPendingTrades] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [activeTrade, setActiveTrade] = useState(null);
    const [selectedTeams, setSelectedTeams] = useState([]);
    const [tradeOffers, setTradeOffers] = useState({});
    const [isCommissioner, setIsCommissioner] = useState(false);

    // Initialize selected teams when currentTeamId is available
    useEffect(() => {
        if (currentTeamId && selectedTeams.length === 0) {
            setSelectedTeams([currentTeamId]);
            setTradeOffers({
                [currentTeamId]: initializeTradeOffer(currentTeamId)
            });
        }
    }, [currentTeamId, selectedTeams.length]);

    useEffect(() => {
        if (!db || !currentLeague?.id) return;

        // Listen to teams data
        const teamsUnsubscribe = db.collection(`artifacts/${appId}/public/data/teams`)
            .where('leagueId', '==', currentLeague.id)
            .onSnapshot(snapshot => {
                const teams = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setTeamsData(teams);
            }, error => {
                console.error("Error listening to teams:", error);
            });

        // Listen to pending trades
        const tradesUnsubscribe = db.collection(`leagues/${currentLeague.id}/trades`)
            .where('status', '==', 'pending')
            .onSnapshot(snapshot => {
                const trades = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setPendingTrades(trades);
            }, error => {
                console.error("Error listening to trades:", error);
            });

        // Check if current user is commissioner
        setIsCommissioner(currentLeague?.commissionerId === currentTeam?.ownerId);

        return () => {
            teamsUnsubscribe();
            tradesUnsubscribe();
        };
    }, [db, currentLeague?.id, currentTeam?.ownerId]);

    const initializeTradeOffer = (teamId) => {
        return {
            players: [],
            draftPicks: [],
            salaryCap: 0
        };
    };

    const addTeamToTrade = () => {
        if (selectedTeams.length < 3) {
            const availableTeams = teamsData.filter(team => !selectedTeams.includes(team.id));
            if (availableTeams.length > 0) {
                const newTeam = availableTeams[0];
                setSelectedTeams([...selectedTeams, newTeam.id]);
                setTradeOffers({
                    ...tradeOffers,
                    [newTeam.id]: initializeTradeOffer(newTeam.id)
                });
            }
        }
    };

    const removeTeamFromTrade = (teamId) => {
        if (selectedTeams.length > 1 && teamId !== currentTeamId) {
            setSelectedTeams(selectedTeams.filter(id => id !== teamId));
            const newOffers = { ...tradeOffers };
            delete newOffers[teamId];
            setTradeOffers(newOffers);
        }
    };

    const addPlayerToTrade = (teamId, playerId, rosterType) => {
        const player = getPlayerDetails(playerId, allPlayers);
        if (!player) return;

        setTradeOffers(prev => ({
            ...prev,
            [teamId]: {
                ...prev[teamId],
                players: [...(prev[teamId]?.players || []), {
                    id: playerId,
                    name: player.name,
                    position: player.position,
                    nflTeam: player.nflTeam,
                    salary: player.salary,
                    rosterType: rosterType
                }],
                salaryCap: (prev[teamId]?.salaryCap || 0) + player.salary
            }
        }));
    };

    const removePlayerFromTrade = (teamId, playerIndex) => {
        setTradeOffers(prev => {
            const player = prev[teamId]?.players[playerIndex];
            return {
                ...prev,
                [teamId]: {
                    ...prev[teamId],
                    players: prev[teamId].players.filter((_, index) => index !== playerIndex),
                    salaryCap: (prev[teamId]?.salaryCap || 0) - (player?.salary || 0)
                }
            };
        });
    };

    const addDraftPick = (teamId, round, year = new Date().getFullYear()) => {
        setTradeOffers(prev => ({
            ...prev,
            [teamId]: {
                ...prev[teamId],
                draftPicks: [...(prev[teamId]?.draftPicks || []), { round, year }]
            }
        }));
    };

    const removeDraftPick = (teamId, pickIndex) => {
        setTradeOffers(prev => ({
            ...prev,
            [teamId]: {
                ...prev[teamId],
                draftPicks: prev[teamId].draftPicks.filter((_, index) => index !== pickIndex)
            }
        }));
    };

    const getTeamRoster = (teamId) => {
        const team = teamsData.find(t => t.id === teamId);
        const roster = team?.roster || {};
        return {
            lineup: Array.isArray(roster.lineup) ? roster.lineup : [],
            bench: Array.isArray(roster.bench) ? roster.bench : [],
            ir: Array.isArray(roster.ir) ? roster.ir : []
        };
    };

    const validateTrade = () => {
        // Check if at least 2 teams are involved
        if (selectedTeams.length < 2) {
            return { valid: false, message: "At least 2 teams must be involved in a trade." };
        }

        // Check if each team has something to offer
        for (const teamId of selectedTeams) {
            const offer = tradeOffers[teamId];
            if (!offer || (!offer.players.length && !offer.draftPicks.length)) {
                const team = teamsData.find(t => t.id === teamId);
                return { valid: false, message: `${team?.teamName} has nothing to offer in this trade.` };
            }
        }

        // Check salary cap compliance for each team
        for (const teamId of selectedTeams) {
            const team = teamsData.find(t => t.id === teamId);
            const offer = tradeOffers[teamId];
            
            if (!team || !offer) continue;

            const currentSalary = (team.roster?.lineup || []).reduce((sum, playerId) => {
                const player = getPlayerDetails(playerId, allPlayers);
                return sum + (player?.salary || 0);
            }, 0);

            const outgoingSalary = offer.players
                .filter(p => p.rosterType === 'lineup')
                .reduce((sum, p) => sum + p.salary, 0);

            const incomingSalary = selectedTeams
                .filter(otherTeamId => otherTeamId !== teamId)
                .reduce((sum, otherTeamId) => {
                    const otherOffer = tradeOffers[otherTeamId];
                    return sum + (otherOffer?.players
                        .filter(p => p.rosterType === 'lineup')
                        .reduce((s, p) => s + p.salary, 0) || 0);
                }, 0);

            const newSalary = currentSalary - outgoingSalary + incomingSalary;
            const salaryCap = currentLeague?.settings?.teamSalary || 200;

            if (newSalary > salaryCap) {
                return { valid: false, message: `${team.teamName} would exceed salary cap after trade.` };
            }
        }

        return { valid: true, message: "Trade is valid!" };
    };

    const proposeTrade = async () => {
        const validation = validateTrade();
        if (!validation.valid) {
            return showMessage(validation.message, "error");
        }

        setIsLoading(true);
        try {
            const tradeData = {
                teams: selectedTeams,
                offers: tradeOffers,
                proposedBy: currentTeamId,
                status: 'pending',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                responses: selectedTeams.reduce((acc, teamId) => {
                    acc[teamId] = teamId === currentTeamId ? 'accepted' : 'pending';
                    return acc;
                }, {})
            };

            await db.collection(`leagues/${currentLeague.id}/trades`).add(tradeData);
            
            showMessage("Trade proposal sent successfully!", "success");
            setActiveTrade(null);
            setSelectedTeams([currentTeamId]);
            setTradeOffers({});
        } catch (error) {
            console.error("Error proposing trade:", error);
            showMessage("Error proposing trade.", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const respondToTrade = async (tradeId, response) => {
        setIsLoading(true);
        try {
            const tradeRef = db.doc(`leagues/${currentLeague.id}/trades/${tradeId}`);
            await tradeRef.update({
                [`responses.${currentTeamId}`]: response
            });

            if (response === 'accepted') {
                showMessage("Trade accepted!", "success");
            } else {
                showMessage("Trade declined.", "info");
            }
        } catch (error) {
            console.error("Error responding to trade:", error);
            showMessage("Error responding to trade.", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const executeTrade = async (tradeId) => {
        if (!isCommissioner) {
            return showMessage("Only commissioners can execute trades.", "error");
        }

        setIsLoading(true);
        try {
            const tradeRef = db.doc(`leagues/${currentLeague.id}/trades/${tradeId}`);
            const tradeDoc = await tradeRef.get();
            const trade = tradeDoc.data();

            // Check if all teams have accepted
            const allAccepted = trade.teams.every(teamId => trade.responses[teamId] === 'accepted');
            if (!allAccepted) {
                return showMessage("All teams must accept before executing trade.", "error");
            }

            const batch = db.batch();

            // Execute the trade for each team
            for (const teamId of trade.teams) {
                const teamRef = db.doc(`artifacts/${appId}/public/data/teams/${teamId}`);
                const team = teamsData.find(t => t.id === teamId);
                
                if (!team) continue;

                const newRoster = { ...team.roster };
                const offer = trade.offers[teamId];

                // Remove outgoing players
                for (const player of offer.players) {
                    const rosterType = player.rosterType;
                    newRoster[rosterType] = newRoster[rosterType].filter(id => id !== player.id);
                }

                // Add incoming players from other teams
                for (const otherTeamId of trade.teams) {
                    if (otherTeamId === teamId) continue;
                    
                    const otherOffer = trade.offers[otherTeamId];
                    for (const player of otherOffer.players) {
                        newRoster.bench.push(player.id);
                    }
                }

                batch.update(teamRef, { roster: newRoster });
            }

            // Mark trade as executed
            batch.update(tradeRef, { 
                status: 'executed',
                executedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            await batch.commit();
            showMessage("Trade executed successfully!", "success");
        } catch (error) {
            console.error("Error executing trade:", error);
            showMessage("Error executing trade.", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const renderTradeProposal = () => (
        <div className="bg-emerald-900 p-6 rounded-lg border-2 border-emerald-700 mb-6">
                            <h3 className="text-2xl font-bold text-purple-400 mb-4">Propose Trade</h3>
            
            <div className="mb-4">
                <label className="block text-emerald-200 font-medium mb-2">Teams in Trade:</label>
                <div className="flex flex-wrap gap-2">
                    {selectedTeams.map(teamId => {
                        const team = teamsData.find(t => t.id === teamId);
                        return (
                            <div key={teamId} className="flex items-center gap-2 bg-emerald-800 px-3 py-1 rounded-md">
                                <span className="text-white">{team?.teamName}</span>
                                {teamId !== currentTeamId && (
                                    <button 
                                        onClick={() => removeTeamFromTrade(teamId)}
                                        className="text-red-400 hover:text-red-300"
                                    >
                                        ×
                                    </button>
                                )}
                            </div>
                        );
                    })}
                    {selectedTeams.length < 3 && (
                        <button 
                            onClick={addTeamToTrade}
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md"
                        >
                            + Add Team
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                {selectedTeams.map(teamId => {
                    const team = teamsData.find(t => t.id === teamId);
                    const offer = tradeOffers[teamId] || initializeTradeOffer(teamId);
                    const roster = getTeamRoster(teamId);
                    
                    return (
                        <div key={teamId} className="bg-emerald-800 p-4 rounded-lg border-2 border-emerald-600">
                            <h4 className="text-lg font-semibold text-white mb-3">{team?.teamName}</h4>
                            
                            <div className="mb-4">
                                <h5 className="text-sm font-medium text-emerald-300 mb-2">Players:</h5>
                                <div className="space-y-2">
                                    {(offer.players || []).map((player, index) => (
                                        <div key={index} className="flex justify-between items-center bg-emerald-700 p-2 rounded">
                                            <span className="text-white text-sm">{player.name} ({player.position})</span>
                                            <button 
                                                onClick={() => removePlayerFromTrade(teamId, index)}
                                                className="text-red-400 hover:text-red-300"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                
                                <div className="mt-3 space-y-2">
                                    <select 
                                        onChange={(e) => {
                                            const [playerId, rosterType] = e.target.value.split('|');
                                            if (playerId && rosterType) {
                                                addPlayerToTrade(teamId, playerId, rosterType);
                                                e.target.value = '';
                                            }
                                        }}
                                        className="w-full p-2 rounded bg-emerald-100 text-emerald-900 text-sm border border-emerald-300"
                                    >
                                        <option value="">Add player...</option>
                                        {(roster.lineup || []).map(playerId => {
                                            const player = getPlayerDetails(playerId, allPlayers);
                                            return (
                                                <option key={`lineup-${playerId}`} value={`${playerId}|lineup`}>
                                                    {player?.name} (Lineup)
                                                </option>
                                            );
                                        })}
                                        {(roster.bench || []).map(playerId => {
                                            const player = getPlayerDetails(playerId, allPlayers);
                                            return (
                                                <option key={`bench-${playerId}`} value={`${playerId}|bench`}>
                                                    {player?.name} (Bench)
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                            </div>

                            <div className="mb-4">
                                <h5 className="text-sm font-medium text-emerald-300 mb-2">Draft Picks:</h5>
                                <div className="space-y-2">
                                    {(offer.draftPicks || []).map((pick, index) => (
                                        <div key={index} className="flex justify-between items-center bg-emerald-700 p-2 rounded">
                                            <span className="text-white text-sm">{pick.year} Round {pick.round}</span>
                                            <button 
                                                onClick={() => removeDraftPick(teamId, index)}
                                                className="text-red-400 hover:text-red-300"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                
                                <div className="mt-3">
                                    <select 
                                        onChange={(e) => {
                                            const round = e.target.value;
                                            if (round) {
                                                addDraftPick(teamId, parseInt(round));
                                                e.target.value = '';
                                            }
                                        }}
                                        className="w-full p-2 rounded bg-emerald-100 text-emerald-900 text-sm border border-emerald-300"
                                    >
                                        <option value="">Add draft pick...</option>
                                        {[1, 2, 3, 4, 5, 6, 7].map(round => (
                                            <option key={round} value={round}>Round {round}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="text-sm text-emerald-300">
                                <p>Salary Cap Impact: ${offer.salaryCap}</p>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="mt-6">
                <button 
                    onClick={proposeTrade}
                    disabled={isLoading}
                    className="w-full px-8 py-4 bg-purple-800 hover:bg-purple-900 text-white font-bold rounded-md disabled:opacity-50 transition-colors shadow-lg"
                >
                    {isLoading ? 'Proposing Trade...' : 'Propose Trade'}
                </button>
            </div>
        </div>
    );

    const renderPendingTrades = () => (
        <div className="bg-emerald-900 p-6 rounded-lg border-2 border-emerald-700">
            <h3 className="text-2xl font-bold text-emerald-400 mb-4">Pending Trades</h3>
            
            {pendingTrades.length === 0 ? (
                <p className="text-emerald-400">No pending trades.</p>
            ) : (
                <div className="space-y-4">
                    {pendingTrades.map(trade => {
                        const isInvolved = trade.teams.includes(currentTeamId);
                        const hasResponded = trade.responses[currentTeamId];
                        const allAccepted = trade.teams.every(teamId => trade.responses[teamId] === 'accepted');
                        
                        return (
                            <div key={trade.id} className="bg-emerald-800 p-4 rounded-lg border-2 border-emerald-600">
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <h4 className="text-lg font-semibold text-white">Trade #{trade.id.slice(-6)}</h4>
                                        <p className="text-emerald-300 text-sm">
                                            Proposed by: {teamsData.find(t => t.id === trade.proposedBy)?.teamName}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                                            allAccepted ? 'bg-emerald-600 text-white' : 'bg-yellow-600 text-white'
                                        }`}>
                                            {allAccepted ? 'All Accepted' : 'Pending'}
                                        </span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                                    {trade.teams.map(teamId => {
                                        const team = teamsData.find(t => t.id === teamId);
                                        const offer = trade.offers[teamId];
                                        const response = trade.responses[teamId];
                                        
                                        return (
                                            <div key={teamId} className="bg-emerald-700 p-3 rounded">
                                                <div className="flex justify-between items-center mb-2">
                                                    <h5 className="font-semibold text-white">{team?.teamName}</h5>
                                                    <span className={`px-2 py-1 rounded text-xs ${
                                                        response === 'accepted' ? 'bg-emerald-600 text-white' :
                                                        response === 'declined' ? 'bg-red-600 text-white' :
                                                        'bg-emerald-600 text-white'
                                                    }`}>
                                                        {response || 'Pending'}
                                                    </span>
                                                </div>
                                                
                                                <div className="text-sm text-emerald-300">
                                                    <p>Players: {offer?.players?.length || 0}</p>
                                                    <p>Draft Picks: {offer?.draftPicks?.length || 0}</p>
                                                    <p>Salary: ${offer?.salaryCap || 0}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="flex gap-2">
                                    {isInvolved && !hasResponded && (
                                        <>
                                            <button 
                                                onClick={() => respondToTrade(trade.id, 'accepted')}
                                                disabled={isLoading}
                                                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md disabled:opacity-50 transition-colors"
                                            >
                                                Accept
                                            </button>
                                            <button 
                                                onClick={() => respondToTrade(trade.id, 'declined')}
                                                disabled={isLoading}
                                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md disabled:opacity-50 transition-colors"
                                            >
                                                Decline
                                            </button>
                                        </>
                                    )}
                                    
                                    {isCommissioner && allAccepted && (
                                        <button 
                                            onClick={() => executeTrade(trade.id)}
                                            disabled={isLoading}
                                            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md disabled:opacity-50 transition-colors"
                                        >
                                            Execute Trade
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );

    // Show loading state if data is not ready
    if (!currentLeague || !currentTeam || !currentTeamId) {
        console.log('TradeCenter Debug:', { currentLeague, currentTeam, currentTeamId });
        return (
                    <div className="p-4 sm:p-6 bg-emerald-950 rounded-lg shadow-xl max-w-7xl mx-auto my-2 sm:my-8 text-white">
            <div className="text-center">
                <h2 className="text-3xl font-bold text-white mb-4">Trade Center</h2>
                <p className="text-emerald-300">Loading league and team data...</p>
                <div className="mt-4 text-sm text-emerald-400">
                    <p>League: {currentLeague ? 'Loaded' : 'Missing'}</p>
                    <p>Team: {currentTeam ? 'Loaded' : 'Missing'}</p>
                    <p>Team ID: {currentTeamId || 'Missing'}</p>
                </div>
                <div className="flex items-center justify-center py-10">
                    <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-purple-500"></div>
                </div>
            </div>
        </div>
        );
    }

    return (
        <div className="p-4 sm:p-6 bg-emerald-950 rounded-lg shadow-xl max-w-7xl mx-auto my-2 sm:my-8 text-white">
            <div className="mb-6">
                <h2 className="text-3xl font-bold text-white mb-2">Trade Center</h2>
                <p className="text-emerald-300">League: {currentLeague?.name}</p>
                <p className="text-emerald-300">Your Team: {currentTeam?.teamName}</p>
                {isCommissioner && (
                    <p className="text-purple-400 font-semibold">Commissioner Mode</p>
                )}
            </div>

            {renderTradeProposal()}
            {renderPendingTrades()}

            <div className="mt-8">
                <SleeperPlayerList
                    players={allPlayers}
                    title="NFL Player Database"
                    emptyMessage="Player data is still loading."
                    maxHeight="24rem"
                />
            </div>
        </div>
    );
}; 