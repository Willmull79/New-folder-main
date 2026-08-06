import React, { useEffect, useState } from 'react';
import { useFirebase } from '../contexts/FirebaseContext.js';
import { ConfirmationModal } from './ConfirmationModal.js';
import { getPlayerDetails } from '../utils/helpers.js';
import { isLeagueCommissioner } from '../constants/leagueDefaults.js';
import {
    cloneRoster,
    getTradeParties,
    placePlayerAtLocation,
    removePlayerFromRoster,
} from '../utils/tradeRosterUtils.js';

const firebase = window.firebase;

/**
 * Commissioner panel to reverse accepted trades via Firestore transaction.
 */
export const CommissionerTradeUndo = ({
    currentLeague,
    teamsData = [],
    allPlayers = [],
    showMessage,
    userId,
}) => {
    const { db } = useFirebase();
    const [acceptedTrades, setAcceptedTrades] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [tradeToUndo, setTradeToUndo] = useState(null);

    const isCommissioner = isLeagueCommissioner(currentLeague, userId);

    useEffect(() => {
        if (!db || !currentLeague?.id || !isCommissioner) {
            setAcceptedTrades([]);
            return undefined;
        }

        const unsubscribe = db.collection(`leagues/${currentLeague.id}/trades`)
            .where('status', '==', 'accepted')
            .limit(50)
            .onSnapshot((snapshot) => {
                const trades = snapshot.docs.map((docSnap) => ({
                    id: docSnap.id,
                    ...docSnap.data(),
                }));
                // Newest first when timestamps exist
                trades.sort((a, b) => {
                    const aTime = a.acceptedAt?.toMillis?.() || a.resolvedAt?.toMillis?.() || 0;
                    const bTime = b.acceptedAt?.toMillis?.() || b.resolvedAt?.toMillis?.() || 0;
                    return bTime - aTime;
                });
                setAcceptedTrades(trades);
            }, (error) => {
                console.error('Error listening to accepted trades:', error);
                showMessage?.('Failed to load accepted trades.', 'error');
            });

        return () => unsubscribe();
    }, [db, currentLeague?.id, isCommissioner, showMessage]);

    const teamName = (teamId) => teamsData.find((t) => t.id === teamId)?.teamName || teamId;

    const undoTrade = async (tradeId) => {
        if (!db || !currentLeague?.id || !isCommissioner || !tradeId) return;

        setIsLoading(true);
        try {
            const tradeRef = db.doc(`leagues/${currentLeague.id}/trades/${tradeId}`);

            await db.runTransaction(async (transaction) => {
                const tradeSnap = await transaction.get(tradeRef);
                if (!tradeSnap.exists) {
                    throw new Error('Trade not found.');
                }

                const trade = tradeSnap.data();
                if (trade.status !== 'accepted') {
                    throw new Error('Only accepted trades can be reversed.');
                }

                const { senderTeamId, receiverTeamId } = getTradeParties(trade);
                if (!senderTeamId || !receiverTeamId) {
                    throw new Error('Trade is missing sender or receiver teams.');
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
                const originalLocations = trade.originalLocations || {};

                // Players originally from sender are currently on receiver — move back to sender
                senderOutgoing.forEach((player) => {
                    removePlayerFromRoster(receiverRoster, player.id);
                    removePlayerFromRoster(senderRoster, player.id);
                    const position = player.position
                        || getPlayerDetails(player.id, allPlayers)?.position;
                    const location = originalLocations[player.id] || null;
                    placePlayerAtLocation(
                        senderRoster,
                        player.id,
                        location,
                        position,
                        senderTeam.teamName || 'Sender'
                    );
                });

                // Players originally from receiver are currently on sender — move back to receiver
                receiverOutgoing.forEach((player) => {
                    removePlayerFromRoster(senderRoster, player.id);
                    removePlayerFromRoster(receiverRoster, player.id);
                    const position = player.position
                        || getPlayerDetails(player.id, allPlayers)?.position;
                    const location = originalLocations[player.id] || null;
                    placePlayerAtLocation(
                        receiverRoster,
                        player.id,
                        location,
                        position,
                        receiverTeam.teamName || 'Receiver'
                    );
                });

                transaction.update(tradeRef, {
                    status: 'reversed',
                    reversedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    reversedBy: userId,
                });
                transaction.update(senderRef, { roster: senderRoster });
                transaction.update(receiverRef, { roster: receiverRoster });
            });

            showMessage('Trade reversed. Rosters restored.', 'success');
        } catch (error) {
            console.error('Error undoing trade:', error);
            showMessage(error?.message || 'Failed to undo trade.', 'error');
        } finally {
            setIsLoading(false);
            setTradeToUndo(null);
        }
    };

    if (!isCommissioner) {
        return null;
    }

    return (
        <div className="bg-emerald-900 p-6 rounded-lg shadow-lg border-2 border-yellow-600 mb-6">
            <h3 className="text-2xl font-bold text-yellow-300 mb-2">Undo Accepted Trades</h3>
            <p className="text-sm text-emerald-400 mb-4">
                Reverse an accepted trade and force players back onto their original teams. Only commissioners can use this.
            </p>

            {acceptedTrades.length === 0 ? (
                <p className="text-emerald-400 text-sm">No accepted trades available to undo.</p>
            ) : (
                <div className="space-y-4">
                    {acceptedTrades.map((trade) => {
                        const { senderTeamId, receiverTeamId } = getTradeParties(trade);
                        return (
                            <div
                                key={trade.id}
                                className="bg-emerald-800 border border-emerald-600 rounded-lg p-4"
                            >
                                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                                    <div>
                                        <h4 className="text-lg font-semibold text-white">
                                            Trade #{trade.id.slice(-6)}
                                        </h4>
                                        <p className="text-sm text-emerald-300">
                                            {teamName(senderTeamId)} ↔ {teamName(receiverTeamId)}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setTradeToUndo(trade)}
                                        disabled={isLoading}
                                        className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-yellow-950 font-bold rounded-md disabled:opacity-50 transition-colors"
                                    >
                                        Undo Trade
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                    <div className="bg-emerald-950/50 rounded-md p-3">
                                        <p className="text-emerald-400 mb-1">{teamName(senderTeamId)} sent</p>
                                        <ul className="text-emerald-100 space-y-1">
                                            {(trade.offers?.[senderTeamId]?.players || []).map((p) => (
                                                <li key={p.id}>{p.name} ({p.position})</li>
                                            ))}
                                            {!(trade.offers?.[senderTeamId]?.players || []).length && (
                                                <li className="text-emerald-500">No players</li>
                                            )}
                                        </ul>
                                    </div>
                                    <div className="bg-emerald-950/50 rounded-md p-3">
                                        <p className="text-emerald-400 mb-1">{teamName(receiverTeamId)} sent</p>
                                        <ul className="text-emerald-100 space-y-1">
                                            {(trade.offers?.[receiverTeamId]?.players || []).map((p) => (
                                                <li key={p.id}>{p.name} ({p.position})</li>
                                            ))}
                                            {!(trade.offers?.[receiverTeamId]?.players || []).length && (
                                                <li className="text-emerald-500">No players</li>
                                            )}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <ConfirmationModal
                isOpen={Boolean(tradeToUndo)}
                onClose={() => !isLoading && setTradeToUndo(null)}
                onConfirm={() => tradeToUndo && undoTrade(tradeToUndo.id)}
                title="Undo Accepted Trade?"
            >
                <p className="mb-3">
                    This will set trade #{tradeToUndo?.id?.slice(-6)} to <strong>reversed</strong> and
                    forcefully modify both teams&apos; active rosters, moving players back to their
                    original teams and positional slots.
                </p>
                <p className="text-red-300 font-semibold">
                    Managers may already have rearranged lineups since the trade. This action cannot
                    be easily undone twice—confirm only if you intend to reverse the deal.
                </p>
            </ConfirmationModal>
        </div>
    );
};

export default CommissionerTradeUndo;
