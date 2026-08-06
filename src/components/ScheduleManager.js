import React, { useEffect, useMemo, useState } from 'react';
import { useFirebase } from '../contexts/FirebaseContext.js';
import { ConfirmationModal } from './ConfirmationModal.js';
import {
    addMatchupToWeek,
    buildSeasonSchedule,
    createEmptySchedule,
    flipMatchupHomeAway,
    getTeamsScheduledInWeek,
    removeMatchupFromWeek,
    setMatchupTeams,
    swapMatchups,
} from '../utils/scheduleService.js';

/**
 * Commissioner season schedule controls:
 * - Generate round-robin / randomized season
 * - Start blank for fully manual create
 * - Edit matchups, flip home/away, swap games across weeks
 */
export const ScheduleManager = ({
    currentLeague,
    teamsData = [],
    showMessage,
    onLeagueUpdate,
}) => {
    const { db } = useFirebase();
    const [draftSchedule, setDraftSchedule] = useState(null);
    const [selectedWeek, setSelectedWeek] = useState(1);
    const [isSaving, setIsSaving] = useState(false);
    const [showOverwriteModal, setShowOverwriteModal] = useState(false);
    const [pendingGenerate, setPendingGenerate] = useState(null); // 'random' | 'round_robin' | 'manual'
    const [swapSelection, setSwapSelection] = useState(null); // { week, index }
    const [manualHome, setManualHome] = useState('');
    const [manualAway, setManualAway] = useState('');
    const [editIndex, setEditIndex] = useState(null); // matchup index being edited, or null for add

    const numWeeks = Number(currentLeague?.settings?.numWeeks) || 14;
    const teamIds = useMemo(
        () => (teamsData || []).map((team) => team.id).filter(Boolean),
        [teamsData]
    );

    const getTeamName = (teamId) => {
        if (!teamId) return 'BYE';
        return teamsData.find((team) => team.id === teamId)?.teamName || 'Unknown Team';
    };

    useEffect(() => {
        const existing = currentLeague?.schedule || null;
        setDraftSchedule(existing);
        const firstWeek = existing?.weeks?.[0]?.week || 1;
        setSelectedWeek(firstWeek);
        setSwapSelection(null);
        setEditIndex(null);
    }, [currentLeague?.id, currentLeague?.schedule]);

    const weekOptions = useMemo(() => {
        const count = draftSchedule?.weeks?.length || numWeeks;
        return Array.from({ length: count }, (_, i) => i + 1);
    }, [draftSchedule, numWeeks]);

    const currentWeekMatchups = useMemo(() => {
        const week = draftSchedule?.weeks?.find((entry) => Number(entry.week) === Number(selectedWeek));
        return week?.matchups || [];
    }, [draftSchedule, selectedWeek]);

    const teamsUsedThisWeek = useMemo(
        () => getTeamsScheduledInWeek(draftSchedule, selectedWeek, editIndex ?? -1),
        [draftSchedule, selectedWeek, editIndex]
    );

    const availableTeamsForManual = useMemo(
        () => (teamsData || []).filter((team) => !teamsUsedThisWeek.has(String(team.id))),
        [teamsData, teamsUsedThisWeek]
    );

    const requestGenerate = (mode) => {
        if (teamIds.length < 2) {
            return showMessage('Need at least 2 teams to build a schedule.', 'error');
        }
        if (draftSchedule?.weeks?.some((week) => week.matchups?.length)) {
            setPendingGenerate(mode);
            setShowOverwriteModal(true);
            return;
        }
        applyGenerate(mode);
    };

    const applyGenerate = (mode) => {
        let next;
        if (mode === 'manual') {
            next = createEmptySchedule(teamIds, numWeeks);
        } else {
            next = buildSeasonSchedule(teamIds, numWeeks, { randomize: mode === 'random' });
        }
        setDraftSchedule(next);
        setSelectedWeek(1);
        setSwapSelection(null);
        setEditIndex(null);
        setShowOverwriteModal(false);
        setPendingGenerate(null);
        showMessage(
            mode === 'manual'
                ? 'Blank season created — add matchups manually, then save.'
                : mode === 'random'
                    ? 'Randomized season schedule generated — review and save.'
                    : 'Round-robin season schedule generated — review and save.',
            'success'
        );
    };

    const handleSaveSchedule = async () => {
        if (!db || !currentLeague?.id) return;
        if (!draftSchedule?.weeks?.length) {
            return showMessage('Generate or create a schedule before saving.', 'error');
        }

        setIsSaving(true);
        try {
            const payload = {
                ...draftSchedule,
                numWeeks: draftSchedule.weeks.length,
                teamIds,
                updatedAt: new Date().toISOString(),
            };
            await db.doc(`leagues/${currentLeague.id}`).update({ schedule: payload });
            onLeagueUpdate?.({
                ...currentLeague,
                schedule: payload,
            });
            showMessage('Season schedule saved.', 'success');
        } catch (error) {
            console.error('Error saving schedule:', error);
            showMessage(error.message || 'Failed to save schedule.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleClearSchedule = async () => {
        if (!db || !currentLeague?.id) return;
        setIsSaving(true);
        try {
            await db.doc(`leagues/${currentLeague.id}`).update({
                schedule: null,
            });
            setDraftSchedule(null);
            setSwapSelection(null);
            onLeagueUpdate?.({
                ...currentLeague,
                schedule: null,
            });
            showMessage('Season schedule cleared.', 'success');
        } catch (error) {
            console.error('Error clearing schedule:', error);
            showMessage(error.message || 'Failed to clear schedule.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleFlip = (matchupIndex) => {
        setDraftSchedule((prev) => flipMatchupHomeAway(prev, selectedWeek, matchupIndex));
    };

    const handleRemove = (matchupIndex) => {
        setDraftSchedule((prev) => removeMatchupFromWeek(prev, selectedWeek, matchupIndex));
        if (swapSelection?.week === selectedWeek && swapSelection?.index === matchupIndex) {
            setSwapSelection(null);
        }
        if (editIndex === matchupIndex) {
            setEditIndex(null);
            setManualHome('');
            setManualAway('');
        }
    };

    const handleSwapClick = (matchupIndex) => {
        if (!swapSelection) {
            setSwapSelection({ week: selectedWeek, index: matchupIndex });
            showMessage('Select another matchup to swap with.', 'success');
            return;
        }
        if (swapSelection.week === selectedWeek && swapSelection.index === matchupIndex) {
            setSwapSelection(null);
            return;
        }
        setDraftSchedule((prev) => swapMatchups(
            prev,
            swapSelection.week,
            swapSelection.index,
            selectedWeek,
            matchupIndex
        ));
        setSwapSelection(null);
        showMessage('Matchups swapped. Save when ready.', 'success');
    };

    const startEditMatchup = (matchupIndex) => {
        const matchup = currentWeekMatchups[matchupIndex];
        setEditIndex(matchupIndex);
        setManualHome(matchup?.homeTeamId || '');
        setManualAway(matchup?.awayTeamId || '');
        setSwapSelection(null);
    };

    const startAddMatchup = () => {
        setEditIndex(-1);
        setManualHome('');
        setManualAway('');
        setSwapSelection(null);
    };

    const applyManualMatchup = () => {
        if (!manualHome) {
            return showMessage('Pick a home team (or the team with the bye).', 'error');
        }
        if (manualAway && manualHome === manualAway) {
            return showMessage('A team cannot play itself.', 'error');
        }

        if (editIndex === -1) {
            setDraftSchedule((prev) => {
                const base = prev || createEmptySchedule(teamIds, numWeeks);
                return addMatchupToWeek(base, selectedWeek, manualHome, manualAway || null);
            });
        } else if (editIndex != null) {
            setDraftSchedule((prev) => setMatchupTeams(
                prev,
                selectedWeek,
                editIndex,
                manualHome,
                manualAway || null
            ));
        }

        setEditIndex(null);
        setManualHome('');
        setManualAway('');
        showMessage('Matchup updated locally — save to persist.', 'success');
    };

    const inputClassName = 'w-full p-3 rounded-md bg-emerald-100 text-emerald-900 border-2 border-emerald-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200';
    const buttonClassName = 'px-4 py-2 font-bold rounded-md transition-colors disabled:opacity-50';

    return (
        <div className="mb-8 p-4 sm:p-6 bg-emerald-800 rounded-lg border-2 border-emerald-600">
            <h4 className="text-xl font-semibold mb-2 text-yellow-400">Season Schedule</h4>
            <p className="text-sm text-emerald-300 mb-4">
                Build the {numWeeks}-week regular season. Randomize, generate round-robin, or create blank and set games manually.
                Swap any two matchups (same week or different weeks) by selecting them in order.
            </p>

            <div className="flex flex-wrap gap-3 mb-4">
                <button
                    type="button"
                    disabled={isSaving || teamIds.length < 2}
                    onClick={() => requestGenerate('random')}
                    className={`${buttonClassName} bg-purple-700 hover:bg-purple-800 text-white`}
                >
                    Randomize Schedule
                </button>
                <button
                    type="button"
                    disabled={isSaving || teamIds.length < 2}
                    onClick={() => requestGenerate('round_robin')}
                    className={`${buttonClassName} bg-emerald-600 hover:bg-emerald-500 text-white`}
                >
                    Generate Round-Robin
                </button>
                <button
                    type="button"
                    disabled={isSaving || teamIds.length < 2}
                    onClick={() => requestGenerate('manual')}
                    className={`${buttonClassName} bg-blue-700 hover:bg-blue-800 text-white`}
                >
                    Create Blank Season
                </button>
                <button
                    type="button"
                    disabled={isSaving || !draftSchedule}
                    onClick={handleSaveSchedule}
                    className={`${buttonClassName} bg-green-600 hover:bg-green-700 text-white`}
                >
                    {isSaving ? 'Saving…' : 'Save Schedule'}
                </button>
                <button
                    type="button"
                    disabled={isSaving || !draftSchedule}
                    onClick={handleClearSchedule}
                    className={`${buttonClassName} bg-red-700 hover:bg-red-800 text-white`}
                >
                    Clear Schedule
                </button>
            </div>

            {!draftSchedule?.weeks?.length ? (
                <p className="text-emerald-300 text-sm">
                    No schedule yet. Use one of the buttons above to create the season.
                </p>
            ) : (
                <>
                    <div className="flex flex-wrap items-end gap-4 mb-4">
                        <label className="block min-w-[10rem]">
                            <span className="text-emerald-200 font-medium text-sm">Week</span>
                            <select
                                value={selectedWeek}
                                onChange={(e) => {
                                    setSelectedWeek(Number(e.target.value));
                                    setEditIndex(null);
                                }}
                                className={inputClassName}
                            >
                                {weekOptions.map((week) => (
                                    <option key={week} value={week}>Week {week}</option>
                                ))}
                            </select>
                        </label>
                        <p className="text-xs text-emerald-400 pb-3">
                            Mode: {draftSchedule.mode || 'custom'}
                            {draftSchedule.generatedAt
                                ? ` · generated ${new Date(draftSchedule.generatedAt).toLocaleString()}`
                                : ''}
                            {swapSelection
                                ? ` · swap armed (W${swapSelection.week} #${swapSelection.index + 1})`
                                : ''}
                        </p>
                    </div>

                    <div className="space-y-2 mb-4">
                        {currentWeekMatchups.length === 0 && (
                            <p className="text-emerald-400 text-sm">No matchups in this week yet.</p>
                        )}
                        {currentWeekMatchups.map((matchup, index) => {
                            const isSwapArmed = swapSelection?.week === selectedWeek
                                && swapSelection?.index === index;
                            return (
                                <div
                                    key={`${selectedWeek}-${index}-${matchup.homeTeamId}-${matchup.awayTeamId}`}
                                    className={`flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg border ${
                                        isSwapArmed
                                            ? 'bg-purple-900/50 border-purple-400'
                                            : 'bg-emerald-900/60 border-emerald-700'
                                    }`}
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white font-semibold truncate">
                                            {getTeamName(matchup.homeTeamId)}
                                            <span className="text-emerald-400 font-normal"> vs </span>
                                            {matchup.awayTeamId
                                                ? getTeamName(matchup.awayTeamId)
                                                : <span className="text-yellow-300">BYE</span>}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => handleSwapClick(index)}
                                            className={`${buttonClassName} text-sm bg-purple-800 hover:bg-purple-900 text-white`}
                                        >
                                            {isSwapArmed ? 'Cancel Swap' : 'Swap'}
                                        </button>
                                        <button
                                            type="button"
                                            disabled={!matchup.awayTeamId}
                                            onClick={() => handleFlip(index)}
                                            className={`${buttonClassName} text-sm bg-emerald-700 hover:bg-emerald-600 text-white`}
                                        >
                                            Flip Home/Away
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => startEditMatchup(index)}
                                            className={`${buttonClassName} text-sm bg-blue-700 hover:bg-blue-800 text-white`}
                                        >
                                            Edit
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleRemove(index)}
                                            className={`${buttonClassName} text-sm bg-red-700 hover:bg-red-800 text-white`}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="p-4 rounded-lg bg-emerald-950/50 border border-emerald-700">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                            <h5 className="text-emerald-200 font-semibold">
                                {editIndex === -1
                                    ? `Add matchup · Week ${selectedWeek}`
                                    : editIndex != null
                                        ? `Edit matchup · Week ${selectedWeek}`
                                        : `Manual matchup · Week ${selectedWeek}`}
                            </h5>
                            {editIndex == null && (
                                <button
                                    type="button"
                                    onClick={startAddMatchup}
                                    className={`${buttonClassName} text-sm bg-blue-700 hover:bg-blue-800 text-white`}
                                >
                                    Add Matchup
                                </button>
                            )}
                        </div>

                        {editIndex != null && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                                <label className="block">
                                    <span className="text-emerald-300 text-sm">Home / Bye team</span>
                                    <select
                                        value={manualHome}
                                        onChange={(e) => setManualHome(e.target.value)}
                                        className={inputClassName}
                                    >
                                        <option value="">Select team…</option>
                                        {(editIndex >= 0
                                            ? [
                                                ...availableTeamsForManual,
                                                ...teamsData.filter((t) => t.id === currentWeekMatchups[editIndex]?.homeTeamId
                                                    || t.id === currentWeekMatchups[editIndex]?.awayTeamId),
                                            ].filter((team, i, arr) => arr.findIndex((t) => t.id === team.id) === i)
                                            : availableTeamsForManual
                                        ).map((team) => (
                                            <option key={team.id} value={team.id}>{team.teamName}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="block">
                                    <span className="text-emerald-300 text-sm">Away (blank = bye)</span>
                                    <select
                                        value={manualAway}
                                        onChange={(e) => setManualAway(e.target.value)}
                                        className={inputClassName}
                                    >
                                        <option value="">BYE</option>
                                        {(editIndex >= 0
                                            ? [
                                                ...availableTeamsForManual,
                                                ...teamsData.filter((t) => t.id === currentWeekMatchups[editIndex]?.homeTeamId
                                                    || t.id === currentWeekMatchups[editIndex]?.awayTeamId),
                                            ].filter((team, i, arr) => arr.findIndex((t) => t.id === team.id) === i)
                                            : availableTeamsForManual
                                        ).map((team) => (
                                            <option key={team.id} value={team.id}>{team.teamName}</option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                        )}

                        {editIndex != null && (
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={applyManualMatchup}
                                    className={`${buttonClassName} text-sm bg-green-600 hover:bg-green-700 text-white`}
                                >
                                    Apply Matchup
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEditIndex(null);
                                        setManualHome('');
                                        setManualAway('');
                                    }}
                                    className={`${buttonClassName} text-sm bg-emerald-700 hover:bg-emerald-600 text-white`}
                                >
                                    Cancel
                                </button>
                            </div>
                        )}
                    </div>
                </>
            )}

            <ConfirmationModal
                isOpen={showOverwriteModal}
                onClose={() => {
                    setShowOverwriteModal(false);
                    setPendingGenerate(null);
                }}
                onConfirm={() => applyGenerate(pendingGenerate)}
                title="Replace existing schedule?"
            >
                <p className="text-emerald-200 mb-4">
                    This will overwrite the current season schedule in the editor. Save afterward to persist.
                </p>
            </ConfirmationModal>
        </div>
    );
};

export default ScheduleManager;
