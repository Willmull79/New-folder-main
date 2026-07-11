import React, { useState, useEffect } from 'react';
import { useFirebase } from '../contexts/FirebaseContext.js';
import { Avatar } from './Avatar.js';
import { ConfirmationModal } from './ConfirmationModal.js';
import {
    buildInitialLineup,
    buildStartingSlots,
    INITIAL_ROSTER_LIMITS,
    STANDARD_SCORING_RULES,
    inferDefenseFormat,
    OFFENSIVE_STARTING_SLOTS,
    IDP_STARTING_SLOTS,
    DST_STARTING_SLOTS,
    splitStartingSlots,
    isTeamSalaryCapEnabled,
    isPlayerSalaryEnabled,
} from '../constants/leagueDefaults.js';
import { RosterConfiguration } from './RosterConfiguration.js';
import { DraftSettingsPanel } from './DraftSettingsPanel.js';
import { appId } from '../config/firebase.js';

export const CommissionerTools = ({ currentLeague, currentTeam, showMessage, onLeagueUpdate }) => {
    const { db } = useFirebase();
    const [teamsData, setTeamsData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [showResetModal, setShowResetModal] = useState(false);
    const [showDeleteLeagueModal, setShowDeleteLeagueModal] = useState(false);
    const [selectedTeamToDelete, setSelectedTeamToDelete] = useState(null);
    
    // League Settings State
    const [leagueName, setLeagueName] = useState(currentLeague?.name || '');
    const [numTeams, setNumTeams] = useState(currentLeague?.settings?.numTeams || 12);
    const [numWeeks, setNumWeeks] = useState(currentLeague?.settings?.numWeeks || 14);
    const [playoffWeeks, setPlayoffWeeks] = useState(currentLeague?.settings?.playoffWeeks || 3);
    const [teamSalary, setTeamSalary] = useState(currentLeague?.settings?.teamSalary || 1000);
    const [useTeamSalaryCap, setUseTeamSalaryCap] = useState(isTeamSalaryCapEnabled(currentLeague?.settings));
    const [usePlayerSalaries, setUsePlayerSalaries] = useState(isPlayerSalaryEnabled(currentLeague?.settings));
    const [playersToDrop, setPlayersToDrop] = useState(currentLeague?.settings?.playersToDrop || 5);
    const [salaryRaisePercentage, setSalaryRaisePercentage] = useState(currentLeague?.settings?.salaryRaisePercentage || 10);
    const [minPlayerSalary, setMinPlayerSalary] = useState(currentLeague?.settings?.minPlayerSalary || 0.5);
    const [scoringRules, setScoringRules] = useState(currentLeague?.settings?.scoringRules || STANDARD_SCORING_RULES);
    const [rosterLimits, setRosterLimits] = useState(currentLeague?.settings?.rosterLimits || INITIAL_ROSTER_LIMITS);
    const [defenseFormat, setDefenseFormat] = useState(
        currentLeague?.settings?.defenseFormat || inferDefenseFormat(currentLeague?.settings?.startingSlots)
    );
    const [offenseSlots, setOffenseSlots] = useState({ ...OFFENSIVE_STARTING_SLOTS });
    const [idpSlots, setIdpSlots] = useState({ ...IDP_STARTING_SLOTS });
    const [dstSlots, setDstSlots] = useState({ ...DST_STARTING_SLOTS });
    const [divisions, setDivisions] = useState(currentLeague?.settings?.divisions || [{ name: 'Division 1' }, { name: 'Division 2' }]);
    const [divisionsEnabled, setDivisionsEnabled] = useState(currentLeague?.settings?.divisions?.length > 0);
    

    useEffect(() => {
        if (!db || !currentLeague?.teams) {
            setTeamsData([]);
            return;
        }

        const unsubscribes = currentLeague.teams.map(teamId => {
            return db.doc(`leagues/${currentLeague.id}/teams/${teamId}`).onSnapshot(doc => {
                if (doc.exists) {
                    setTeamsData(prev => {
                        const newTeams = prev.filter(t => t.id !== doc.id);
                        return [...newTeams, { id: doc.id, ...doc.data() }];
                    });
                }
            }, error => console.error("Team data listener error:", error));
        });

        return () => unsubscribes.forEach(unsub => unsub());
    }, [db, currentLeague]);

    useEffect(() => {
        if (!currentLeague) return;

        // Only hydrate the form when switching leagues. Re-syncing on every
        // league snapshot (draft timer, picks, etc.) wipes in-progress edits
        // and makes Save appear to do nothing.
        setLeagueName(currentLeague.name || '');
        setNumTeams(currentLeague.settings?.numTeams || 12);
        setNumWeeks(currentLeague.settings?.numWeeks || 14);
        setPlayoffWeeks(currentLeague.settings?.playoffWeeks || 3);
        setTeamSalary(currentLeague.settings?.teamSalary || 1000);
        setUseTeamSalaryCap(isTeamSalaryCapEnabled(currentLeague.settings));
        setUsePlayerSalaries(isPlayerSalaryEnabled(currentLeague.settings));
        setPlayersToDrop(currentLeague.settings?.playersToDrop || 5);
        setSalaryRaisePercentage(currentLeague.settings?.salaryRaisePercentage || 10);
        setMinPlayerSalary(currentLeague.settings?.minPlayerSalary || 0.5);
        setScoringRules(currentLeague.settings?.scoringRules || STANDARD_SCORING_RULES);
        setRosterLimits(currentLeague.settings?.rosterLimits || INITIAL_ROSTER_LIMITS);
        const split = splitStartingSlots(currentLeague.settings?.startingSlots);
        setDefenseFormat(currentLeague.settings?.defenseFormat || inferDefenseFormat(currentLeague.settings?.startingSlots));
        setOffenseSlots(split.offense);
        setIdpSlots(split.idp);
        setDstSlots(split.dst);
        const rawDivisions = currentLeague.settings?.divisions || [];
        const normalizedDivisions = rawDivisions.length
            ? rawDivisions.map((division) => (
                typeof division === 'string' ? { name: division } : { name: division?.name || '' }
            ))
            : [{ name: 'Division 1' }, { name: 'Division 2' }];
        setDivisions(normalizedDivisions);
        setDivisionsEnabled(rawDivisions.length > 0);
    }, [currentLeague?.id]);

    const handleDeleteTeam = async () => {
        if (!db || !selectedTeamToDelete || !currentLeague?.id) return;

        setIsLoading(true);
        try {
            // Remove team from league
            const leagueRef = db.doc(`leagues/${currentLeague.id}`);
                            await leagueRef.update({
                    teams: firebase.firestore.FieldValue.arrayRemove(selectedTeamToDelete.id)
                });

            // Delete team document
            const teamRef = db.doc(`leagues/${currentLeague.id}/teams/${selectedTeamToDelete.id}`);
            await teamRef.delete();

            showMessage(`Team "${selectedTeamToDelete.teamName}" has been deleted.`, "success");
            setShowDeleteModal(false);
            setSelectedTeamToDelete(null);
        } catch (error) {
            console.error("Error deleting team:", error);
            showMessage("Failed to delete team.", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleResetLeague = async () => {
        if (!db || !currentLeague?.id) return;

        setIsLoading(true);
        try {
            // Reset all team rosters
            const batch = db.batch();
            
            teamsData.forEach(team => {
                const teamRef = db.doc(`leagues/${currentLeague.id}/teams/${team.id}`);
                const startingSlots = currentLeague.settings?.startingSlots || buildStartingSlots();
                batch.update(teamRef, {
                    roster: {
                        lineup: buildInitialLineup(startingSlots),
                        bench: [],
                        ir: []
                    },
                    wins: 0,
                    losses: 0,
                    ties: 0
                });
            });

            // Reset league data
            const leagueRef = db.doc(`leagues/${currentLeague.id}`);
            batch.update(leagueRef, {
                allRosteredPlayerIds: [],
                auction: { status: 'pending' },
                draft: { status: 'pending' }
            });

            await batch.commit();
            showMessage("League has been reset successfully.", "success");
            setShowResetModal(false);
        } catch (error) {
            console.error("Error resetting league:", error);
            showMessage("Failed to reset league.", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdateTeamName = async (teamId, newName) => {
        if (!db || !newName.trim()) return;

        setIsLoading(true);
        try {
            const teamRef = db.doc(`leagues/${currentLeague.id}/teams/${teamId}`);
            await teamRef.update({ teamName: newName.trim() });
            showMessage("Team name updated successfully!", "success");
        } catch (error) {
            console.error("Error updating team name:", error);
            showMessage("Failed to update team name.", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdateTeamOwner = async (teamId, newOwner) => {
        if (!db || !newOwner.trim()) return;

        setIsLoading(true);
        try {
            const teamRef = db.doc(`leagues/${currentLeague.id}/teams/${teamId}`);
            await teamRef.update({ ownerId: newOwner.trim() });
            showMessage("Team owner updated successfully!", "success");
        } catch (error) {
            console.error("Error updating team owner:", error);
            showMessage("Failed to update team owner.", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdateTeamRecord = async (teamId, field, value) => {
        if (!db || !teamId) return;

        setIsLoading(true);
        try {
            const teamRef = db.doc(`leagues/${currentLeague.id}/teams/${teamId}`);
            await teamRef.update({ [field]: Number(value) });
            showMessage("Team record updated successfully!", "success");
        } catch (error) {
            console.error("Error updating team record:", error);
            showMessage("Failed to update team record.", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const toFiniteNumber = (value, fallback = 0) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    };

    const cleanNumberMap = (map = {}, fallback = 0) => (
        Object.fromEntries(
            Object.entries(map)
                .filter(([key]) => Boolean(key))
                .map(([key, val]) => [key, toFiniteNumber(val, fallback)]),
        )
    );

    const handleSaveLeagueSettings = async () => {
        if (!db || !currentLeague?.id) {
            showMessage("Cannot save settings - missing league data.", "error");
            return;
        }

        setIsLoading(true);
        try {
            const leagueRef = db.doc(`leagues/${currentLeague.id}`);
            const finalDivisions = divisionsEnabled
                ? divisions.map((d) => (d?.name || '').trim()).filter(Boolean)
                : [];

            const startingSlots = cleanNumberMap(buildStartingSlots({
                offenseSlots,
                defenseFormat,
                idpSlots,
                dstSlots,
            }));

            const existingSettings = currentLeague.settings || {};

            // Field-path updates avoid rewriting unrelated/corrupt nested values
            // and preserve draftType / other settings keys not edited here.
            const updates = {
                name: (leagueName || '').trim() || currentLeague.name || 'League',
                'settings.numTeams': toFiniteNumber(numTeams, 12),
                'settings.numWeeks': toFiniteNumber(numWeeks, 14),
                'settings.playoffWeeks': toFiniteNumber(playoffWeeks, 3),
                'settings.useTeamSalaryCap': Boolean(useTeamSalaryCap),
                'settings.usePlayerSalaries': Boolean(usePlayerSalaries),
                'settings.teamSalary': useTeamSalaryCap ? toFiniteNumber(teamSalary, 1000) : null,
                'settings.playersToDrop': toFiniteNumber(playersToDrop, 5),
                'settings.salaryRaisePercentage': usePlayerSalaries
                    ? toFiniteNumber(salaryRaisePercentage, 10)
                    : null,
                'settings.minPlayerSalary': usePlayerSalaries
                    ? toFiniteNumber(minPlayerSalary, 0.5)
                    : null,
                'settings.scoringRules': cleanNumberMap(scoringRules),
                'settings.rosterLimits': cleanNumberMap(rosterLimits),
                'settings.defenseFormat': defenseFormat || existingSettings.defenseFormat || 'idp',
                'settings.startingSlots': startingSlots,
                'settings.divisions': finalDivisions,
            };

            if (existingSettings.draftType) {
                updates['settings.draftType'] = existingSettings.draftType;
            }

            await leagueRef.update(updates);

            const mergedSettings = {
                ...existingSettings,
                numTeams: updates['settings.numTeams'],
                numWeeks: updates['settings.numWeeks'],
                playoffWeeks: updates['settings.playoffWeeks'],
                useTeamSalaryCap: updates['settings.useTeamSalaryCap'],
                usePlayerSalaries: updates['settings.usePlayerSalaries'],
                teamSalary: updates['settings.teamSalary'],
                playersToDrop: updates['settings.playersToDrop'],
                salaryRaisePercentage: updates['settings.salaryRaisePercentage'],
                minPlayerSalary: updates['settings.minPlayerSalary'],
                scoringRules: updates['settings.scoringRules'],
                rosterLimits: updates['settings.rosterLimits'],
                defenseFormat: updates['settings.defenseFormat'],
                startingSlots: updates['settings.startingSlots'],
                divisions: updates['settings.divisions'],
            };

            showMessage("League settings updated successfully!", "success");

            try {
                onLeagueUpdate?.({
                    ...currentLeague,
                    id: currentLeague.id,
                    name: updates.name,
                    settings: mergedSettings,
                });
            } catch (callbackError) {
                console.warn('League settings saved, but local refresh failed:', callbackError);
            }
        } catch (error) {
            console.error("Error updating league settings:", error);
            const detail = error?.message || error?.code || 'Unknown error';
            showMessage(`Failed to update league settings: ${detail}`, "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleScoringChange = (rule, value) => {
        setScoringRules(prev => ({ ...prev, [rule]: Number(value) }));
    };

    const handleDivisionNameChange = (index, name) => {
        const newDivisions = [...divisions];
        newDivisions[index].name = name;
        setDivisions(newDivisions);
    };

    const addDivision = () => {
        if (divisions.length < 4) {
            setDivisions([...divisions, { name: `Division ${divisions.length + 1}` }]);
        }
    };

    const removeDivision = (index) => {
        if (divisions.length > 2) {
            setDivisions(divisions.filter((_, i) => i !== index));
        }
    };



    const handleDeleteLeague = async () => {
        if (!db || !currentLeague?.id) return;

        setIsLoading(true);
        try {
            // Delete all team documents
            const batch = db.batch();
            
            teamsData.forEach(team => {
                const teamRef = db.doc(`leagues/${currentLeague.id}/teams/${team.id}`);
                batch.delete(teamRef);
            });

            // Delete the league document
            const leagueRef = db.doc(`leagues/${currentLeague.id}`);
            batch.delete(leagueRef);

            await batch.commit();
            showMessage("League has been deleted successfully.", "success");
            setShowDeleteLeagueModal(false);
            
            // Redirect to league selector or refresh
            if (onLeagueUpdate) {
                onLeagueUpdate();
            }
        } catch (error) {
            console.error("Error deleting league:", error);
            showMessage("Failed to delete league.", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const renderScoringInput = (label, rule) => (
        <label key={rule} className="block">
            <span className="text-emerald-200 font-medium">{label}</span>
            <input
                type="number"
                step="0.05"
                value={scoringRules[rule]}
                onChange={(e) => handleScoringChange(rule, e.target.value)}
                className="w-full p-3 mt-1 rounded-md bg-emerald-100 text-emerald-900 border-2 border-emerald-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-colors"
            />
        </label>
    );

    return (
        <div className="p-4 sm:p-6 bg-emerald-950 rounded-lg shadow-xl max-w-7xl mx-auto my-2 sm:my-8 text-white">
            <div className="mb-6">
                <h2 className="text-3xl font-bold text-white mb-2">Commissioner Tools</h2>
                <p className="text-emerald-300">League: {currentLeague?.name}</p>
                <p className="text-emerald-300">Manage league settings, teams, and operations</p>
            </div>

            {/* League Settings Section */}
            <div className="bg-emerald-900 p-6 rounded-lg shadow-lg mb-6">
                <h3 className="text-2xl font-bold text-purple-400 mb-4">League Settings</h3>
                
                <div className="mb-8 p-4 sm:p-6 bg-emerald-800 rounded-lg border-2 border-emerald-600">
                    <h4 className="text-xl font-semibold mb-4 text-purple-300">General Settings</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                        <label className="block sm:col-span-2 md:col-span-3">
                            <span className="text-emerald-200 font-medium">League Name</span>
                            <input 
                                type="text" 
                                value={leagueName} 
                                onChange={e => setLeagueName(e.target.value)} 
                                className="w-full p-3 mt-1 rounded-md bg-emerald-100 text-emerald-900 border-2 border-emerald-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-colors" 
                            />
                        </label>
                        <label className="block">
                            <span className="text-emerald-200 font-medium">Number of Teams</span>
                            <select 
                                value={numTeams} 
                                onChange={e => setNumTeams(e.target.value)} 
                                className="w-full p-3 mt-1 rounded-md bg-emerald-100 text-emerald-900 border-2 border-emerald-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-colors"
                            >
                                {[4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24].map(n => <option key={n} value={n}>{n} Teams</option>)}
                            </select>
                        </label>
                        <label className="block">
                            <span className="text-emerald-200 font-medium">Regular Season Weeks</span>
                            <select 
                                value={numWeeks} 
                                onChange={e => setNumWeeks(e.target.value)} 
                                className="w-full p-3 mt-1 rounded-md bg-emerald-100 text-emerald-900 border-2 border-emerald-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-colors"
                            >
                                {[4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(n => <option key={n} value={n}>{n} Weeks</option>)}
                            </select>
                        </label>
                        <label className="block">
                            <span className="text-emerald-200 font-medium">Playoff Weeks</span>
                            <select 
                                value={playoffWeeks} 
                                onChange={e => setPlayoffWeeks(e.target.value)} 
                                className="w-full p-3 mt-1 rounded-md bg-emerald-100 text-emerald-900 border-2 border-emerald-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-colors"
                            >
                                {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n} Weeks</option>)}
                            </select>
                        </label>
                        <label className="block">
                            <span className="text-emerald-200 font-medium">Team Salary Cap</span>
                            <input 
                                type="number" 
                                max="5000" 
                                value={teamSalary} 
                                onChange={e => setTeamSalary(e.target.value)} 
                                disabled={!useTeamSalaryCap}
                                className="w-full p-3 mt-1 rounded-md bg-emerald-100 text-emerald-900 border-2 border-emerald-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-colors disabled:opacity-50" 
                            />
                        </label>
                        <label className="block">
                            <span className="text-emerald-200 font-medium">Players to Drop</span>
                            <input 
                                type="number" 
                                value={playersToDrop} 
                                onChange={e => setPlayersToDrop(e.target.value)} 
                                className="w-full p-3 mt-1 rounded-md bg-emerald-100 text-emerald-900 border-2 border-emerald-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-colors" 
                            />
                        </label>
                        <label className="block">
                            <span className="text-emerald-200 font-medium">Salary Raise %</span>
                            <input 
                                type="number" 
                                value={salaryRaisePercentage} 
                                onChange={e => setSalaryRaisePercentage(e.target.value)} 
                                disabled={!usePlayerSalaries}
                                className="w-full p-3 mt-1 rounded-md bg-emerald-100 text-emerald-900 border-2 border-emerald-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-colors disabled:opacity-50" 
                            />
                        </label>
                        <label className="block">
                            <span className="text-emerald-200 font-medium">Min Player Salary</span>
                            <input 
                                type="number" 
                                value={minPlayerSalary} 
                                onChange={e => setMinPlayerSalary(e.target.value)} 
                                min="0.5" 
                                max="10" 
                                step="0.01" 
                                disabled={!usePlayerSalaries}
                                className="w-full p-3 mt-1 rounded-md bg-emerald-100 text-emerald-900 border-2 border-emerald-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-colors disabled:opacity-50" 
                            />
                        </label>
                        <div className="sm:col-span-2 md:col-span-3">
                            <label className="flex items-center space-x-3 cursor-pointer p-3 bg-emerald-700 rounded-md hover:bg-emerald-600 transition-colors">
                                <input
                                    type="checkbox"
                                    checked={useTeamSalaryCap}
                                    onChange={(e) => setUseTeamSalaryCap(e.target.checked)}
                                    className="form-checkbox h-5 w-5 bg-emerald-100 border-emerald-300 rounded text-purple-500 focus:ring-purple-500"
                                />
                                <span className="text-emerald-200 font-medium">Enable Team Salary Cap</span>
                            </label>
                        </div>
                        <div className="sm:col-span-2 md:col-span-3">
                            <label className="flex items-center space-x-3 cursor-pointer p-3 bg-emerald-700 rounded-md hover:bg-emerald-600 transition-colors">
                                <input
                                    type="checkbox"
                                    checked={usePlayerSalaries}
                                    onChange={(e) => setUsePlayerSalaries(e.target.checked)}
                                    className="form-checkbox h-5 w-5 bg-emerald-100 border-emerald-300 rounded text-purple-500 focus:ring-purple-500"
                                />
                                <span className="text-emerald-200 font-medium">Enable Player Salaries</span>
                            </label>
                        </div>
                        <div className="sm:col-span-2 md:col-span-3">
                            <label className="flex items-center space-x-3 cursor-pointer p-3 bg-emerald-700 rounded-md hover:bg-emerald-600 transition-colors">
                                <input
                                    type="checkbox"
                                    checked={divisionsEnabled}
                                    onChange={(e) => setDivisionsEnabled(e.target.checked)}
                                    className="form-checkbox h-5 w-5 bg-emerald-100 border-emerald-300 rounded text-purple-500 focus:ring-purple-500"
                                />
                                <span className="text-emerald-200 font-medium">Enable Divisions</span>
                            </label>
                        </div>
                    </div>

                    <RosterConfiguration
                        defenseFormat={defenseFormat}
                        onDefenseFormatChange={setDefenseFormat}
                        offenseSlots={offenseSlots}
                        onOffenseSlotChange={(pos, value) => setOffenseSlots((prev) => ({ ...prev, [pos]: Math.max(0, value) }))}
                        idpSlots={idpSlots}
                        onIdpSlotChange={(pos, value) => setIdpSlots((prev) => ({ ...prev, [pos]: Math.max(0, value) }))}
                        dstSlots={dstSlots}
                        onDstSlotChange={(pos, value) => setDstSlots((prev) => ({ ...prev, [pos]: Math.max(0, value) }))}
                        rosterLimits={rosterLimits}
                        onRosterLimitChange={(pos, value) => setRosterLimits((prev) => ({ ...prev, [pos]: value }))}
                        variant="commissioner"
                        embedded
                    />
                </div>

                {divisionsEnabled && (
                    <div className="mb-8 p-4 sm:p-6 bg-emerald-800 rounded-lg border-2 border-emerald-600">
                        <h4 className="text-xl font-semibold mb-4 text-yellow-400">Divisions</h4>
                        <div className="space-y-4">
                            {divisions.map((division, index) => (
                                <div key={index} className="flex items-center gap-4">
                                    <input 
                                        type="text" 
                                        value={division.name} 
                                        onChange={(e) => handleDivisionNameChange(index, e.target.value)} 
                                        className="w-full p-3 rounded-md bg-emerald-100 text-emerald-900 border-2 border-emerald-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-colors" 
                                    />
                                    {divisions.length > 2 && (
                                        <button 
                                            onClick={() => removeDivision(index)} 
                                            className="px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-md font-bold transition-colors"
                                        >
                                            Remove
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                        {divisions.length < 4 && (
                            <button 
                                onClick={addDivision} 
                                className="mt-4 px-6 py-3 bg-purple-800 hover:bg-purple-900 text-white font-bold rounded-md transition-colors"
                            >
                                Add Division
                            </button>
                        )}
                    </div>
                )}

                <DraftSettingsPanel
                    currentLeague={currentLeague}
                    teamsData={teamsData}
                    showMessage={showMessage}
                    variant="commissioner"
                />

                <div className="mb-8 p-4 sm:p-6 bg-emerald-800 rounded-lg border-2 border-emerald-600">
                    <h4 className="text-xl font-semibold mb-4 text-emerald-400">Scoring Rules</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                        <div>
                            <h5 className="text-lg font-bold mb-3 text-emerald-200 border-b border-emerald-500 pb-2">Offense</h5>
                            <div className="grid grid-cols-2 gap-4">
                                {renderScoringInput('Passing TD', 'passTd')}
                                {renderScoringInput('Rushing TD', 'rushTd')}
                                {renderScoringInput('Receiving TD', 'recTd')}
                                {renderScoringInput('Return TD', 'returnTd')}
                                {renderScoringInput('2-Point Conv.', 'twoPointConversion')}
                                {renderScoringInput('Completion', 'completion')}
                                {renderScoringInput('Passing Yard', 'passYard')}
                                {renderScoringInput('Rush/Rec Yard', 'rushRecYard')}
                                {renderScoringInput('Reception (PPR)', 'reception')}
                                {renderScoringInput('300+ Pass Yd Bonus', 'pass300YardBonus')}
                                {renderScoringInput('400+ Pass Yd Bonus', 'pass400YardBonus')}
                                {renderScoringInput('100+ Rush/Rec Yd Bonus', 'rushRec100YardBonus')}
                                {renderScoringInput('200+ Rush/Rec Yd Bonus', 'rushRec200YardBonus')}
                                {renderScoringInput('Fumble Recovery', 'fumbleRecovery')}
                                {renderScoringInput('Sack (QB)', 'sack')}
                                {renderScoringInput('Interception (QB)', 'interception')}
                                {renderScoringInput('Fumble Lost', 'fumble')}
                            </div>
                        </div>
                        <div>
                            <h5 className="text-lg font-bold mb-3 text-emerald-200 border-b border-emerald-500 pb-2">Kicking</h5>
                            <div className="grid grid-cols-2 gap-4 mb-6">
                                {renderScoringInput('Extra Point Made', 'extraPoint')}
                                {renderScoringInput('FG Made (0-39 yds)', 'fg39Less')}
                                {renderScoringInput('FG Made (40-49 yds)', 'fg40_49')}
                                {renderScoringInput('FG Made (50+ yds)', 'fg50Plus')}
                                {renderScoringInput('Missed FG/EP', 'missedFgEp')}
                            </div>
                            <h5 className="text-lg font-bold mb-3 text-emerald-200 border-b border-emerald-500 pb-2">Defense & ST</h5>
                            <div className="grid grid-cols-2 gap-4">
                                {renderScoringInput('Tackle (Solo)', 'tackle')}
                                {renderScoringInput('Assisted Tackle', 'assistedTackle')}
                                {renderScoringInput('Tackle for Loss', 'tackleForLoss')}
                                {renderScoringInput('Forced Fumble', 'forcedFumble')}
                                {renderScoringInput('Fumble Recovery', 'fumbleRecoveryDef')}
                                {renderScoringInput('Interception', 'interceptionDef')}
                                {renderScoringInput('Pass Defended', 'passDefended')}
                                {renderScoringInput('Def/ST TD', 'defensiveStTd')}
                                {renderScoringInput('Def/ST Return Yard', 'returnYardDefSt')}
                            </div>
                        </div>
                    </div>
                </div>



                <button
                    onClick={handleSaveLeagueSettings}
                    disabled={isLoading}
                    className="px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-md disabled:opacity-50 transition-colors shadow-lg"
                >
                    {isLoading ? 'Saving...' : 'Save League Settings'}
                </button>
            </div>

            {/* League Management Section */}
            <div className="bg-emerald-900 p-6 rounded-lg shadow-lg mb-6 border-2 border-emerald-700">
                <h3 className="text-2xl font-bold text-red-400 mb-4">League Management</h3>
                <div className="space-y-4">
                    <div className="flex gap-4">
                        <button
                            onClick={() => setShowResetModal(true)}
                            disabled={isLoading}
                            className="px-8 py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-md disabled:opacity-50 transition-colors shadow-lg"
                        >
                            {isLoading ? 'Processing...' : 'Reset League'}
                        </button>
                        <button
                            onClick={() => setShowDeleteLeagueModal(true)}
                            disabled={isLoading}
                            className="px-8 py-4 bg-red-800 hover:bg-red-900 text-white font-bold rounded-md disabled:opacity-50 transition-colors shadow-lg"
                        >
                            {isLoading ? 'Processing...' : 'Delete League'}
                        </button>
                    </div>
                    <p className="text-sm text-emerald-300">
                        Reset: Clear all team rosters, records, and league data. This action cannot be undone.
                    </p>
                    <p className="text-sm text-emerald-300">
                        Delete: Permanently delete the entire league and all teams. This action cannot be undone.
                    </p>
                </div>
            </div>

            {/* Team Management Section */}
            <div className="bg-emerald-900 p-6 rounded-lg shadow-lg border-2 border-emerald-700">
                <h3 className="text-2xl font-bold text-purple-400 mb-4">Team Management</h3>
                <div className="space-y-4">
                    {teamsData.map(team => (
                        <div key={team.id} className="bg-emerald-800 p-4 rounded-lg border-2 border-emerald-600">
                            <div className="flex items-center gap-4 mb-4">
                                <Avatar
                                    docRefPath={`leagues/${currentLeague.id}/teams/${team.id}`}
                                    storagePath={`team-avatars/${team.id}`}
                                    currentAvatarUrl={team.avatarUrl}
                                    showMessage={showMessage}
                                    size="h-12 w-12"
                                />
                                <div className="flex-grow">
                                    <h4 className="text-lg font-semibold text-white">{team.teamName}</h4>
                                    <p className="text-emerald-300 text-sm">Owner: {team.ownerId}</p>
                                </div>
                                <button
                                    onClick={() => {
                                        setSelectedTeamToDelete(team);
                                        setShowDeleteModal(true);
                                    }}
                                    disabled={isLoading}
                                    className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-md disabled:opacity-50 transition-colors font-bold"
                                >
                                    Delete
                                </button>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-emerald-200 font-medium text-sm mb-1">Team Name:</label>
                                    <input
                                        type="text"
                                        defaultValue={team.teamName}
                                        onBlur={(e) => handleUpdateTeamName(team.id, e.target.value)}
                                        className="w-full p-3 rounded-md bg-emerald-100 text-emerald-900 border-2 border-emerald-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-emerald-200 font-medium text-sm mb-1">Owner ID:</label>
                                    <input
                                        type="text"
                                        defaultValue={team.ownerId}
                                        onBlur={(e) => handleUpdateTeamOwner(team.id, e.target.value)}
                                        className="w-full p-3 rounded-md bg-emerald-100 text-emerald-900 border-2 border-emerald-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-emerald-200 font-medium text-sm mb-1">Record (W-L-T):</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="number"
                                            defaultValue={team.wins || 0}
                                            onBlur={(e) => handleUpdateTeamRecord(team.id, 'wins', e.target.value)}
                                            className="w-20 p-3 rounded-md bg-emerald-100 text-emerald-900 border-2 border-emerald-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-colors"
                                        />
                                        <span className="text-emerald-300 self-center font-bold">-</span>
                                        <input
                                            type="number"
                                            defaultValue={team.losses || 0}
                                            onBlur={(e) => handleUpdateTeamRecord(team.id, 'losses', e.target.value)}
                                            className="w-20 p-3 rounded-md bg-emerald-100 text-emerald-900 border-2 border-emerald-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-colors"
                                        />
                                        <span className="text-emerald-300 self-center font-bold">-</span>
                                        <input
                                            type="number"
                                            defaultValue={team.ties || 0}
                                            onBlur={(e) => handleUpdateTeamRecord(team.id, 'ties', e.target.value)}
                                            className="w-20 p-3 rounded-md bg-emerald-100 text-emerald-900 border-2 border-emerald-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-colors"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Confirmation Modals */}
            <ConfirmationModal
                isOpen={showDeleteModal}
                onClose={() => setShowDeleteModal(false)}
                onConfirm={handleDeleteTeam}
                title="Delete Team"
            >
                Are you sure you want to delete "{selectedTeamToDelete?.teamName}"? This action cannot be undone.
            </ConfirmationModal>

            <ConfirmationModal
                isOpen={showResetModal}
                onClose={() => setShowResetModal(false)}
                onConfirm={handleResetLeague}
                title="Reset League"
            >
                Are you sure you want to reset the entire league? This will clear all team rosters, records, and league data. This action cannot be undone.
            </ConfirmationModal>

            <ConfirmationModal
                isOpen={showDeleteLeagueModal}
                onClose={() => setShowDeleteLeagueModal(false)}
                onConfirm={handleDeleteLeague}
                title="Delete League"
            >
                Are you sure you want to delete the entire league "{currentLeague?.name}"? This will permanently delete the league and all teams. This action cannot be undone.
            </ConfirmationModal>
        </div>
    );
}; 