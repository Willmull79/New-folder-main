import React, { useState, useEffect } from 'react';
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { useFirebase } from '../contexts/FirebaseContext.js';
import { getModularFirestore } from '../config/firebaseModular.js';
import { getPlayerDetails } from '../utils/helpers.js';
import {
    isTeamSalaryCapEnabled,
    isPlayerSalaryEnabled,
} from '../constants/leagueDefaults.js';
import {
    cloneRoster,
    findPlayerLocation,
    getTradeParties,
    placePlayerInOpenSlot,
    removePlayerFromRoster,
} from '../utils/tradeRosterUtils.js';
import { ClickablePlayerName } from './ClickablePlayerName.js';
import { usePlayerScheduleModal } from '../hooks/usePlayerScheduleModal.js';

const firebase = window.firebase;

const getLineupPlayerIds = (lineup) => {
    if (Array.isArray(lineup)) {
        return lineup.filter(Boolean);
    }
    if (lineup && typeof lineup === 'object') {
        return Object.values(lineup).filter(Boolean);
    }
    return [];
};

export const TradeCenter = ({ currentLeague, currentTeam, allPlayers, showMessage, currentTeamId }) => {
    const { db } = useFirebase();
    const [teamsData, setTeamsData] = useState([]);
    const [pendingTrades, setPendingTrades] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedTeams, setSelectedTeams] = useState([]);
    const [tradeOffers, setTradeOffers] = useState({});
    const [teamToAdd, setTeamToAdd] = useState('');
    const { openSchedule, scheduleModal } = usePlayerScheduleModal();
    const leagueSettings = currentLeague?.settings || {};
    const salaryRulesEnabled = isTeamSalaryCapEnabled(leagueSettings) && isPlayerSalaryEnabled(leagueSettings);

    useEffect(() => {
        if (currentTeamId && selectedTeams.length === 0) {
            setSelectedTeams([currentTeamId]);
            setTradeOffers({
                [currentTeamId]: initializeTradeOffer(),
            });
        }
    }, [currentTeamId, selectedTeams.length]);

    useEffect(() => {
        if (!db || !currentLeague?.id) return undefined;

        const teamsUnsubscribe = db.collection(`leagues/${currentLeague.id}/teams`)
            .limit(50)
            .onSnapshot((snapshot) => {
                const teams = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
                setTeamsData(teams);
            }, (error) => {
                console.error('Error listening to teams:', error);
            });

        const tradesUnsubscribe = db.collection(`leagues/${currentLeague.id}/trades`)
            .where('status', '==', 'pending')
            .limit(50)
            .onSnapshot((snapshot) => {
                const trades = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
                setPendingTrades(trades);
            }, (error) => {
                console.error('Error listening to trades:', error);
            });

        return () => {
            teamsUnsubscribe();
            tradesUnsubscribe();
        };
    }, [db, currentLeague?.id]);

    const initializeTradeOffer = () => ({
        players: [],
        draftPicks: [],
        salaryCap: 0,
    });

    const addTeamToTrade = (teamId) => {
        // One-on-one trades only: sender (you) + one receiver
        if (!teamId || selectedTeams.length >= 2 || selectedTeams.includes(teamId)) return;

        setSelectedTeams([...selectedTeams, teamId]);
        setTradeOffers({
            ...tradeOffers,
            [teamId]: initializeTradeOffer(),
        });
        setTeamToAdd('');
    };

    const availableTeamsToAdd = teamsData.filter((team) => !selectedTeams.includes(team.id));

    const removeTeamFromTrade = (teamId) => {
        if (selectedTeams.length > 1 && teamId !== currentTeamId) {
            setSelectedTeams(selectedTeams.filter((id) => id !== teamId));
            const newOffers = { ...tradeOffers };
            delete newOffers[teamId];
            setTradeOffers(newOffers);
        }
    };

    const addPlayerToTrade = (teamId, playerId, rosterType) => {
        const player = getPlayerDetails(playerId, allPlayers);
        if (!player) return;

        setTradeOffers((prev) => ({
            ...prev,
            [teamId]: {
                ...prev[teamId],
                players: [...(prev[teamId]?.players || []), {
                    id: playerId,
                    name: player.name,
                    position: player.position,
                    nflTeam: player.nflTeam,
                    salary: player.salary,
                    rosterType,
                }],
                salaryCap: (prev[teamId]?.salaryCap || 0) + (player.salary || 0),
            },
        }));
    };

    const removePlayerFromTrade = (teamId, playerIndex) => {
        setTradeOffers((prev) => {
            const player = prev[teamId]?.players[playerIndex];
            return {
                ...prev,
                [teamId]: {
                    ...prev[teamId],
                    players: prev[teamId].players.filter((_, index) => index !== playerIndex),
                    salaryCap: (prev[teamId]?.salaryCap || 0) - (player?.salary || 0),
                },
            };
        });
    };

    const addDraftPick = (teamId, round, year = new Date().getFullYear()) => {
        setTradeOffers((prev) => ({
            ...prev,
            [teamId]: {
                ...prev[teamId],
                draftPicks: [...(prev[teamId]?.draftPicks || []), { round, year }],
            },
        }));
    };

    const removeDraftPick = (teamId, pickIndex) => {
        setTradeOffers((prev) => ({
            ...prev,
            [teamId]: {
                ...prev[teamId],
                draftPicks: prev[teamId].draftPicks.filter((_, index) => index !== pickIndex),
            },
        }));
    };

    const getTeamRoster = (teamId) => {
        const team = teamsData.find((t) => t.id === teamId);
        const roster = team?.roster || {};
        return {
            lineup: getLineupPlayerIds(roster.lineup),
            bench: Array.isArray(roster.bench) ? roster.bench.filter(Boolean) : [],
            ir: Array.isArray(roster.ir) ? roster.ir.filter(Boolean) : [],
        };
    };

    const validateTrade = () => {
        if (selectedTeams.length !== 2) {
            return { valid: false, message: 'Select exactly one other team for a one-on-one trade.' };
        }

        for (const teamId of selectedTeams) {
            const offer = tradeOffers[teamId];
            if (!offer || (!offer.players.length && !offer.draftPicks.length)) {
                const team = teamsData.find((t) => t.id === teamId);
                return { valid: false, message: `${team?.teamName} has nothing to offer in this trade.` };
            }
        }

        if (salaryRulesEnabled) {
            for (const teamId of selectedTeams) {
                const team = teamsData.find((t) => t.id === teamId);
                const offer = tradeOffers[teamId];
                if (!team || !offer) continue;

                const currentSalary = getLineupPlayerIds(team.roster?.lineup).reduce((sum, playerId) => {
                    const player = getPlayerDetails(playerId, allPlayers);
                    return sum + (player?.salary || 0);
                }, 0);

                const outgoingSalary = offer.players
                    .filter((p) => p.rosterType === 'lineup')
                    .reduce((sum, p) => sum + (p.salary || 0), 0);

                const incomingSalary = selectedTeams
                    .filter((otherTeamId) => otherTeamId !== teamId)
                    .reduce((sum, otherTeamId) => {
                        const otherOffer = tradeOffers[otherTeamId];
                        return sum + (otherOffer?.players
                            .filter((p) => p.rosterType === 'lineup')
                            .reduce((s, p) => s + (p.salary || 0), 0) || 0);
                    }, 0);

                const newSalary = currentSalary - outgoingSalary + incomingSalary;
                const salaryCap = currentLeague?.settings?.teamSalary || 200;

                if (newSalary > salaryCap) {
                    return { valid: false, message: `${team.teamName} would exceed salary cap after trade.` };
                }
            }
        }

        return { valid: true, message: 'Trade is valid!' };
    };

    const proposeTrade = async () => {
        const validation = validateTrade();
        if (!validation.valid) {
            return showMessage(validation.message, 'error');
        }

        const receiverTeamId = selectedTeams.find((id) => id !== currentTeamId);
        if (!receiverTeamId) {
            return showMessage('Select a receiving team.', 'error');
        }
        const receiverTeam = teamsData.find((team) => team.id === receiverTeamId);
        if (!receiverTeam?.ownerId) {
            return showMessage('The receiving team does not have a manager to notify.', 'error');
        }

        setIsLoading(true);
        try {
            const modularDb = getModularFirestore();
            const tradeRef = doc(collection(modularDb, 'leagues', currentLeague.id, 'trades'));
            const notificationRef = doc(collection(modularDb, 'leagues', currentLeague.id, 'notifications'));
            const tradeData = {
                teams: selectedTeams,
                senderTeamId: currentTeamId,
                receiverTeamId,
                offers: tradeOffers,
                proposedBy: currentTeamId,
                status: 'pending',
                createdAt: serverTimestamp(),
            };

            const batch = writeBatch(modularDb);
            batch.set(tradeRef, tradeData);
            batch.set(notificationRef, {
                type: 'trade_proposed',
                tradeId: tradeRef.id,
                recipientTeamId: receiverTeamId,
                recipientUserId: receiverTeam.ownerId,
                senderTeamId: currentTeamId,
                senderTeamName: currentTeam?.teamName || 'Another team',
                message: `${currentTeam?.teamName || 'Another team'} sent you a trade proposal.`,
                read: false,
                createdAt: serverTimestamp(),
            });
            await batch.commit();

            showMessage('Trade proposal sent successfully!', 'success');
            setSelectedTeams([currentTeamId]);
            setTradeOffers({ [currentTeamId]: initializeTradeOffer() });
            setTeamToAdd('');
        } catch (error) {
            console.error('Error proposing trade:', error);
            showMessage('Error proposing trade.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const cancelTrade = async (tradeId) => {
        setIsLoading(true);
        try {
            await db.doc(`leagues/${currentLeague.id}/trades/${tradeId}`).update({
                status: 'cancelled',
                resolvedAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
            showMessage('Trade cancelled.', 'success');
        } catch (error) {
            console.error('Error cancelling trade:', error);
            showMessage(error?.message || 'Failed to cancel trade.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const rejectTrade = async (tradeId) => {
        setIsLoading(true);
        try {
            await db.doc(`leagues/${currentLeague.id}/trades/${tradeId}`).update({
                status: 'rejected',
                resolvedAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
            showMessage('Trade rejected.', 'success');
        } catch (error) {
            console.error('Error rejecting trade:', error);
            showMessage(error?.message || 'Failed to reject trade.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * Accept trade inside a Firestore transaction:
     * - remove outgoing players from positional slots
     * - place incoming players into open positional slots (abort if none fit)
     */
    const acceptTrade = async (tradeId) => {
        if (!db || !currentLeague?.id) return;

        setIsLoading(true);
        try {
            const tradeRef = db.doc(`leagues/${currentLeague.id}/trades/${tradeId}`);

            await db.runTransaction(async (transaction) => {
                const tradeSnap = await transaction.get(tradeRef);
                if (!tradeSnap.exists) {
                    throw new Error('Trade not found.');
                }

                const trade = tradeSnap.data();
                if (trade.status !== 'pending') {
                    throw new Error('This trade is no longer pending.');
                }

                const { senderTeamId, receiverTeamId } = getTradeParties(trade);
                if (!senderTeamId || !receiverTeamId) {
                    throw new Error('Trade is missing sender or receiver.');
                }
                if (currentTeamId !== receiverTeamId) {
                    throw new Error('Only the receiving team can accept this trade.');
                }

                const senderRef = db.doc(`leagues/${currentLeague.id}/teams/${senderTeamId}`);
                const receiverRef = db.doc(`leagues/${currentLeague.id}/teams/${receiverTeamId}`);

                const senderSnap = await transaction.get(senderRef);
                const receiverSnap = await transaction.get(receiverRef);

                if (!senderSnap.exists || !receiverSnap.exists) {
                    throw new Error('Could not load both teams for this trade.');
                }

                const senderTeam = { id: senderSnap.id, ...senderSnap.data() };
                const receiverTeam = { id: receiverSnap.id, ...receiverSnap.data() };

                const senderRoster = cloneRoster(senderTeam.roster);
                const receiverRoster = cloneRoster(receiverTeam.roster);

                const senderOutgoing = trade.offers?.[senderTeamId]?.players || [];
                const receiverOutgoing = trade.offers?.[receiverTeamId]?.players || [];

                // Snapshot original positional slots so commissioners can reverse exactly
                const originalLocations = {};
                senderOutgoing.forEach((player) => {
                    const location = findPlayerLocation(senderRoster, player.id);
                    if (location) {
                        originalLocations[player.id] = { teamId: senderTeamId, ...location };
                    }
                });
                receiverOutgoing.forEach((player) => {
                    const location = findPlayerLocation(receiverRoster, player.id);
                    if (location) {
                        originalLocations[player.id] = { teamId: receiverTeamId, ...location };
                    }
                });

                // 1) Remove traded players from their current teams
                senderOutgoing.forEach((player) => removePlayerFromRoster(senderRoster, player.id));
                receiverOutgoing.forEach((player) => removePlayerFromRoster(receiverRoster, player.id));

                // 2) Place each side's outgoing players into the other team's open positional slots
                receiverOutgoing.forEach((player) => {
                    const position = player.position
                        || getPlayerDetails(player.id, allPlayers)?.position;
                    if (!position) {
                        throw new Error(`Missing position for player ${player.name || player.id}.`);
                    }
                    placePlayerInOpenSlot(
                        senderRoster,
                        player.id,
                        position,
                        senderTeam.teamName || 'Sender'
                    );
                });

                senderOutgoing.forEach((player) => {
                    const position = player.position
                        || getPlayerDetails(player.id, allPlayers)?.position;
                    if (!position) {
                        throw new Error(`Missing position for player ${player.name || player.id}.`);
                    }
                    placePlayerInOpenSlot(
                        receiverRoster,
                        player.id,
                        position,
                        receiverTeam.teamName || 'Receiver'
                    );
                });

                transaction.update(tradeRef, {
                    status: 'accepted',
                    acceptedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    resolvedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    originalLocations,
                });
                transaction.update(senderRef, { roster: senderRoster });
                transaction.update(receiverRef, { roster: receiverRoster });
            });

            showMessage('Trade accepted and rosters updated!', 'success');
        } catch (error) {
            console.error('Error accepting trade:', error);
            showMessage(error?.message || 'Failed to accept trade.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const renderTradeProposal = () => (
        <div className="bg-emerald-900 p-6 rounded-lg border-2 border-emerald-700 mb-6">
            <h3 className="text-2xl font-bold text-purple-400 mb-4">Propose Trade</h3>
            <p className="text-sm text-emerald-400 mb-4">
                One-on-one trades only. You are the sender; choose one receiving team.
            </p>

            <div className="mb-4">
                <label className="block text-emerald-200 font-medium mb-2">Teams in Trade:</label>
                <div className="flex flex-wrap gap-2">
                    {selectedTeams.map((teamId) => {
                        const team = teamsData.find((t) => t.id === teamId);
                        return (
                            <div key={teamId} className="flex items-center gap-2 bg-emerald-800 px-3 py-1 rounded-md">
                                <span className="text-white">
                                    {team?.teamName}
                                    {teamId === currentTeamId ? ' (You — Sender)' : ' (Receiver)'}
                                </span>
                                {teamId !== currentTeamId && (
                                    <button
                                        type="button"
                                        onClick={() => removeTeamFromTrade(teamId)}
                                        className="text-red-400 hover:text-red-300"
                                    >
                                        ×
                                    </button>
                                )}
                            </div>
                        );
                    })}
                    {selectedTeams.length < 2 && availableTeamsToAdd.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                            <select
                                value={teamToAdd}
                                onChange={(e) => setTeamToAdd(e.target.value)}
                                className="px-3 py-1 rounded-md bg-emerald-100 text-emerald-900 border border-emerald-300 text-sm"
                            >
                                <option value="">Choose receiving team...</option>
                                {availableTeamsToAdd.map((team) => (
                                    <option key={team.id} value={team.id}>
                                        {team.teamName}
                                    </option>
                                ))}
                            </select>
                            <button
                                type="button"
                                onClick={() => addTeamToTrade(teamToAdd)}
                                disabled={!teamToAdd}
                                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                + Add Receiver
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {selectedTeams.map((teamId) => {
                    const team = teamsData.find((t) => t.id === teamId);
                    const offer = tradeOffers[teamId] || initializeTradeOffer();
                    const roster = getTeamRoster(teamId);

                    return (
                        <div key={teamId} className="bg-emerald-800 p-4 rounded-lg border-2 border-emerald-600">
                            <h4 className="text-lg font-semibold text-white mb-3">{team?.teamName}</h4>

                            <div className="mb-4">
                                <h5 className="text-sm font-medium text-emerald-300 mb-2">Players offering:</h5>
                                <div className="space-y-2">
                                    {(offer.players || []).map((player, index) => {
                                        const fullPlayer = getPlayerDetails(player.id, allPlayers) || player;
                                        return (
                                        <div key={`${player.id}-${index}`} className="flex justify-between items-center bg-emerald-700 p-2 rounded">
                                            <span className="text-white text-sm">
                                                <ClickablePlayerName
                                                    player={fullPlayer}
                                                    onOpenSchedule={openSchedule}
                                                    className="text-white text-sm"
                                                />
                                                {' '}({player.position})
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => removePlayerFromTrade(teamId, index)}
                                                className="text-red-400 hover:text-red-300"
                                            >
                                                ×
                                            </button>
                                        </div>
                                        );
                                    })}
                                </div>

                                <div className="mt-3">
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
                                        {(roster.lineup || []).map((playerId) => {
                                            const player = getPlayerDetails(playerId, allPlayers);
                                            return (
                                                <option key={`lineup-${playerId}`} value={`${playerId}|lineup`}>
                                                    {player?.name} (Lineup)
                                                </option>
                                            );
                                        })}
                                        {(roster.bench || []).map((playerId) => {
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
                                        <div key={`${pick.year}-${pick.round}-${index}`} className="flex justify-between items-center bg-emerald-700 p-2 rounded">
                                            <span className="text-white text-sm">{pick.year} Round {pick.round}</span>
                                            <button
                                                type="button"
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
                                                addDraftPick(teamId, parseInt(round, 10));
                                                e.target.value = '';
                                            }
                                        }}
                                        className="w-full p-2 rounded bg-emerald-100 text-emerald-900 text-sm border border-emerald-300"
                                    >
                                        <option value="">Add draft pick...</option>
                                        {[1, 2, 3, 4, 5, 6, 7].map((round) => (
                                            <option key={round} value={round}>Round {round}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {salaryRulesEnabled && (
                                <div className="text-sm text-emerald-300">
                                    <p>Salary Cap Impact: ${offer.salaryCap}</p>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="mt-6">
                <button
                    type="button"
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
                    {pendingTrades.map((trade) => {
                        const { senderTeamId, receiverTeamId } = getTradeParties(trade);
                        const isSender = currentTeamId === senderTeamId;
                        const isReceiver = currentTeamId === receiverTeamId;
                        const isPending = trade.status === 'pending';

                        return (
                            <div key={trade.id} className="bg-emerald-800 p-4 rounded-lg border-2 border-emerald-600">
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <h4 className="text-lg font-semibold text-white">Trade #{trade.id.slice(-6)}</h4>
                                        <p className="text-emerald-300 text-sm">
                                            Sender: {teamsData.find((t) => t.id === senderTeamId)?.teamName || 'Unknown'}
                                        </p>
                                        <p className="text-emerald-300 text-sm">
                                            Receiver: {teamsData.find((t) => t.id === receiverTeamId)?.teamName || 'Unknown'}
                                        </p>
                                    </div>
                                    <span className="px-2 py-1 rounded text-xs font-bold bg-yellow-600 text-white">
                                        Pending
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                    {(trade.teams || [senderTeamId, receiverTeamId]).filter(Boolean).map((teamId) => {
                                        const team = teamsData.find((t) => t.id === teamId);
                                        const offer = trade.offers?.[teamId];
                                        return (
                                            <div key={teamId} className="bg-emerald-700 p-3 rounded">
                                                <h5 className="font-semibold text-white mb-2">{team?.teamName}</h5>
                                                <ul className="text-sm text-emerald-200 space-y-1">
                                                    {(offer?.players || []).map((player) => {
                                                        const fullPlayer = getPlayerDetails(player.id, allPlayers) || player;
                                                        return (
                                                        <li key={player.id}>
                                                            <ClickablePlayerName
                                                                player={fullPlayer}
                                                                onOpenSchedule={openSchedule}
                                                                className="text-emerald-200 text-sm"
                                                            />
                                                            {' '}({player.position})
                                                        </li>
                                                        );
                                                    })}
                                                    {(offer?.draftPicks || []).map((pick, idx) => (
                                                        <li key={`${pick.year}-${pick.round}-${idx}`}>
                                                            {pick.year} Round {pick.round}
                                                        </li>
                                                    ))}
                                                    {!offer?.players?.length && !offer?.draftPicks?.length && (
                                                        <li className="text-emerald-400">No assets listed</li>
                                                    )}
                                                </ul>
                                                {salaryRulesEnabled && (
                                                    <p className="text-xs text-emerald-300 mt-2">Salary: ${offer?.salaryCap || 0}</p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    {isPending && isSender && (
                                        <button
                                            type="button"
                                            onClick={() => cancelTrade(trade.id)}
                                            disabled={isLoading}
                                            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md disabled:opacity-50 transition-colors font-semibold"
                                        >
                                            Cancel Trade
                                        </button>
                                    )}
                                    {isPending && isReceiver && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => rejectTrade(trade.id)}
                                                disabled={isLoading}
                                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md disabled:opacity-50 transition-colors font-semibold"
                                            >
                                                Reject Trade
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => acceptTrade(trade.id)}
                                                disabled={isLoading}
                                                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md disabled:opacity-50 transition-colors font-semibold"
                                            >
                                                Accept Trade
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );

    if (!currentLeague || !currentTeam || !currentTeamId) {
        return (
            <div className="p-4 sm:p-6 bg-emerald-950 rounded-lg shadow-xl max-w-7xl mx-auto my-2 sm:my-8 text-white">
                <div className="text-center">
                    <h2 className="text-3xl font-bold text-white mb-4">Trade Center</h2>
                    <p className="text-emerald-300">Loading league and team data...</p>
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
            </div>

            {renderTradeProposal()}
            {renderPendingTrades()}
            {scheduleModal}
        </div>
    );
};

export default TradeCenter;
