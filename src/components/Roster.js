import React, { useState, useEffect, useRef } from 'react';
import { useFirebase } from '../contexts/FirebaseContext.js';
import { Avatar } from './Avatar.js';
import { getPlayerDetails, getAvailablePlayers } from '../utils/helpers.js';
import { buildLineupDisplayOrder, INITIAL_ROSTER_LIMITS, isDefensivePlayerPosition, isTeamDefensePosition } from '../constants/leagueDefaults.js';
import { appId } from '../config/firebase.js';

export const Roster = ({ teamData, allPlayers, showMessage, currentLeague, handleLeaveLeague, onPlayerTransaction, currentTeamId }) => {
    const { db } = useFirebase();
    const [newTeamName, setNewTeamName] = useState(teamData.teamName || '');
    const [isSavingTeamName, setIsSavingTeamName] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [bidAmount, setBidAmount] = useState(1);
    const [waiverPosition, setWaiverPosition] = useState(1);
    const playerSelectRef = useRef(null);
    const rosterLimits = currentLeague?.settings?.rosterLimits || INITIAL_ROSTER_LIMITS;
    const lineupDisplayOrder = buildLineupDisplayOrder(currentLeague?.settings?.startingSlots);
    const isAuctionComplete = currentLeague?.auction?.status === 'complete';

    useEffect(() => {
        setNewTeamName(teamData.teamName || '');
    }, [teamData.teamName]);

    const handleUpdateTeamName = async () => {
        if (!db || !teamData?.id || !newTeamName.trim()) return showMessage("Team name cannot be empty.", "error");
        
        setIsSavingTeamName(true);
        const teamDocRef = db.doc(`leagues/${currentLeague.id}/teams/${teamData.id}`);
        try {
            await teamDocRef.update({ teamName: newTeamName.trim() });
            showMessage("Team name updated successfully!", "success");
        } catch (error) {
            showMessage("Failed to update team name.", "error");
        } finally {
            setIsSavingTeamName(false);
        }
    };

    const handlePlaceWaiverBid = async () => {
        if (!isAuctionComplete) {
            return showMessage("You cannot add free agents until the auction is complete.", "error");
        }
        const playerId = playerSelectRef.current.value;
        if (!playerId) return showMessage("Please select a player.", "error");
        if (bidAmount <= 0) return showMessage("Bid must be greater than zero.", "error");
        if (waiverPosition < 1 || waiverPosition > 12) return showMessage("Waiver position must be between 1 and 12.", "error");

        const waiverRef = db.collection(`leagues/${currentLeague.id}/waivers`).doc(playerId);

        try {
            const waiverDoc = await waiverRef.get();
            if (waiverDoc.exists) {
                return showMessage("This player is already on the waiver wire. Go to the Waiver Wire tab to bid.", "error");
            }

            const expiration = new Date();
            expiration.setHours(expiration.getHours() + 24);

            await waiverRef.set({
                playerId: playerId,
                bids: {
                    [currentTeamId]: Number(bidAmount)
                },
                highestBid: Number(bidAmount),
                highestBidder: currentTeamId,
                waiverPosition: Number(waiverPosition),
                expiration: db.Timestamp.fromDate(expiration)
            });

            showMessage(`You have placed a bid of $${bidAmount} on ${getPlayerDetails(playerId, allPlayers).name} with waiver position ${waiverPosition}. The 24-hour auction has started.`, "success");
            setBidAmount(1);
            setWaiverPosition(1);

        } catch (error) {
            showMessage("Error placing waiver bid.", "error");
            console.error("Waiver bid error:", error);
        }
    };

    const handleRemovePlayer = async (playerId) => {
        if (!db || !teamData?.id) return;
        const playerToRemove = getPlayerDetails(playerId, allPlayers);
        if (!playerToRemove) return showMessage("Player not found.", "error");
        
        try {
            const batch = db.batch();
            const teamDocRef = db.doc(`leagues/${currentLeague.id}/teams/${teamData.id}`);
            
            const newRoster = JSON.parse(JSON.stringify(teamData.roster));
            Object.keys(newRoster.lineup).forEach(slot => {
                if (newRoster.lineup[slot] === playerId) {
                    newRoster.lineup[slot] = null;
                }
            });
            newRoster.bench = newRoster.bench.filter(pId => pId !== playerId);
            newRoster.ir = newRoster.ir.filter(pId => pId !== playerId);

            batch.update(teamDocRef, { roster: newRoster });

            if (currentLeague && currentLeague.id) {
                const leagueDocRef = db.doc(`leagues/${currentLeague.id}`);
                batch.update(leagueDocRef, {
                    allRosteredPlayerIds: firebase.firestore.FieldValue.arrayRemove(playerId)
                });
            }

            await batch.commit();
            showMessage(`${playerToRemove.name} dropped from your roster.`, "success");
            onPlayerTransaction();
        } catch (error) {
            showMessage("Error dropping player.", "error");
            console.error("Error dropping player:", error);
        }
    };

    const handleMovePlayer = async (playerId, from, to) => {
        const newRoster = JSON.parse(JSON.stringify(teamData.roster));

        // Remove player from original spot
        if (from === 'bench') newRoster.bench = newRoster.bench.filter(pId => pId !== playerId);
        else if (from === 'ir') newRoster.ir = newRoster.ir.filter(pId => pId !== playerId);
        else newRoster.lineup[from] = null;

        // Add player to new spot
        if (to === 'bench') newRoster.bench.push(playerId);
        else if (to === 'ir') newRoster.ir.push(playerId);
        else newRoster.lineup[to] = playerId;

        try {
            const teamDocRef = db.doc(`leagues/${currentLeague.id}/teams/${teamData.id}`);
            await teamDocRef.update({ roster: newRoster });
            showMessage("Roster updated.", "success");
        } catch(error) {
            showMessage("Failed to update roster.", "error");
        }
    };

    const getEligibleSlotsForPlayer = (playerId) => {
        const playerDetails = getPlayerDetails(playerId, allPlayers);
        if (!playerDetails) return [];

        const pos = playerDetails.position;
        const emptySlots = Object.keys(teamData.roster.lineup).filter(slot => teamData.roster.lineup[slot] === null);
        
        return emptySlots.filter(slotKey => {
            const slotPosition = slotKey.replace(/[0-9]/g, ''); // "RB1" -> "RB"
            if (slotPosition === pos) return true;
            if (slotPosition === 'Flex' && ['RB', 'WR', 'TE'].includes(pos)) return true;
            if (slotPosition === 'DFlex' && isDefensivePlayerPosition(pos)) return true;
            if (slotPosition === 'DST' && isTeamDefensePosition(pos)) return true;
            return false;
        });
    };

    const availablePlayers = getAvailablePlayers(currentLeague ? currentLeague.allRosteredPlayerIds : [], allPlayers)
                                             .filter(player => player.name.toLowerCase().includes(searchQuery.toLowerCase()));

    const PlayerActions = ({ playerId, from }) => {
        const [showDropdown, setShowDropdown] = useState(false);
        const eligibleSlots = getEligibleSlotsForPlayer(playerId);

        if (from === 'bench' || from === 'ir') {
            if (eligibleSlots.length === 0) {
                return <span className="text-xs text-gray-500">No open slots</span>;
            }
            return (
                <div className="relative">
                    <button onClick={() => setShowDropdown(!showDropdown)} className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-md">Start</button>
                    {showDropdown && (
                        <div className="absolute right-0 mt-2 w-48 bg-emerald-800 rounded-md shadow-lg z-10">
                            {eligibleSlots.map(slot => (
                                <a key={slot} href="#" onClick={() => { handleMovePlayer(playerId, from.toLowerCase(), slot); setShowDropdown(false); }} className="block px-4 py-2 text-sm text-emerald-200 hover:bg-purple-600">
                                    Move to {slot.replace(/(\d+)/, ' $1')}
                                </a>
                            ))}
                        </div>
                    )}
                </div>
            );
        } else { // It's a lineup slot
            return <button onClick={() => handleMovePlayer(playerId, from, 'bench')} className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white text-sm rounded-md">Bench</button>;
        }
    };
    
    return (
        <div className="p-4 sm:p-6 bg-emerald-950 rounded-lg shadow-xl max-w-7xl mx-auto my-2 sm:my-8 text-white">
            <div className="flex flex-col sm:flex-row items-center gap-6 mb-6">
                <Avatar
                    docRefPath={`leagues/${currentLeague.id}/teams/${teamData.id}`}
                    storagePath={`team-avatars/${teamData.id}`}
                    currentAvatarUrl={teamData.avatarUrl}
                    showMessage={showMessage}
                    size="h-24 w-24"
                />
                <div className="flex-grow w-full">
                    <h2 className="text-3xl font-bold text-white mb-2 text-center sm:text-left">Your Roster</h2>
                                            <div className="p-4 bg-emerald-900 rounded-lg shadow-inner flex flex-col sm:flex-row items-center justify-between gap-4">
                        <label className="block flex-grow w-full">
                            <span className="text-emerald-300 text-lg font-semibold">Team Name:</span>
                            <input type="text" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} className="w-full p-2 rounded-md bg-emerald-800 text-white border border-emerald-600 focus:ring-purple-500 focus:border-purple-500 mt-1" />
                        </label>
                        <button onClick={handleUpdateTeamName} disabled={isSavingTeamName} className="w-full sm:w-auto px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-md shadow-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
                            {isSavingTeamName ? 'Saving...' : 'Save Name'}
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-8">
                <div>
                     <h3 className="text-2xl font-bold text-purple-400 mb-4">Starting Lineup</h3>
                     <div className="space-y-2">
                        {lineupDisplayOrder.map(slot => {
                            const playerId = teamData.roster?.lineup?.[slot] || null;
                            const player = playerId ? getPlayerDetails(playerId, allPlayers) : null;
                            return (
                                <div key={slot} className="bg-emerald-800 p-3 rounded-md flex items-center justify-between">
                                    <div className="flex items-center gap-4 truncate">
                                        <span className="font-bold text-purple-300 w-16 flex-shrink-0">{slot.replace(/(\d+)/, ' $1')}</span>
                                        {player ? (
                                             <span className="truncate">{player.name} ({player.position}) - ${player.salary}</span>
                                        ) : (
                                            <span className="text-emerald-400">-- Empty --</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        {player && <PlayerActions playerId={playerId} from={slot} />}
                                        {player && <button onClick={() => handleRemovePlayer(playerId)} className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded-md">Drop</button>}
                                    </div>
                                </div>
                            );
                        })}
                     </div>
                </div>
                <div className="space-y-6">
                    <div>
                        <h3 className="text-2xl font-bold text-purple-400 mb-4">Bench</h3>
                        <div className="space-y-2">
                            {Array.from({ length: rosterLimits.Bench }).map((_, index) => {
                                const playerId = Array.isArray(teamData.roster?.bench) ? teamData.roster.bench[index] : null;
                                const player = playerId ? getPlayerDetails(playerId, allPlayers) : null;
                                return (
                                    <div key={`bench-${index}`} className="bg-emerald-800 p-3 rounded-md flex items-center justify-between h-[50px]">
                                        <div className="flex items-center gap-4 truncate">
                                            <span className="font-bold text-purple-300 w-20 flex-shrink-0">{`Bench ${index + 1}`}</span>
                                            {player ? (
                                                <span className="truncate">{player.name} ({player.position}) - ${player.salary}</span>
                                            ) : (
                                                <span className="text-emerald-400">-- Empty --</span>
                                            )}
                                        </div>
                                        {player && (
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                               <PlayerActions playerId={playerId} from="bench" />
                                               <button onClick={() => handleRemovePlayer(playerId)} className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded-md">Drop</button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                     <div>
                        <h3 className="text-2xl font-bold text-red-400 mb-4">Injured Reserve</h3>
                         <div className="space-y-2">
                            {Array.from({ length: rosterLimits.IR }).map((_, index) => {
                                const playerId = Array.isArray(teamData.roster?.ir) ? teamData.roster.ir[index] : null;
                                const player = playerId ? getPlayerDetails(playerId, allPlayers) : null;
                                return (
                                    <div key={`ir-${index}`} className="bg-emerald-800 p-3 rounded-md flex items-center justify-between h-[50px]">
                                        <div className="flex items-center gap-4 truncate">
                                            <span className="font-bold text-red-300 w-20 flex-shrink-0">{`IR ${index + 1}`}</span>
                                            {player ? (
                                                <span className="truncate">{player.name} ({player.position}) - ${player.salary}</span>
                                            ) : (
                                                <span className="text-emerald-400">-- Empty --</span>
                                            )}
                                        </div>
                                        {player && (
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                               <PlayerActions playerId={playerId} from="ir" />
                                               <button onClick={() => handleRemovePlayer(playerId)} className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded-md">Drop</button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
            
            <div className="mt-8 p-4 sm:p-6 bg-emerald-900 rounded-lg shadow-inner">
                <h3 className="text-xl font-semibold text-white mb-4">Claim Player from Free Agency (Waiver Wire)</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <label className="block col-span-full md:col-span-2">
                        <span className="text-emerald-300">Select Player:</span>
                        <select id="player-select" ref={playerSelectRef} className="w-full p-2 rounded-md bg-emerald-800 text-white border border-emerald-600 focus:ring-purple-500 focus:border-purple-500">
                            <option value="">Select a player...</option>
                            {availablePlayers.length > 0 ? (
                                availablePlayers.map(player => (
                                    <option key={player.id} value={player.id}>{player.name} ({player.position} - {player.nflTeam})</option>
                                ))
                            ) : (
                                <option disabled>No players available</option>
                            )}
                        </select>
                    </label>
                    <label className="block">
                        <span className="text-emerald-300">Waiver Position</span>
                        <input type="number" min="1" max="12" value={waiverPosition} onChange={e => setWaiverPosition(e.target.value)} className="w-full p-2 rounded-md bg-emerald-800 text-white border border-emerald-600" />
                    </label>
                    <label className="block">
                        <span className="text-emerald-300">Bid Amount ($)</span>
                        <input type="number" step="0.5" min="0.5" value={bidAmount} onChange={e => setBidAmount(e.target.value)} className="w-full p-2 rounded-md bg-emerald-800 text-white border border-emerald-600" />
                    </label>
                    <button 
                        onClick={handlePlaceWaiverBid} 
                        className="col-span-full px-6 py-3 bg-purple-800 hover:bg-purple-900 text-white font-bold rounded-md shadow-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={!isAuctionComplete}
                    >
                        {isAuctionComplete ? 'Place Bid & Start Auction' : 'Auction Not Complete'}
                    </button>
                </div>
            </div>
        </div>
    );
}; 