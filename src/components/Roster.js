import React, { useState, useEffect, useRef } from 'react';
import { useFirebase } from '../contexts/FirebaseContext.js';
import { Avatar } from './Avatar.js';
import { getPlayerDetails, getAvailablePlayers, formatProjectedPoints, getPlayerRank } from '../utils/helpers.js';
import { useAutoSetLineup } from '../hooks/useAutoSetLineup.js';
import { AutoSetLineupToggle } from './AutoSetLineupToggle.js';
import {
    getCachedWeekProjections,
    getWeeklyProjectedPoints,
} from '../utils/backgroundScoring.js';
import {
    buildLineupDisplayOrder,
    INITIAL_ROSTER_LIMITS,
    isDefensivePlayerPosition,
    isTeamDefensePosition,
    formatPlayerLabel,
    isFaabWaiver,
    formatLineupSlotLabel,
    isPlayerSalaryEnabled,
} from '../constants/leagueDefaults.js';

const firebase = window.firebase;

const playerInitials = (name = '') => {
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
};

const formatWeekProj = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0.0';
    return n.toFixed(1);
};

const RosterPlayerSlot = ({
    slotLabel,
    slotLabelClassName = 'text-purple-300',
    player,
    leagueSettings = {},
    weekProjection = 0,
    projectionWeek = null,
    actions = null,
}) => {
    const showSalary = player && isPlayerSalaryEnabled(leagueSettings);
    const projLabel = projectionWeek != null ? `Week ${projectionWeek} Proj` : 'Week Proj';

    if (!player) {
        return (
            <>
                <div className="md:hidden bg-emerald-800/70 border border-emerald-700 rounded-lg p-4">
                    <p className={`text-xs font-bold uppercase tracking-wide mb-2 ${slotLabelClassName}`}>{slotLabel}</p>
                    <p className="text-emerald-400 text-sm">-- Empty --</p>
                </div>
                <div className="hidden md:flex bg-emerald-800 p-3 rounded-md items-center justify-between min-h-[50px]">
                    <div className="flex items-center gap-4 truncate">
                        <span className={`font-bold w-20 flex-shrink-0 ${slotLabelClassName}`}>{slotLabel}</span>
                        <span className="text-emerald-400">-- Empty --</span>
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            {/* Mobile stacked card */}
            <div className="md:hidden bg-emerald-800 border border-emerald-700 rounded-lg p-4 space-y-3">
                <div className="flex items-start gap-3">
                    <div className="h-12 w-12 rounded-full bg-emerald-950 border-2 border-emerald-600 flex items-center justify-center text-sm font-bold text-emerald-100 flex-shrink-0">
                        {playerInitials(player.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className={`text-xs font-bold uppercase tracking-wide mb-1 ${slotLabelClassName}`}>{slotLabel}</p>
                        <h4 className="text-base font-semibold text-white leading-snug break-words">{player.name}</h4>
                        <p className="text-sm text-emerald-300 mt-0.5">
                            {player.position}
                            {player.nflTeam ? ` · ${player.nflTeam}` : ''}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-emerald-950/50 rounded-md px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-emerald-400">Position</p>
                        <p className="text-sm font-semibold text-white">{player.position || '—'}</p>
                    </div>
                    <div className="bg-emerald-950/50 rounded-md px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-emerald-400">NFL Team</p>
                        <p className="text-sm font-semibold text-white">{player.nflTeam || '—'}</p>
                    </div>
                    <div className="bg-emerald-950/50 rounded-md px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-emerald-400">{projLabel}</p>
                        <p className="text-sm font-semibold text-yellow-300 tabular-nums">
                            {formatWeekProj(weekProjection)}
                        </p>
                    </div>
                    {showSalary && (
                        <div className="bg-emerald-950/50 rounded-md px-3 py-2">
                            <p className="text-[11px] uppercase tracking-wide text-emerald-400">Salary</p>
                            <p className="text-sm font-semibold text-yellow-300">${player.salary ?? 0}</p>
                        </div>
                    )}
                    {player.fantasyPoints != null && (
                        <div className="bg-emerald-950/50 rounded-md px-3 py-2">
                            <p className="text-[11px] uppercase tracking-wide text-emerald-400">FP</p>
                            <p className="text-sm font-semibold text-green-300">
                                {Number(player.fantasyPoints).toFixed(1)}
                            </p>
                        </div>
                    )}
                </div>

                {actions && (
                    <div className="flex flex-wrap gap-2 pt-1 border-t border-emerald-700">
                        {actions}
                    </div>
                )}
            </div>

            {/* Desktop row layout */}
            <div className="hidden md:flex bg-emerald-800 p-3 rounded-md items-center justify-between min-h-[50px] gap-3">
                <div className="flex items-center gap-4 truncate min-w-0 flex-1">
                    <span className={`font-bold w-20 flex-shrink-0 ${slotLabelClassName}`}>{slotLabel}</span>
                    <div className="h-8 w-8 rounded-full bg-emerald-950 border border-emerald-600 flex items-center justify-center text-xs font-bold text-emerald-100 flex-shrink-0">
                        {playerInitials(player.name)}
                    </div>
                    <span className="truncate">{formatPlayerLabel(player, leagueSettings)}</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right min-w-[4.5rem]">
                        <p className="text-[10px] uppercase tracking-wide text-emerald-400 leading-none">{projLabel}</p>
                        <p className="text-sm font-semibold text-yellow-300 tabular-nums">
                            {formatWeekProj(weekProjection)}
                        </p>
                    </div>
                    {actions && (
                        <div className="flex items-center gap-2">
                            {actions}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export const Roster = ({ teamData, allPlayers, showMessage, currentLeague, handleLeaveLeague, onPlayerTransaction, currentTeamId }) => {
    const { db } = useFirebase();
    const [newTeamName, setNewTeamName] = useState(teamData.teamName || '');
    const [isSavingTeamName, setIsSavingTeamName] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [bidAmount, setBidAmount] = useState(1);
    const [waiverPosition, setWaiverPosition] = useState(1);
    const [weekProjectionsByPlayer, setWeekProjectionsByPlayer] = useState({});
    const [projectionWeek, setProjectionWeek] = useState(null);
    const playerSelectRef = useRef(null);
    const rosterLimits = currentLeague?.settings?.rosterLimits || INITIAL_ROSTER_LIMITS;
    const leagueSettings = currentLeague?.settings || {};
    const scoringRules = leagueSettings.scoringRules || {};
    const lineupDisplayOrder = buildLineupDisplayOrder(currentLeague?.settings?.startingSlots);
    const isAuctionComplete = currentLeague?.auction?.status === 'complete';
    const useFaabWaivers = isFaabWaiver(leagueSettings);
    const { setEnabled: setAutoSetLineupEnabled, isSaving: isAutoSetSaving } = useAutoSetLineup({
        leagueId: currentLeague?.id,
        teamId: teamData?.id || currentTeamId,
        allPlayers,
        rosterLimits,
        slotOrder: lineupDisplayOrder,
        enabled: teamData?.autoSetLineupEnabled === true,
        showMessage,
    });

    useEffect(() => {
        setNewTeamName(teamData.teamName || '');
    }, [teamData.teamName]);

    useEffect(() => {
        let cancelled = false;

        const loadWeekProjections = async () => {
            try {
                const { weekContext, projectionsByPlayer } = await getCachedWeekProjections();
                if (cancelled) return;
                setWeekProjectionsByPlayer(projectionsByPlayer || {});
                setProjectionWeek(weekContext?.displayWeek ?? weekContext?.week ?? null);
            } catch (error) {
                console.error('Error loading weekly projections for roster:', error);
                if (!cancelled) {
                    setWeekProjectionsByPlayer({});
                    setProjectionWeek(null);
                }
            }
        };

        loadWeekProjections();
        return () => {
            cancelled = true;
        };
    }, [currentLeague?.id]);

    const resolveWeekProjection = (playerId) => (
        getWeeklyProjectedPoints(playerId, weekProjectionsByPlayer, scoringRules)
    );

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
                waiverType: 'auction',
                bids: {
                    [currentTeamId]: Number(bidAmount)
                },
                highestBid: Number(bidAmount),
                highestBidder: currentTeamId,
                waiverPosition: Number(waiverPosition),
                expiration: firebase.firestore.Timestamp.fromDate(expiration),
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'active',
            });

            showMessage(`You have placed a bid of $${bidAmount} on ${getPlayerDetails(playerId, allPlayers).name} with waiver position ${waiverPosition}. The 24-hour auction has started.`, "success");
            setBidAmount(1);
            setWaiverPosition(1);

        } catch (error) {
            showMessage("Error placing waiver bid.", "error");
            console.error("Waiver bid error:", error);
        }
    };

    const handleSubmitWaiverClaim = async () => {
        const playerId = playerSelectRef.current?.value;
        if (!playerId) return showMessage("Please select a player.", "error");

        const waiverRef = db.collection(`leagues/${currentLeague.id}/waivers`).doc(playerId);

        try {
            const waiverDoc = await waiverRef.get();
            if (waiverDoc.exists) {
                const data = waiverDoc.data();
                const claimants = Array.isArray(data.claimants) ? data.claimants : [];
                if (claimants.includes(currentTeamId)) {
                    return showMessage("You already have a claim on this player.", "error");
                }
                if (data.waiverType === 'auction' || data.bids) {
                    return showMessage("This player is on an auction waiver. Go to the Waiver Wire tab.", "error");
                }
                await waiverRef.update({
                    claimants: firebase.firestore.FieldValue.arrayUnion(currentTeamId),
                });
                showMessage(`Waiver claim submitted for ${getPlayerDetails(playerId, allPlayers).name}.`, "success");
                return;
            }

            await waiverRef.set({
                playerId,
                waiverType: 'traditional',
                claimants: [currentTeamId],
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'active',
            });

            showMessage(`Waiver claim submitted for ${getPlayerDetails(playerId, allPlayers).name}.`, "success");
        } catch (error) {
            showMessage("Error submitting waiver claim.", "error");
            console.error("Waiver claim error:", error);
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

        if (from === 'bench') newRoster.bench = newRoster.bench.filter(pId => pId !== playerId);
        else if (from === 'ir') newRoster.ir = newRoster.ir.filter(pId => pId !== playerId);
        else newRoster.lineup[from] = null;

        if (to === 'bench') newRoster.bench.push(playerId);
        else if (to === 'ir') newRoster.ir.push(playerId);
        else newRoster.lineup[to] = playerId;

        try {
            const teamDocRef = db.doc(`leagues/${currentLeague.id}/teams/${teamData.id}`);
            await teamDocRef.update({ roster: newRoster });
            showMessage("Roster updated.", "success");
        } catch (error) {
            showMessage("Failed to update roster.", "error");
        }
    };

    const getEligibleSlotsForPlayer = (playerId) => {
        const playerDetails = getPlayerDetails(playerId, allPlayers);
        if (!playerDetails) return [];

        const pos = playerDetails.position;
        const emptySlots = Object.keys(teamData.roster.lineup).filter(slot => teamData.roster.lineup[slot] === null);

        return emptySlots.filter(slotKey => {
            const slotPosition = slotKey.replace(/[0-9]/g, '');
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
                    <button onClick={() => setShowDropdown(!showDropdown)} className="px-3 py-2 md:py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-md touch-target">Start</button>
                    {showDropdown && (
                        <div className="absolute left-0 md:left-auto md:right-0 mt-2 w-48 bg-emerald-800 rounded-md shadow-lg z-10 border border-emerald-600">
                            {eligibleSlots.map(slot => (
                                <a
                                    key={slot}
                                    href="#"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        handleMovePlayer(playerId, from.toLowerCase(), slot);
                                        setShowDropdown(false);
                                    }}
                                    className="block px-4 py-2 text-sm text-emerald-200 hover:bg-purple-600"
                                >
                                    Move to {formatLineupSlotLabel(slot)}
                                </a>
                            ))}
                        </div>
                    )}
                </div>
            );
        }

        return (
            <button
                onClick={() => handleMovePlayer(playerId, from, 'bench')}
                className="px-3 py-2 md:py-1 bg-yellow-600 hover:bg-yellow-700 text-white text-sm rounded-md touch-target"
            >
                Bench
            </button>
        );
    };

    const dropButton = (playerId) => (
        <button
            onClick={() => handleRemovePlayer(playerId)}
            className="px-3 py-2 md:py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded-md touch-target"
        >
            Drop
        </button>
    );

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
                    <div className="flex flex-col gap-3 mb-4">
                        <h3 className="text-2xl font-bold text-purple-400">Starting Lineup</h3>
                        <AutoSetLineupToggle
                            enabled={teamData?.autoSetLineupEnabled === true}
                            disabled={isAutoSetSaving}
                            onChange={setAutoSetLineupEnabled}
                        />
                    </div>
                    <div className="space-y-3 md:space-y-2">
                        {lineupDisplayOrder.map(slot => {
                            const playerId = teamData.roster?.lineup?.[slot] || null;
                            const player = playerId ? getPlayerDetails(playerId, allPlayers) : null;
                            return (
                                <RosterPlayerSlot
                                    key={slot}
                                    slotLabel={formatLineupSlotLabel(slot)}
                                    player={player}
                                    leagueSettings={leagueSettings}
                                    weekProjection={resolveWeekProjection(playerId)}
                                    projectionWeek={projectionWeek}
                                    actions={player ? (
                                        <>
                                            <PlayerActions playerId={playerId} from={slot} />
                                            {dropButton(playerId)}
                                        </>
                                    ) : null}
                                />
                            );
                        })}
                    </div>
                </div>
                <div className="space-y-6">
                    <div>
                        <h3 className="text-2xl font-bold text-purple-400 mb-4">Bench</h3>
                        <div className="space-y-3 md:space-y-2">
                            {Array.from({ length: rosterLimits.Bench }).map((_, index) => {
                                const playerId = Array.isArray(teamData.roster?.bench) ? teamData.roster.bench[index] : null;
                                const player = playerId ? getPlayerDetails(playerId, allPlayers) : null;
                                return (
                                    <RosterPlayerSlot
                                        key={`bench-${index}`}
                                        slotLabel={`Bench ${index + 1}`}
                                        player={player}
                                        leagueSettings={leagueSettings}
                                        weekProjection={resolveWeekProjection(playerId)}
                                        projectionWeek={projectionWeek}
                                        actions={player ? (
                                            <>
                                                <PlayerActions playerId={playerId} from="bench" />
                                                {dropButton(playerId)}
                                            </>
                                        ) : null}
                                    />
                                );
                            })}
                        </div>
                    </div>
                    <div>
                        <h3 className="text-2xl font-bold text-red-400 mb-4">Injured Reserve</h3>
                        <div className="space-y-3 md:space-y-2">
                            {Array.from({ length: rosterLimits.IR }).map((_, index) => {
                                const playerId = Array.isArray(teamData.roster?.ir) ? teamData.roster.ir[index] : null;
                                const player = playerId ? getPlayerDetails(playerId, allPlayers) : null;
                                return (
                                    <RosterPlayerSlot
                                        key={`ir-${index}`}
                                        slotLabel={`IR ${index + 1}`}
                                        slotLabelClassName="text-red-300"
                                        player={player}
                                        leagueSettings={leagueSettings}
                                        weekProjection={resolveWeekProjection(playerId)}
                                        projectionWeek={projectionWeek}
                                        actions={player ? (
                                            <>
                                                <PlayerActions playerId={playerId} from="ir" />
                                                {dropButton(playerId)}
                                            </>
                                        ) : null}
                                    />
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-8 p-4 sm:p-6 bg-emerald-900 rounded-lg shadow-inner">
                <h3 className="text-xl font-semibold text-white mb-4">Claim Player from Free Agency (Waiver Wire)</h3>
                <div className={`grid grid-cols-1 ${useFaabWaivers ? 'md:grid-cols-4' : 'md:grid-cols-2'} gap-4`}>
                    <label className={`block ${useFaabWaivers ? 'col-span-full md:col-span-2' : 'col-span-full md:col-span-1'}`}>
                        <span className="text-emerald-300">Select Player:</span>
                        <select id="player-select" ref={playerSelectRef} className="w-full p-2 rounded-md bg-emerald-800 text-white border border-emerald-600 focus:ring-purple-500 focus:border-purple-500">
                            <option value="">Select a player...</option>
                            {availablePlayers.length > 0 ? (
                                availablePlayers.map(player => (
                                    <option key={player.id} value={player.id}>
                                        #{getPlayerRank(player) ?? '—'} {player.name} ({player.position} - {player.nflTeam}) · Proj {formatProjectedPoints(player)}
                                    </option>
                                ))
                            ) : (
                                <option disabled>No players available</option>
                            )}
                        </select>
                    </label>
                    {useFaabWaivers ? (
                        <>
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
                        </>
                    ) : (
                        <button
                            onClick={handleSubmitWaiverClaim}
                            className="col-span-full md:col-span-1 px-6 py-3 bg-purple-800 hover:bg-purple-900 text-white font-bold rounded-md shadow-lg transition duration-200"
                        >
                            Submit Waiver Claim
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
