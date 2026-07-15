import React, { useState, useEffect } from 'react';
import { useFirebase } from '../contexts/FirebaseContext.js';
import { getPlayerDetails, getAvailablePlayers } from '../utils/helpers.js';
import { SleeperPlayerList } from './SleeperPlayerList.js';
import { isFaabWaiver, isLeagueCommissioner } from '../constants/leagueDefaults.js';

// Import firebase globally (it's loaded in the HTML)
const firebase = window.firebase;

export const WaiverWire = ({ currentLeague, currentTeam, allPlayers, showMessage, currentTeamId }) => {
    const { db } = useFirebase();
    const [waiverClaims, setWaiverClaims] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedPlayer, setSelectedPlayer] = useState('');
    const [bidAmount, setBidAmount] = useState(1);
    const [teamsData, setTeamsData] = useState([]);
    const [availablePlayers, setAvailablePlayers] = useState([]);

    const useFaabWaivers = isFaabWaiver(currentLeague?.settings);
    const isAuctionComplete = currentLeague?.auction?.status === 'complete';

    useEffect(() => {
        if (!db || !currentLeague?.id) return;

        // Listen to waiver claims
        const waiverUnsubscribe = db.collection(`leagues/${currentLeague.id}/waivers`)
            .orderBy('createdAt', 'desc')
            .onSnapshot(snapshot => {
                const claims = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setWaiverClaims(claims);
            }, error => {
                console.error("Error listening to waiver claims:", error);
            });

        // Listen to teams in the league subcollection
        const teamsUnsubscribe = db.collection(`leagues/${currentLeague.id}/teams`)
            .onSnapshot(snapshot => {
                const teams = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setTeamsData(teams);
            }, error => {
                console.error("Error listening to teams:", error);
            });

        return () => {
            waiverUnsubscribe();
            teamsUnsubscribe();
        };
    }, [db, currentLeague?.id]);

    useEffect(() => {
        if (currentLeague && allPlayers) {
            const available = getAvailablePlayers(currentLeague.allRosteredPlayerIds || [], allPlayers);
            setAvailablePlayers(available);
        }
    }, [currentLeague, allPlayers]);

    const getPriorityOrderedTeams = () => [...teamsData].sort((a, b) => {
        if (a.losses !== b.losses) {
            return b.losses - a.losses;
        }
        return a.wins - b.wins;
    });

    const handlePlaceWaiverBid = async () => {
        if (!isAuctionComplete) {
            return showMessage("You cannot add free agents until the auction is complete.", "error");
        }
        
        if (!selectedPlayer) {
            return showMessage("Please select a player.", "error");
        }
        
        if (bidAmount <= 0) {
            return showMessage("Bid must be greater than zero.", "error");
        }

        setIsLoading(true);
        try {
            const waiverRef = db.collection(`leagues/${currentLeague.id}/waivers`).doc(selectedPlayer);
            
            // Check if player is already on waiver wire
            const waiverDoc = await waiverRef.get();
            if (waiverDoc.exists) {
                return showMessage("This player is already on the waiver wire.", "error");
            }

            const expiration = new Date();
            expiration.setHours(expiration.getHours() + 24);

            await waiverRef.set({
                playerId: selectedPlayer,
                waiverType: 'auction',
                bids: {
                    [currentTeamId]: Number(bidAmount)
                },
                highestBid: Number(bidAmount),
                highestBidder: currentTeamId,
                expiration: firebase.firestore.Timestamp.fromDate(expiration),
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'active'
            });

            showMessage(`Waiver bid placed on ${getPlayerDetails(selectedPlayer, allPlayers).name}!`, "success");
            setSelectedPlayer('');
            setBidAmount(1);
        } catch (error) {
            console.error("Error placing waiver bid:", error);
            showMessage("Error placing waiver bid.", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmitWaiverClaim = async (playerId = selectedPlayer) => {
        if (!playerId) {
            return showMessage("Please select a player.", "error");
        }

        setIsLoading(true);
        try {
            const waiverRef = db.collection(`leagues/${currentLeague.id}/waivers`).doc(playerId);
            const waiverDoc = await waiverRef.get();

            if (waiverDoc.exists) {
                const data = waiverDoc.data();
                if (data.waiverType === 'auction' || data.bids) {
                    return showMessage("This player is on an auction waiver.", "error");
                }
                const claimants = Array.isArray(data.claimants) ? data.claimants : [];
                if (claimants.includes(currentTeamId)) {
                    return showMessage("You already have a claim on this player.", "error");
                }
                await waiverRef.update({
                    claimants: firebase.firestore.FieldValue.arrayUnion(currentTeamId),
                });
            } else {
                await waiverRef.set({
                    playerId,
                    waiverType: 'traditional',
                    claimants: [currentTeamId],
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    status: 'active',
                });
            }

            showMessage(`Waiver claim submitted for ${getPlayerDetails(playerId, allPlayers).name}!`, "success");
            setSelectedPlayer('');
        } catch (error) {
            console.error("Error submitting waiver claim:", error);
            showMessage("Error submitting waiver claim.", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleProcessWaiver = async (waiverId) => {
        if (!useFaabWaivers) {
            return showMessage("Use Process Claim for traditional priority waivers.", "error");
        }

        setIsLoading(true);
        try {
            const waiverRef = db.doc(`leagues/${currentLeague.id}/waivers/${waiverId}`);
            const waiverDoc = await waiverRef.get();
            
            if (!waiverDoc.exists) {
                return showMessage("Waiver claim not found.", "error");
            }

            const waiver = waiverDoc.data();
            const now = new Date();
            const expiration = waiver.expiration.toDate();

            if (now < expiration) {
                return showMessage("Waiver period has not expired yet.", "error");
            }

            // Award player to highest bidder
            const winningTeam = teamsData.find(t => t.id === waiver.highestBidder);
            if (!winningTeam) {
                return showMessage("Winning team not found.", "error");
            }

            const batch = db.batch();
            
            // Add player to winning team's bench
            const teamRef = db.doc(`leagues/${currentLeague.id}/teams/${winningTeam.id}`);
            const updatedRoster = {
                lineup: winningTeam.roster?.lineup || {},
                bench: Array.isArray(winningTeam.roster?.bench) ? [...winningTeam.roster.bench] : [],
                ir: Array.isArray(winningTeam.roster?.ir) ? [...winningTeam.roster.ir] : [],
            };
            updatedRoster.bench.push(waiver.playerId);
            
            batch.update(teamRef, { roster: updatedRoster });
            
            // Update league's rostered players
            const leagueRef = db.doc(`leagues/${currentLeague.id}`);
            batch.update(leagueRef, {
                allRosteredPlayerIds: firebase.firestore.FieldValue.arrayUnion(waiver.playerId)
            });
            
            // Mark waiver as processed
            batch.update(waiverRef, { status: 'processed' });
            
            await batch.commit();
            
            showMessage(`${getPlayerDetails(waiver.playerId, allPlayers).name} awarded to ${winningTeam.teamName}!`, "success");
        } catch (error) {
            console.error("Error processing waiver:", error);
            showMessage("Error processing waiver.", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleProcessTraditionalClaim = async (waiverId) => {
        setIsLoading(true);
        try {
            const waiverRef = db.doc(`leagues/${currentLeague.id}/waivers/${waiverId}`);
            const waiverDoc = await waiverRef.get();

            if (!waiverDoc.exists) {
                return showMessage("Waiver claim not found.", "error");
            }

            const waiver = waiverDoc.data();
            const claimants = Array.isArray(waiver.claimants) ? waiver.claimants : [];
            if (claimants.length === 0) {
                return showMessage("No claims to process.", "error");
            }

            const priorityOrder = getPriorityOrderedTeams();
            const winnerId = priorityOrder.find((team) => claimants.includes(team.id))?.id;
            const winningTeam = teamsData.find((t) => t.id === winnerId);

            if (!winningTeam) {
                return showMessage("Winning team not found.", "error");
            }

            const batch = db.batch();
            const teamRef = db.doc(`leagues/${currentLeague.id}/teams/${winningTeam.id}`);
            const updatedRoster = {
                lineup: winningTeam.roster?.lineup || {},
                bench: Array.isArray(winningTeam.roster?.bench) ? [...winningTeam.roster.bench] : [],
                ir: Array.isArray(winningTeam.roster?.ir) ? [...winningTeam.roster.ir] : [],
            };
            updatedRoster.bench.push(waiver.playerId);

            batch.update(teamRef, { roster: updatedRoster });
            batch.update(db.doc(`leagues/${currentLeague.id}`), {
                allRosteredPlayerIds: firebase.firestore.FieldValue.arrayUnion(waiver.playerId),
            });
            batch.update(waiverRef, {
                status: 'processed',
                awardedTo: winningTeam.id,
            });

            await batch.commit();
            showMessage(`${getPlayerDetails(waiver.playerId, allPlayers).name} awarded to ${winningTeam.teamName}!`, "success");
        } catch (error) {
            console.error("Error processing traditional waiver:", error);
            showMessage("Error processing waiver claim.", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const getWaiverPriority = () => {
        if (useFaabWaivers) return null;
        
        const sortedTeams = getPriorityOrderedTeams();
        const currentTeamIndex = sortedTeams.findIndex(t => t.id === currentTeamId);
        return currentTeamIndex + 1;
    };

    const renderAuctionWaivers = () => (
        <div className="space-y-6">
            <div className="bg-emerald-900 p-6 rounded-lg border-2 border-emerald-700">
                <h3 className="text-2xl font-bold text-yellow-400 mb-4">Place Waiver Bid</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-emerald-200 font-medium mb-2">Select Player:</label>
                        <select 
                            value={selectedPlayer} 
                            onChange={(e) => setSelectedPlayer(e.target.value)}
                            className="w-full p-3 rounded-md bg-emerald-100 text-emerald-900 border-2 border-emerald-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-colors"
                        >
                            <option value="">Choose a player...</option>
                            {availablePlayers.map(player => (
                                <option key={player.id} value={player.id}>
                                    {player.name} ({player.position} - {player.nflTeam})
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-emerald-200 font-medium mb-2">Bid Amount ($):</label>
                        <input 
                            type="number" 
                            value={bidAmount} 
                            onChange={(e) => setBidAmount(Number(e.target.value))}
                            min="1" 
                            step="1"
                            className="w-full p-3 rounded-md bg-emerald-100 text-emerald-900 border-2 border-emerald-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-colors"
                        />
                    </div>
                </div>
                <button 
                    onClick={handlePlaceWaiverBid} 
                    disabled={isLoading || !selectedPlayer || bidAmount <= 0 || !isAuctionComplete}
                    className="mt-4 px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-md disabled:opacity-50 transition-colors shadow-lg"
                >
                    {isLoading ? 'Placing Bid...' : 'Place Waiver Bid'}
                </button>
                {!isAuctionComplete && (
                    <p className="text-red-400 text-sm mt-2">Waiver wire is only available after the auction is complete.</p>
                )}
            </div>

            <SleeperPlayerList
                players={availablePlayers}
                title="Browse Free Agents"
                emptyMessage="No free agents available."
                maxHeight="20rem"
                onPlayerSelect={(player) => setSelectedPlayer(player.id)}
                selectLabel="Select for Bid"
            />

            <div className="bg-emerald-900 p-6 rounded-lg border-2 border-emerald-700">
                <h3 className="text-2xl font-bold text-purple-400 mb-4">Active Waiver Claims</h3>
                {waiverClaims.filter(claim => claim.status === 'active').length === 0 ? (
                    <p className="text-emerald-400">No active waiver claims.</p>
                ) : (
                    <div className="space-y-4">
                        {waiverClaims.filter(claim => claim.status === 'active').map(claim => {
                            const player = getPlayerDetails(claim.playerId, allPlayers);
                            const expiration = claim.expiration?.toDate();
                            const isExpired = expiration && new Date() > expiration;
                            const isCommissioner = isLeagueCommissioner(currentLeague, currentTeam?.ownerId);
                            
                            return (
                                <div key={claim.id} className="bg-emerald-800 p-4 rounded-lg border-2 border-emerald-600">
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <h4 className="text-lg font-semibold text-white">{player?.name}</h4>
                                            <p className="text-emerald-300">{player?.position} - {player?.nflTeam}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-yellow-400 font-bold">Highest Bid: ${claim.highestBid}</p>
                                            <p className="text-emerald-400 text-sm">
                                                By: {teamsData.find(t => t.id === claim.highestBidder)?.teamName}
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <p className="text-sm text-emerald-400">
                                                {isExpired ? 'Expired' : `Expires: ${expiration?.toLocaleString()}`}
                                            </p>
                                            <p className="text-sm text-emerald-400">
                                                {Object.keys(claim.bids || {}).length} bids
                                            </p>
                                        </div>
                                        
                                        {isCommissioner && isExpired && (
                                            <button 
                                                onClick={() => handleProcessWaiver(claim.id)}
                                                disabled={isLoading}
                                                className="px-6 py-2 bg-purple-800 hover:bg-purple-900 text-white rounded-md disabled:opacity-50 transition-colors"
                                            >
                                                {isLoading ? 'Processing...' : 'Process Waiver'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );

    const renderPriorityWaivers = () => {
        const activeClaims = waiverClaims.filter((claim) => claim.status === 'active');
        const isCommissioner = isLeagueCommissioner(currentLeague, currentTeam?.ownerId);

        return (
            <div className="space-y-6">
                <div className="bg-emerald-900 p-6 rounded-lg border-2 border-emerald-700">
                    <h3 className="text-2xl font-bold text-purple-400 mb-4">Waiver Priority</h3>
                    <p className="text-emerald-300 mb-4">
                        Your waiver priority: <span className="text-purple-400 font-bold">#{getWaiverPriority()}</span>
                    </p>
                    <p className="text-emerald-400 text-sm">
                        Priority is determined by record (most losses first, then fewest wins). Claims are resolved in priority order.
                    </p>
                </div>

                <div className="bg-emerald-900 p-6 rounded-lg border-2 border-emerald-700">
                    <h3 className="text-2xl font-bold text-yellow-400 mb-4">Submit Waiver Claim</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-emerald-200 font-medium mb-2">Select Player:</label>
                            <select
                                value={selectedPlayer}
                                onChange={(e) => setSelectedPlayer(e.target.value)}
                                className="w-full p-3 rounded-md bg-emerald-100 text-emerald-900 border-2 border-emerald-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-colors"
                            >
                                <option value="">Choose a player...</option>
                                {availablePlayers.map((player) => (
                                    <option key={player.id} value={player.id}>
                                        {player.name} ({player.position} - {player.nflTeam})
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <button
                        onClick={() => handleSubmitWaiverClaim()}
                        disabled={isLoading || !selectedPlayer}
                        className="mt-4 px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-md disabled:opacity-50 transition-colors shadow-lg"
                    >
                        {isLoading ? 'Submitting...' : 'Submit Waiver Claim'}
                    </button>
                </div>

                <SleeperPlayerList
                    players={availablePlayers}
                    title="Waiver Wire Pool"
                    emptyMessage="No players available on waiver wire."
                    maxHeight="20rem"
                    onPlayerSelect={(player) => handleSubmitWaiverClaim(player.id)}
                    selectLabel="Submit Waiver Claim"
                />

                <div className="bg-emerald-900 p-6 rounded-lg border-2 border-emerald-700">
                    <h3 className="text-2xl font-bold text-purple-400 mb-4">Active Waiver Claims</h3>
                    {activeClaims.length === 0 ? (
                        <p className="text-emerald-400">No active waiver claims.</p>
                    ) : (
                        <div className="space-y-4">
                            {activeClaims.map((claim) => {
                                const player = getPlayerDetails(claim.playerId, allPlayers);
                                const claimants = Array.isArray(claim.claimants) ? claim.claimants : [];
                                const claimantNames = claimants
                                    .map((id) => teamsData.find((t) => t.id === id)?.teamName || id)
                                    .join(', ');

                                return (
                                    <div key={claim.id} className="bg-emerald-800 p-4 rounded-lg border-2 border-emerald-600">
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <h4 className="text-lg font-semibold text-white">{player?.name}</h4>
                                                <p className="text-emerald-300">{player?.position} - {player?.nflTeam}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-yellow-400 font-bold">{claimants.length} claim{claimants.length === 1 ? '' : 's'}</p>
                                            </div>
                                        </div>
                                        <p className="text-sm text-emerald-400 mb-3">
                                            Claimants: {claimantNames || 'None'}
                                        </p>
                                        <div className="flex justify-end gap-2">
                                            {!claimants.includes(currentTeamId) && (
                                                <button
                                                    onClick={() => handleSubmitWaiverClaim(claim.playerId)}
                                                    disabled={isLoading}
                                                    className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md disabled:opacity-50 transition-colors"
                                                >
                                                    Submit Waiver Claim
                                                </button>
                                            )}
                                            {isCommissioner && (
                                                <button
                                                    onClick={() => handleProcessTraditionalClaim(claim.id)}
                                                    disabled={isLoading || claimants.length === 0}
                                                    className="px-6 py-2 bg-purple-800 hover:bg-purple-900 text-white rounded-md disabled:opacity-50 transition-colors"
                                                >
                                                    {isLoading ? 'Processing...' : 'Process Claim'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="p-4 sm:p-6 bg-emerald-950 rounded-lg shadow-xl max-w-6xl mx-auto my-2 sm:my-8 text-white">
            <div className="mb-6">
                <h2 className="text-3xl font-bold text-white mb-2">Waiver Wire</h2>
                <p className="text-emerald-300">League: {currentLeague?.name}</p>
                <p className="text-emerald-300">
                    Waiver Type: {useFaabWaivers ? 'Auction (FAAB)' : 'Traditional Priority'}
                </p>
                <p className="text-emerald-300">
                    {useFaabWaivers 
                        ? 'Auction-style waivers with 24-hour bidding periods'
                        : 'Priority-based waivers determined by record'
                    }
                </p>
            </div>

            {useFaabWaivers ? renderAuctionWaivers() : renderPriorityWaivers()}
        </div>
    );
};
