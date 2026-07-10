import React, { useState, useEffect } from 'react';
import { useFirebase } from '../contexts/FirebaseContext.js';
import { appId } from '../config/firebase.js';
import {
    buildInitialLineup,
    buildStartingSlots,
    INITIAL_ROSTER_LIMITS,
    STANDARD_SCORING_RULES,
    OFFENSIVE_STARTING_SLOTS,
    IDP_STARTING_SLOTS,
    DST_STARTING_SLOTS,
} from '../constants/leagueDefaults.js';
import { RosterConfiguration } from './RosterConfiguration.js';

export const LeagueSelector = ({ userId, showMessage, userDisplayName, onLeagueSelected }) => {
    const { db } = useFirebase();
    const [joinLeagueId, setJoinLeagueId] = useState('');
    const [isLoadingJoin, setIsLoadingJoin] = useState(false);
    const [userLeagues, setUserLeagues] = useState([]);
    const [isCreatingLeague, setIsCreatingLeague] = useState(false);
    const [allLeagues, setAllLeagues] = useState([]);
    
    console.log('LeagueSelector rendered with:', { userId, userDisplayName, db: !!db });

    useEffect(() => {
        if (!db || !userId) return;

        // Get all leagues and check if user has teams in them
        const unsubscribe = db.collection("leagues")
            .onSnapshot(async (leagueSnapshot) => {
                const userLeaguesData = [];
                const allLeaguesData = [];
                
                for (const leagueDoc of leagueSnapshot.docs) {
                    const leagueData = leagueDoc.data();
                    const leagueId = leagueDoc.id;
                    
                    // Add to all leagues for debugging
                    allLeaguesData.push({ id: leagueId, ...leagueData });
                    
                    // Check if user has a team in this league
                    const teamsSnapshot = await db.collection(`leagues/${leagueId}/teams`)
                        .where("ownerId", "==", userId)
                        .get();
                    
                    if (!teamsSnapshot.empty) {
                        userLeaguesData.push({ id: leagueId, ...leagueData });
                    }
                }
                
                console.log('All leagues found:', allLeaguesData.map(l => ({ id: l.id, name: l.name })));
                setUserLeagues(userLeaguesData);
                setAllLeagues(allLeaguesData);
            }, (error) => {
                console.error("Error fetching user's leagues:", error);
                showMessage("Error fetching your leagues.", "error");
            });
        return () => unsubscribe();
    }, [db, userId]);

    const handleJoinLeague = async (leagueIdToJoin) => {
        if (!leagueIdToJoin.trim()) return showMessage("League ID cannot be empty.", "error");
        setIsLoadingJoin(true);
        
        console.log('Attempting to join league with ID:', leagueIdToJoin);
        
        const leagueDocRef = db.doc(`leagues/${leagueIdToJoin}`);
        const teamsCollectionRef = db.collection(`leagues/${leagueIdToJoin}/teams`);

        try {
            const leagueDoc = await leagueDocRef.get();
            console.log('League document exists:', leagueDoc.exists);
            if (!leagueDoc.exists) {
                console.log('League not found in Firestore');
                showMessage("League not found.", "error");
                setIsLoadingJoin(false);
                return;
            }
            const leagueData = leagueDoc.data();
            const existingTeamQuery = await teamsCollectionRef.where("ownerId", "==", userId).get();

            if (!existingTeamQuery.empty) {
                const existingTeamId = existingTeamQuery.docs[0].id;
                showMessage("You already have a team in this league. Entering now.", "info");
                onLeagueSelected(leagueIdToJoin, existingTeamId);
                return;
            }

            // Assign to a division round-robin style if divisions exist
            const divisions = leagueData.settings.divisions || [];
            let assignedDivision = null;
            if (divisions.length > 0) {
                const divisionIndex = leagueData.teams.length % divisions.length;
                assignedDivision = divisions[divisionIndex];
            }

            const initialLineup = {};
            const startingSlots = leagueData.settings.startingSlots || buildStartingSlots();
            Object.entries(startingSlots).forEach(([pos, count]) => {
                for (let i = 1; i <= count; i++) {
                    initialLineup[`${pos}${i}`] = null;
                }
            });

            const newTeamData = {
                teamName: `${userDisplayName || 'New User'}'s Team`,
                ownerId: userId,
                roster: {
                    lineup: initialLineup,
                    bench: [],
                    ir: []
                },
                wins: 0, losses: 0, ties: 0,
            };
            if (assignedDivision) {
                newTeamData.division = assignedDivision;
            }

            const newTeamRef = await teamsCollectionRef.add(newTeamData);

            await leagueDocRef.update({
                teams: firebase.firestore.FieldValue.arrayUnion(newTeamRef.id)
            });

            showMessage(`Successfully joined league "${leagueData.name}"!`, "success");
            onLeagueSelected(leagueIdToJoin, newTeamRef.id);

        } catch (error) {
            showMessage("Error joining league.", "error");
            console.error(error);
        } finally {
            setIsLoadingJoin(false);
        }
    };
    
    if (isCreatingLeague) {
        console.log('Rendering CreateLeagueForm');
        return <CreateLeagueForm 
            userId={userId}
            userDisplayName={userDisplayName}
            showMessage={showMessage}
            onLeagueCreated={onLeagueSelected} 
            onCancel={() => setIsCreatingLeague(false)} 
        />;
    }

    return (
        <div className="p-4 sm:p-6 bg-emerald-950 rounded-lg shadow-xl max-w-4xl mx-auto my-2 sm:my-8 text-white">
            <h2 className="text-3xl font-bold text-white mb-6 text-center">League Management</h2>
            
            {userLeagues.length > 0 && (
                <div className="mb-8 p-4 sm:p-6 bg-emerald-900 rounded-lg">
                    <h3 className="text-2xl font-semibold mb-4 text-emerald-200">Your Leagues</h3>
                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {userLeagues.map(league => (
                            <li key={league.id} className="bg-emerald-800 p-4 rounded-md flex justify-between items-center">
                                <div className="flex-1 overflow-hidden mr-2">
                                    <p className="font-semibold truncate text-white">{league.name}</p>
                                    <p className="text-xs text-emerald-300 truncate">ID: {league.id}</p>
                                </div>
                                <button onClick={() => handleJoinLeague(league.id)} className="px-4 py-2 bg-purple-800 hover:bg-purple-900 font-semibold rounded-md flex-shrink-0">Enter</button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="p-6 bg-emerald-900 rounded-lg flex flex-col justify-center items-center">
                    <h3 className="text-2xl font-semibold mb-4 text-center text-emerald-200">Start a New League</h3>
                    <button onClick={() => {
                        console.log('Create League button clicked');
                        setIsCreatingLeague(true);
                    }} className="w-full px-6 py-3 bg-emerald-600 hover:bg-emerald-700 font-bold rounded-md">
                        Create a League
                    </button>
                </div>
                <div className="p-6 bg-emerald-900 rounded-lg">
                    <h3 className="text-2xl font-semibold mb-4 text-center text-emerald-200">Join Existing League</h3>
                    <input type="text" placeholder="Enter League ID" value={joinLeagueId} onChange={e => setJoinLeagueId(e.target.value)} className="w-full p-3 mb-4 rounded-md bg-emerald-800 text-white border-emerald-600 focus:border-purple-500 focus:ring-2 focus:ring-purple-200" />
                    <button onClick={() => handleJoinLeague(joinLeagueId)} disabled={isLoadingJoin} className="w-full px-6 py-3 bg-purple-800 hover:bg-purple-900 font-bold rounded-md disabled:opacity-50">
                        {isLoadingJoin ? 'Joining...' : 'Join League'}
                    </button>
                </div>
            </div>

            {/* Debug Section - Show All Available Leagues */}
            {allLeagues.length > 0 && (
                <div className="mt-8 p-4 bg-red-900 rounded-lg border-2 border-red-600">
                    <h3 className="text-xl font-semibold mb-4 text-red-200">Debug: All Available Leagues</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {allLeagues.map(league => (
                            <div key={league.id} className="bg-red-800 p-3 rounded-lg">
                                <div className="font-semibold text-white">{league.name}</div>
                                <div className="text-sm text-red-300">ID: {league.id}</div>
                                <div className="text-xs text-red-400">Commissioner: {league.commissionerId}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// Comprehensive CreateLeagueForm component with all settings
const CreateLeagueForm = ({ userId, userDisplayName, showMessage, onLeagueCreated, onCancel }) => {
    const { db } = useFirebase();
    console.log('CreateLeagueForm rendered with:', { userId, userDisplayName, db: !!db });
    const [leagueName, setLeagueName] = useState('');
    const [numTeams, setNumTeams] = useState(12);
    const [numWeeks, setNumWeeks] = useState(14);
    const [playoffWeeks, setPlayoffWeeks] = useState(3);
    const [teamSalary, setTeamSalary] = useState(1000);
    const [useTeamSalaryCap, setUseTeamSalaryCap] = useState(true);
    const [usePlayerSalaries, setUsePlayerSalaries] = useState(true);
    const [playersToDrop, setPlayersToDrop] = useState(5);
    const [salaryRaisePercentage, setSalaryRaisePercentage] = useState(10);
    const [minPlayerSalary, setMinPlayerSalary] = useState(0.5);
    const [scoringRules, setScoringRules] = useState(STANDARD_SCORING_RULES);
    const [rosterLimits, setRosterLimits] = useState(INITIAL_ROSTER_LIMITS);
    const [defenseFormat, setDefenseFormat] = useState('idp');
    const [offenseSlots, setOffenseSlots] = useState({ ...OFFENSIVE_STARTING_SLOTS });
    const [idpSlots, setIdpSlots] = useState({ ...IDP_STARTING_SLOTS });
    const [dstSlots, setDstSlots] = useState({ ...DST_STARTING_SLOTS });
    const [divisions, setDivisions] = useState([{ name: 'Division 1' }, { name: 'Division 2' }]);
    const [isLoading, setIsLoading] = useState(false);
    const [divisionsEnabled, setDivisionsEnabled] = useState(true);
    const [draftType, setDraftType] = useState('auction');

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
    
    const handleOffenseSlotChange = (pos, value) => {
        setOffenseSlots((prev) => ({ ...prev, [pos]: Math.max(0, value) }));
    };

    const handleIdpSlotChange = (pos, value) => {
        setIdpSlots((prev) => ({ ...prev, [pos]: Math.max(0, value) }));
    };

    const handleDstSlotChange = (pos, value) => {
        setDstSlots((prev) => ({ ...prev, [pos]: Math.max(0, value) }));
    };

    const handleCreateLeague = async () => {
        console.log('handleCreateLeague called');
        if (!leagueName.trim()) return showMessage("League name cannot be empty.", "error");
        if (useTeamSalaryCap && teamSalary > 5000) return showMessage("Team salary cannot exceed 5000.", "error");
        setIsLoading(true);
        try {
            const newLeagueRef = db.collection("leagues").doc();
            const newLeagueId = newLeagueRef.id;
            const finalDivisions = divisionsEnabled ? divisions.map(d => d.name.trim()).filter(Boolean) : [];

            const startingSlots = buildStartingSlots({
                offenseSlots,
                defenseFormat,
                idpSlots,
                dstSlots,
            });
            const initialLineup = buildInitialLineup(startingSlots);

            await newLeagueRef.set({
                name: leagueName.trim(),
                commissionerId: userId,
                teams: [],
                allRosteredPlayerIds: [],
                settings: {
                    numTeams: Number(numTeams),
                    numWeeks: Number(numWeeks),
                    playoffWeeks: Number(playoffWeeks),
                    useTeamSalaryCap,
                    usePlayerSalaries,
                    teamSalary: useTeamSalaryCap ? Number(teamSalary) : null,
                    playersToDrop: Number(playersToDrop),
                    salaryRaisePercentage: usePlayerSalaries ? Number(salaryRaisePercentage) : null,
                    minPlayerSalary: usePlayerSalaries ? Number(minPlayerSalary) : null,
                    scoringRules: scoringRules,
                    rosterLimits: rosterLimits,
                    defenseFormat: defenseFormat,
                    startingSlots: startingSlots,
                    divisions: finalDivisions,
                    draftType: draftType,
                },
                auction: {
                    status: 'pending'
                },
                draft: {
                    type: draftType,
                    status: 'pending',
                    currentRound: 1,
                    currentPick: 1,
                    draftOrder: [],
                    availablePlayers: [],
                    draftedPlayers: []
                }
            });

            const commissionerTeamData = {
                teamName: `${userDisplayName || 'New User'}'s Team`,
                ownerId: userId,
                roster: {
                    lineup: initialLineup,
                    bench: [],
                    ir: []
                },
                wins: 0, losses: 0, ties: 0,
            };

            if (divisionsEnabled && finalDivisions.length > 0) {
                commissionerTeamData.division = finalDivisions[0];
            }

            const newTeamRef = await db.collection(`leagues/${newLeagueId}/teams`).add(commissionerTeamData);

            await newLeagueRef.update({
                teams: firebase.firestore.FieldValue.arrayUnion(newTeamRef.id)
            });

            console.log('League created successfully with ID:', newLeagueId);
            showMessage(`League "${leagueName}" created successfully! League ID: ${newLeagueId}`, "success");
            onLeagueCreated(newLeagueId, newTeamRef.id);

        } catch (error) {
            showMessage("Error creating league.", "error");
            console.error("Error creating league:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const renderScoringInput = (label, rule) => (
        <label key={rule} className="block">
            <span className="text-emerald-200">{label}</span>
            <input 
                type="number" 
                step="0.05" 
                value={scoringRules[rule]} 
                onChange={(e) => handleScoringChange(rule, e.target.value)} 
                className="w-full p-2 mt-1 rounded-md bg-emerald-800 text-white border border-emerald-600 focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
            />
        </label>
    );

    return (
        <div className="p-4 sm:p-6 bg-emerald-950 rounded-lg shadow-xl max-w-4xl mx-auto my-2 sm:my-8 text-white">
            <h2 className="text-3xl font-bold text-white mb-6 text-center">Create a New Dynasty League</h2>
            
            <div className="mb-8 p-4 sm:p-6 bg-emerald-900 rounded-lg">
                <h3 className="text-2xl font-semibold mb-4 text-purple-400">General Settings</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                    <label className="block sm:col-span-2 md:col-span-3">
                        <span className="text-emerald-200">League Name</span>
                        <input type="text" placeholder="Your League's Name" value={leagueName} onChange={e => setLeagueName(e.target.value)} className="w-full p-3 mt-1 rounded-md bg-emerald-800 text-white border-emerald-600 focus:border-purple-500 focus:ring-2 focus:ring-purple-200" />
                    </label>
                    <label className="block">
                        <span className="text-emerald-200">Number of Teams</span>
                        <select value={numTeams} onChange={e => setNumTeams(e.target.value)} className="w-full p-3 mt-1 rounded-md bg-emerald-800 text-white border-emerald-600 focus:border-purple-500 focus:ring-2 focus:ring-purple-200">
                            {[4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24].map(n => <option key={n} value={n}>{n} Teams</option>)}
                        </select>
                    </label>
                    <label className="block">
                        <span className="text-emerald-200">Regular Season Weeks</span>
                        <select value={numWeeks} onChange={e => setNumWeeks(e.target.value)} className="w-full p-3 mt-1 rounded-md bg-emerald-800 text-white border-emerald-600 focus:border-purple-500 focus:ring-2 focus:ring-purple-200">
                            {[4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(n => <option key={n} value={n}>{n} Weeks</option>)}
                        </select>
                    </label>
                    <label className="block">
                        <span className="text-emerald-200">Playoff Weeks</span>
                        <select value={playoffWeeks} onChange={e => setPlayoffWeeks(e.target.value)} className="w-full p-3 mt-1 rounded-md bg-emerald-800 text-white border-emerald-600 focus:border-purple-500 focus:ring-2 focus:ring-purple-200">
                            {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n} Weeks</option>)}
                        </select>
                    </label>
                    <label className="block">
                        <span className="text-emerald-200">Team Salary Cap</span>
                        <input type="number" max="5000" value={teamSalary} onChange={e => setTeamSalary(e.target.value)} disabled={!useTeamSalaryCap} className="w-full p-3 mt-1 rounded-md bg-emerald-800 text-white border-emerald-600 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 disabled:opacity-50" />
                    </label>
                    <label className="block">
                        <span className="text-emerald-200">Players to Drop</span>
                        <input type="number" value={playersToDrop} onChange={e => setPlayersToDrop(e.target.value)} className="w-full p-3 mt-1 rounded-md bg-emerald-800 text-white border-emerald-600 focus:border-purple-500 focus:ring-2 focus:ring-purple-200" />
                    </label>
                    <label className="block">
                        <span className="text-emerald-200">Salary Raise %</span>
                        <input type="number" value={salaryRaisePercentage} onChange={e => setSalaryRaisePercentage(e.target.value)} disabled={!usePlayerSalaries} className="w-full p-3 mt-1 rounded-md bg-emerald-800 text-white border-emerald-600 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 disabled:opacity-50" />
                    </label>
                    <label className="block">
                        <span className="text-emerald-200">Min Player Salary</span>
                        <input type="number" value={minPlayerSalary} onChange={e => setMinPlayerSalary(e.target.value)} min="0.5" max="10" step="0.01" disabled={!usePlayerSalaries} className="w-full p-3 mt-1 rounded-md bg-emerald-800 text-white border-emerald-600 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 disabled:opacity-50" />
                    </label>
                    <label className="block">
                        <span className="text-emerald-200">Draft Type</span>
                        <select value={draftType} onChange={e => setDraftType(e.target.value)} className="w-full p-3 mt-1 rounded-md bg-emerald-800 text-white border-emerald-600 focus:border-purple-500 focus:ring-2 focus:ring-purple-200">
                            <option value="auction">Auction</option>
                            <option value="standard">Standard</option>
                            <option value="snake">Snake</option>
                        </select>
                    </label>
                    <div className="sm:col-span-2 md:col-span-3">
                        <label className="flex items-center space-x-3 cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={useTeamSalaryCap} 
                                onChange={(e) => setUseTeamSalaryCap(e.target.checked)} 
                                className="form-checkbox h-5 w-5 bg-emerald-100 border-emerald-300 rounded text-purple-500 focus:ring-purple-500"
                            />
                            <span className="text-emerald-200">Enable Team Salary Cap</span>
                        </label>
                    </div>
                    <div className="sm:col-span-2 md:col-span-3">
                        <label className="flex items-center space-x-3 cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={usePlayerSalaries} 
                                onChange={(e) => setUsePlayerSalaries(e.target.checked)} 
                                className="form-checkbox h-5 w-5 bg-emerald-100 border-emerald-300 rounded text-purple-500 focus:ring-purple-500"
                            />
                            <span className="text-emerald-200">Enable Player Salaries</span>
                        </label>
                    </div>
                    <div className="sm:col-span-2 md:col-span-3">
                        <label className="flex items-center space-x-3 cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={divisionsEnabled} 
                                onChange={(e) => setDivisionsEnabled(e.target.checked)} 
                                className="form-checkbox h-5 w-5 bg-emerald-100 border-emerald-300 rounded text-purple-500 focus:ring-purple-500"
                            />
                            <span className="text-emerald-200">Enable Divisions</span>
                        </label>
                    </div>
                </div>

                <RosterConfiguration
                    defenseFormat={defenseFormat}
                    onDefenseFormatChange={setDefenseFormat}
                    offenseSlots={offenseSlots}
                    onOffenseSlotChange={handleOffenseSlotChange}
                    idpSlots={idpSlots}
                    onIdpSlotChange={handleIdpSlotChange}
                    dstSlots={dstSlots}
                    onDstSlotChange={handleDstSlotChange}
                    rosterLimits={rosterLimits}
                    onRosterLimitChange={(pos, value) => setRosterLimits((prev) => ({ ...prev, [pos]: value }))}
                    variant="create"
                    embedded
                />
            </div>

            {divisionsEnabled && (
                <div className="mb-8 p-4 sm:p-6 bg-emerald-900 rounded-lg">
                    <h3 className="text-2xl font-semibold mb-4 text-yellow-400">Divisions</h3>
                    <div className="space-y-4">
                        {divisions.map((division, index) => (
                            <div key={index} className="flex items-center gap-4">
                                <input type="text" value={division.name} onChange={(e) => handleDivisionNameChange(index, e.target.value)} className="w-full p-2 rounded-md bg-emerald-800 text-white border-emerald-600 focus:border-purple-500 focus:ring-2 focus:ring-purple-200" />
                                {divisions.length > 2 && <button onClick={() => removeDivision(index)} className="px-3 py-2 bg-red-600 hover:bg-red-700 rounded-md">-</button>}
                            </div>
                        ))}
                    </div>
                                            {divisions.length < 4 && <button onClick={addDivision} className="mt-4 px-4 py-2 bg-purple-800 hover:bg-purple-900 rounded-md">Add Division</button>}
                </div>
            )}

            <div className="mb-8 p-4 sm:p-6 bg-emerald-900 rounded-lg">
                <h3 className="text-2xl font-semibold mb-4 text-emerald-400">Scoring Rules</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    <div>
                        <h4 className="text-xl font-bold mb-3 text-emerald-200 border-b border-emerald-600 pb-2">Offense</h4>
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
                        <h4 className="text-xl font-bold mb-3 text-emerald-200 border-b border-emerald-600 pb-2">Kicking</h4>
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            {renderScoringInput('Extra Point Made', 'extraPoint')}
                            {renderScoringInput('FG Made (0-39 yds)', 'fg39Less')}
                            {renderScoringInput('FG Made (40-49 yds)', 'fg40_49')}
                            {renderScoringInput('FG Made (50+ yds)', 'fg50Plus')}
                            {renderScoringInput('Missed FG/EP', 'missedFgEp')}
                        </div>
                        <h4 className="text-xl font-bold mb-3 text-emerald-200 border-b border-emerald-600 pb-2">Defense & ST</h4>
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
            
            <div className="flex justify-end gap-4 mt-8">
                <button onClick={onCancel} className="px-8 py-3 bg-emerald-800 hover:bg-emerald-700 font-bold rounded-md">Cancel</button>
                <button onClick={handleCreateLeague} disabled={isLoading} className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 font-bold rounded-md disabled:opacity-50">
                    {isLoading ? 'Creating...' : 'Create League'}
                </button>
            </div>
        </div>
    );
}; 