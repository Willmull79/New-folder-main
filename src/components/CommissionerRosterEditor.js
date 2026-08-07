import React, { useMemo, useState } from 'react';
import { useFirebase } from '../contexts/FirebaseContext.js';
import { ConfirmationModal } from './ConfirmationModal.js';
import { ClickablePlayerName } from './ClickablePlayerName.js';
import { usePlayerScheduleModal } from '../hooks/usePlayerScheduleModal.js';
import { getPlayerDetails, getAvailablePlayers } from '../utils/helpers.js';
import {
    buildLineupDisplayOrder,
    formatLineupSlotLabel,
    formatPlayerLabel,
    INITIAL_ROSTER_LIMITS,
} from '../constants/leagueDefaults.js';

const firebase = window.firebase;

/**
 * Commissioner tool to manually add/drop players on any team's roster.
 */
export const CommissionerRosterEditor = ({ currentLeague, teamsData = [], allPlayers = [], showMessage }) => {
    const { db } = useFirebase();
    const [selectedTeamId, setSelectedTeamId] = useState('');
    const [playerToAdd, setPlayerToAdd] = useState('');
    const [addDestination, setAddDestination] = useState('bench');
    const [searchQuery, setSearchQuery] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [playerIdPendingDrop, setPlayerIdPendingDrop] = useState(null);
    const { openSchedule, scheduleModal } = usePlayerScheduleModal();

    const leagueSettings = currentLeague?.settings || {};
    const rosterLimits = leagueSettings.rosterLimits || INITIAL_ROSTER_LIMITS;
    const lineupDisplayOrder = buildLineupDisplayOrder(leagueSettings.startingSlots);

    const selectedTeam = useMemo(
        () => teamsData.find((t) => t.id === selectedTeamId) || null,
        [teamsData, selectedTeamId]
    );

    const roster = selectedTeam?.roster || { lineup: {}, bench: [], ir: [] };

    const availablePlayers = useMemo(() => {
        const freeAgents = getAvailablePlayers(currentLeague?.allRosteredPlayerIds || [], allPlayers);
        const q = searchQuery.trim().toLowerCase();
        if (!q) return freeAgents.slice(0, 200);
        return freeAgents
            .filter((p) => (p.name || '').toLowerCase().includes(q)
                || (p.position || '').toLowerCase().includes(q)
                || (p.nflTeam || '').toLowerCase().includes(q))
            .slice(0, 200);
    }, [allPlayers, currentLeague?.allRosteredPlayerIds, searchQuery]);

    const emptyLineupSlots = useMemo(() => {
        const lineup = roster.lineup || {};
        return lineupDisplayOrder.filter((slot) => !lineup[slot]);
    }, [roster.lineup, lineupDisplayOrder]);

    const cloneRoster = (source) => {
        const next = JSON.parse(JSON.stringify(source || { lineup: {}, bench: [], ir: [] }));
        if (!next.lineup || typeof next.lineup !== 'object') next.lineup = {};
        if (!Array.isArray(next.bench)) next.bench = [];
        if (!Array.isArray(next.ir)) next.ir = [];
        return next;
    };

    const handleDropPlayer = async (playerId) => {
        if (!db || !currentLeague?.id || !selectedTeam?.id || !playerId) return;

        const player = getPlayerDetails(playerId, allPlayers);
        setIsSaving(true);
        try {
            const batch = db.batch();
            const teamRef = db.doc(`leagues/${currentLeague.id}/teams/${selectedTeam.id}`);
            const newRoster = cloneRoster(selectedTeam.roster);

            Object.keys(newRoster.lineup).forEach((slot) => {
                if (newRoster.lineup[slot] === playerId) {
                    newRoster.lineup[slot] = null;
                }
            });
            newRoster.bench = newRoster.bench.filter((id) => id !== playerId);
            newRoster.ir = newRoster.ir.filter((id) => id !== playerId);

            batch.update(teamRef, { roster: newRoster });
            batch.update(db.doc(`leagues/${currentLeague.id}`), {
                allRosteredPlayerIds: firebase.firestore.FieldValue.arrayRemove(playerId),
            });
            await batch.commit();
            showMessage(
                `${player?.name || 'Player'} removed from ${selectedTeam.teamName}.`,
                'success'
            );
        } catch (error) {
            console.error('Commissioner drop player error:', error);
            showMessage(error?.message || 'Failed to remove player.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const requestDropPlayer = (playerId) => {
        if (!playerId || isSaving) return;
        setPlayerIdPendingDrop(playerId);
    };

    const confirmDropPlayer = async () => {
        const playerId = playerIdPendingDrop;
        setPlayerIdPendingDrop(null);
        if (!playerId) return;
        await handleDropPlayer(playerId);
    };

    const cancelDropPlayer = () => {
        setPlayerIdPendingDrop(null);
    };

    const playerPendingDrop = playerIdPendingDrop
        ? getPlayerDetails(playerIdPendingDrop, allPlayers)
        : null;

    const handleAddPlayer = async () => {
        if (!db || !currentLeague?.id || !selectedTeam?.id) return;
        if (!playerToAdd) {
            return showMessage('Select a free agent to add.', 'error');
        }

        const player = getPlayerDetails(playerToAdd, allPlayers);
        if (!player?.id) {
            return showMessage('Player not found.', 'error');
        }

        const alreadyRostered = (currentLeague.allRosteredPlayerIds || []).includes(playerToAdd);
        if (alreadyRostered) {
            return showMessage('That player is already on a roster in this league.', 'error');
        }

        setIsSaving(true);
        try {
            const batch = db.batch();
            const teamRef = db.doc(`leagues/${currentLeague.id}/teams/${selectedTeam.id}`);
            const newRoster = cloneRoster(selectedTeam.roster);

            if (addDestination === 'bench') {
                const benchLimit = Number(rosterLimits.Bench) || 99;
                if (newRoster.bench.length >= benchLimit) {
                    showMessage(`Bench is full (${benchLimit}).`, 'error');
                    setIsSaving(false);
                    return;
                }
                newRoster.bench.push(playerToAdd);
            } else if (addDestination === 'ir') {
                const irLimit = Number(rosterLimits.IR) || 99;
                if (newRoster.ir.length >= irLimit) {
                    showMessage(`IR is full (${irLimit}).`, 'error');
                    setIsSaving(false);
                    return;
                }
                newRoster.ir.push(playerToAdd);
            } else {
                // Destination is a lineup slot key
                if (newRoster.lineup[addDestination]) {
                    showMessage('That lineup slot is already filled.', 'error');
                    setIsSaving(false);
                    return;
                }
                newRoster.lineup[addDestination] = playerToAdd;
            }

            batch.update(teamRef, { roster: newRoster });
            batch.update(db.doc(`leagues/${currentLeague.id}`), {
                allRosteredPlayerIds: firebase.firestore.FieldValue.arrayUnion(playerToAdd),
            });
            await batch.commit();

            showMessage(
                `${player.name || 'Player'} added to ${selectedTeam.teamName}.`,
                'success'
            );
            setPlayerToAdd('');
            setSearchQuery('');
        } catch (error) {
            console.error('Commissioner add player error:', error);
            showMessage(error?.message || 'Failed to add player.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const renderPlayerRow = (playerId, locationLabel) => {
        if (!playerId) return null;
        const player = getPlayerDetails(playerId, allPlayers);
        return (
            <div
                key={`${locationLabel}-${playerId}`}
                className="flex items-center justify-between gap-3 bg-emerald-950/50 border border-emerald-700 rounded-md px-3 py-2"
            >
                <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wide text-emerald-400">{locationLabel}</p>
                    {player?.name ? (
                        <ClickablePlayerName
                            player={player}
                            onOpenSchedule={openSchedule}
                            className="text-sm font-semibold text-white truncate max-w-full"
                        >
                            {formatPlayerLabel(player, leagueSettings)}
                        </ClickablePlayerName>
                    ) : (
                        <p className="text-sm font-semibold text-white truncate">
                            {`${playerId} (missing player data)`}
                        </p>
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => requestDropPlayer(playerId)}
                    disabled={isSaving}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-md disabled:opacity-50 flex-shrink-0"
                >
                    Drop
                </button>
            </div>
        );
    };

    const inputClass =
        'w-full p-3 mt-1 rounded-md bg-emerald-800 text-white border border-emerald-600 focus:border-purple-500 focus:ring-2 focus:ring-purple-200';

    return (
        <div className="bg-emerald-900 p-6 rounded-lg shadow-lg border-2 border-purple-700 mb-6">
            <h3 className="text-2xl font-bold text-purple-300 mb-2">Edit Team Rosters</h3>
            <p className="text-sm text-emerald-400 mb-4">
                Manually add free agents or drop players from any team. Changes update that team&apos;s roster immediately.
            </p>

            <label className="block mb-4">
                <span className="text-emerald-200 font-medium">Select team</span>
                <select
                    value={selectedTeamId}
                    onChange={(e) => {
                        setSelectedTeamId(e.target.value);
                        setPlayerToAdd('');
                        setAddDestination('bench');
                    }}
                    className={inputClass}
                >
                    <option value="">Choose a team...</option>
                    {[...teamsData]
                        .sort((a, b) => (a.teamName || '').localeCompare(b.teamName || ''))
                        .map((team) => (
                            <option key={team.id} value={team.id}>
                                {team.teamName || team.id}
                            </option>
                        ))}
                </select>
            </label>

            {!selectedTeam ? (
                <p className="text-emerald-400 text-sm">Select a team to view and edit its roster.</p>
            ) : (
                <div className="space-y-6">
                    <div>
                        <h4 className="text-lg font-semibold text-white mb-3">
                            Current roster — {selectedTeam.teamName}
                        </h4>
                        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                            {lineupDisplayOrder.map((slot) => {
                                const playerId = roster.lineup?.[slot];
                                if (!playerId) {
                                    return (
                                        <div
                                            key={slot}
                                            className="px-3 py-2 rounded-md border border-dashed border-emerald-700 text-emerald-500 text-sm"
                                        >
                                            {formatLineupSlotLabel(slot)}: Empty
                                        </div>
                                    );
                                }
                                return renderPlayerRow(playerId, formatLineupSlotLabel(slot));
                            })}
                            {(roster.bench || []).map((playerId, index) =>
                                renderPlayerRow(playerId, `Bench ${index + 1}`)
                            )}
                            {(roster.ir || []).map((playerId, index) =>
                                renderPlayerRow(playerId, `IR ${index + 1}`)
                            )}
                            {!lineupDisplayOrder.some((s) => roster.lineup?.[s])
                                && !(roster.bench || []).length
                                && !(roster.ir || []).length && (
                                <p className="text-emerald-400 text-sm">This roster is empty.</p>
                            )}
                        </div>
                    </div>

                    <div className="border-t border-emerald-700 pt-4 space-y-3">
                        <h4 className="text-lg font-semibold text-white">Add free agent</h4>
                        <label className="block">
                            <span className="text-emerald-200 text-sm font-medium">Search players</span>
                            <input
                                type="search"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Name, position, or NFL team"
                                className={inputClass}
                            />
                        </label>
                        <label className="block">
                            <span className="text-emerald-200 text-sm font-medium">Player</span>
                            <select
                                value={playerToAdd}
                                onChange={(e) => setPlayerToAdd(e.target.value)}
                                className={inputClass}
                            >
                                <option value="">Select a free agent...</option>
                                {availablePlayers.map((player) => (
                                    <option key={player.id} value={player.id}>
                                        {player.name} ({player.position} - {player.nflTeam})
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="block">
                            <span className="text-emerald-200 text-sm font-medium">Add to</span>
                            <select
                                value={addDestination}
                                onChange={(e) => setAddDestination(e.target.value)}
                                className={inputClass}
                            >
                                <option value="bench">Bench</option>
                                <option value="ir">Injured Reserve</option>
                                {emptyLineupSlots.map((slot) => (
                                    <option key={slot} value={slot}>
                                        Lineup: {formatLineupSlotLabel(slot)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <button
                            type="button"
                            onClick={handleAddPlayer}
                            disabled={isSaving || !playerToAdd}
                            className="px-6 py-3 bg-purple-800 hover:bg-purple-900 text-white font-bold rounded-md disabled:opacity-50 transition-colors"
                        >
                            {isSaving ? 'Saving...' : 'Add Player to Team'}
                        </button>
                    </div>
                </div>
            )}

            <ConfirmationModal
                isOpen={Boolean(playerIdPendingDrop)}
                onClose={cancelDropPlayer}
                onConfirm={confirmDropPlayer}
                title="Drop Player?"
                confirmLabel="Yes"
                cancelLabel="No"
            >
                Are you sure you want to drop{' '}
                <span className="font-semibold text-white">
                    {playerPendingDrop?.name || 'this player'}
                </span>
                {selectedTeam?.teamName ? (
                    <>
                        {' '}from <span className="font-semibold text-white">{selectedTeam.teamName}</span>
                    </>
                ) : null}
                ?
            </ConfirmationModal>
            {scheduleModal}
        </div>
    );
};

export default CommissionerRosterEditor;
