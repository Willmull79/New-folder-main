import React, { useState, useEffect } from 'react';
import { useFirebase } from '../contexts/FirebaseContext';
import { appId } from '../config/firebase.js';

const Standings = ({ currentLeague, showMessage }) => {
    const { db } = useFirebase();
    const [teamsData, setTeamsData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!db || !currentLeague?.teams) {
            setTeamsData([]);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        const unsubscribes = currentLeague.teams.map(teamId => {
            return db.doc(`artifacts/${appId}/public/data/teams/${teamId}`).onSnapshot(doc => {
                if (doc.exists) {
                    setTeamsData(prev => {
                        const newTeams = prev.filter(t => t.id !== doc.id);
                        return [...newTeams, { id: doc.id, ...doc.data() }];
                    });
                }
            }, error => {
                console.error("Team data listener error:", error);
                showMessage("Error loading team data.", "error");
            });
        });

        // Set loading to false after a short delay to ensure data is loaded
        const timer = setTimeout(() => setIsLoading(false), 1000);

        return () => {
            unsubscribes.forEach(unsub => unsub());
            clearTimeout(timer);
        };
    }, [db, currentLeague, showMessage]);

    // Calculate standings data
    const calculateStandings = () => {
        return teamsData.map(team => {
            const wins = team.wins || 0;
            const losses = team.losses || 0;
            const ties = team.ties || 0;
            const pointsFor = team.pointsFor || 0;
            const pointsAgainst = team.pointsAgainst || 0;
            
            return {
                ...team,
                wins,
                losses,
                ties,
                pointsFor,
                pointsAgainst,
                winPercentage: wins + losses + ties > 0 ? (wins + (ties * 0.5)) / (wins + losses + ties) : 0
            };
        }).sort((a, b) => {
            // Sort by win percentage first, then by points for
            if (b.winPercentage !== a.winPercentage) {
                return b.winPercentage - a.winPercentage;
            }
            return b.pointsFor - a.pointsFor;
        });
    };

    const standings = calculateStandings();

    if (isLoading) {
        return (
            <div className="flex items-center justify-center pt-20">
                <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-purple-500"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="bg-emerald-950 p-6 rounded-lg shadow-md">
                <h2 className="text-3xl font-bold text-emerald-200 mb-6 text-center">
                    {currentLeague?.name} - League Standings
                </h2>
                
                {standings.length === 0 ? (
                    <div className="text-center text-emerald-300 py-8">
                        <p className="text-lg">No teams found in this league.</p>
                        <p className="text-sm text-emerald-400 mt-2">Teams will appear here once they join the league.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full bg-emerald-900 rounded-lg shadow-lg">
                            <thead>
                                <tr className="bg-emerald-800 text-emerald-200">
                                    <th className="py-4 px-6 text-left font-bold text-lg">Team</th>
                                    <th className="py-4 px-6 text-center font-bold text-lg">Record</th>
                                    <th className="py-4 px-6 text-center font-bold text-lg">Points For</th>
                                    <th className="py-4 px-6 text-center font-bold text-lg">Points Against</th>
                                </tr>
                            </thead>
                            <tbody className="text-emerald-100">
                                {standings.map((team, index) => (
                                    <tr 
                                        key={team.id} 
                                        className={`border-b border-emerald-700 hover:bg-emerald-800 transition-colors ${
                                            index === 0 ? 'bg-purple-900' : ''
                                        }`}
                                    >
                                        <td className="py-4 px-6 text-left">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                                    index === 0 ? 'bg-yellow-500 text-yellow-900' : 
                                                    index === 1 ? 'bg-gray-400 text-gray-900' : 
                                                    index === 2 ? 'bg-orange-600 text-orange-100' : 
                                                    'bg-emerald-700 text-emerald-200'
                                                }`}>
                                                    {index + 1}
                                                </div>
                                                <div>
                                                    <div className="font-semibold text-lg">{team.teamName}</div>
                                                    <div className="text-sm text-emerald-300">
                                                        {team.ownerName || 'Unknown Owner'}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-4 px-6 text-center">
                                            <div className="text-xl font-bold">
                                                {team.wins}-{team.losses}
                                                {team.ties > 0 && `-${team.ties}`}
                                            </div>
                                            <div className="text-sm text-emerald-300">
                                                {((team.winPercentage * 100).toFixed(1))}%
                                            </div>
                                        </td>
                                        <td className="py-4 px-6 text-center">
                                            <div className="text-xl font-bold text-green-300">
                                                {team.pointsFor.toFixed(1)}
                                            </div>
                                            <div className="text-sm text-emerald-300">
                                                Avg: {(team.pointsFor / Math.max(team.wins + team.losses + team.ties, 1)).toFixed(1)}
                                            </div>
                                        </td>
                                        <td className="py-4 px-6 text-center">
                                            <div className="text-xl font-bold text-red-300">
                                                {team.pointsAgainst.toFixed(1)}
                                            </div>
                                            <div className="text-sm text-emerald-300">
                                                Avg: {(team.pointsAgainst / Math.max(team.wins + team.losses + team.ties, 1)).toFixed(1)}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* League Info */}
            <div className="bg-emerald-950 p-4 rounded-lg shadow-md">
                <h3 className="text-xl font-bold text-emerald-200 mb-3">League Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="bg-emerald-900 p-3 rounded">
                        <span className="text-emerald-300">Total Teams:</span>
                        <span className="ml-2 font-bold text-emerald-100">{standings.length}</span>
                    </div>
                    <div className="bg-emerald-900 p-3 rounded">
                        <span className="text-emerald-300">League Type:</span>
                        <span className="ml-2 font-bold text-emerald-100">
                            {currentLeague?.settings?.draftType === 'auction' ? 'Auction' : 
                             currentLeague?.settings?.draftType === 'snake' ? 'Snake' : 'Standard'}
                        </span>
                    </div>
                    <div className="bg-emerald-900 p-3 rounded">
                        <span className="text-emerald-300">Commissioner:</span>
                        <span className="ml-2 font-bold text-emerald-100">
                            {currentLeague?.commissionerName || 'Unknown'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Standings; 