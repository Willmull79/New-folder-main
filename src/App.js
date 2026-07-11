import React, { useState, useEffect, Suspense } from 'react';
import { useFirebase } from './contexts/FirebaseContext.js';
import { AuthScreen } from './components/AuthScreen.js';
import { LeagueSelector } from './components/LeagueSelector.js';
import { Avatar } from './components/Avatar.js';
import { AppNavigation } from './components/AppNavigation.js';
import nflPlayerService from './utils/nflPlayerService.js';
import draftService from './utils/draftService.js';
import { appId } from './config/firebase.js';

// Lazy load components to reduce initial bundle size
const Roster = React.lazy(() => import('./components/Roster.js').then(module => ({ default: module.Roster })));
const DraftCenter = React.lazy(() => import('./components/DraftCenter.js'));
const TradeCenter = React.lazy(() => import('./components/TradeCenter.js').then(module => ({ default: module.TradeCenter })));
const WaiverWire = React.lazy(() => import('./components/WaiverWire.js').then(module => ({ default: module.WaiverWire })));
const Standings = React.lazy(() => import('./components/Standings.js'));
const LiveScores = React.lazy(() => import('./components/LiveScores.js'));
const CommissionerTools = React.lazy(() => import('./components/CommissionerTools.js').then(module => ({ default: module.CommissionerTools })));

// Loading component for lazy-loaded components
const LoadingSpinner = () => (
    <div className="flex items-center justify-center pt-20">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-purple-500"></div>
    </div>
);

const App = () => {
    const { db, userId, isAuthReady, isFirebaseReady, firebaseError, auth, userDisplayName, userAvatarUrl } = useFirebase();
    const [activeTab, setActiveTab] = useState('leagues');
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState('');
    const [currentLeagueId, setCurrentLeagueId] = useState(null);
    const [currentTeamId, setCurrentTeamId] = useState(null);
    const [currentLeague, setCurrentLeague] = useState(null);
    const [currentTeam, setCurrentTeam] = useState(null);
    const [teamsData, setTeamsData] = useState([]);
    const [allPlayers, setAllPlayers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const isLoadingData = (currentLeagueId && !currentLeague) || (currentTeamId && !currentTeam);
    const isCommissioner = currentLeague?.commissionerId === userId;

    useEffect(() => {
        if (!db || !currentLeague?.teams) {
            setTeamsData([]);
            return;
        };
        
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

    const showMessage = (msg, type = 'success') => {
        setMessage(msg);
        setMessageType(type);
        setTimeout(() => { setMessage(''); setMessageType(''); }, 4000);
    };

    const handleLeagueSelected = (leagueId, teamId) => {
        setCurrentLeagueId(leagueId);
        setCurrentTeamId(teamId);
        setActiveTab('roster');
    };
    
    const handleLeaveLeague = () => {
        setCurrentLeagueId(null);
        setCurrentTeamId(null);
        setCurrentLeague(null);
        setCurrentTeam(null);
        setActiveTab('leagues');
    };

    useEffect(() => {
        if (!db || !currentLeagueId) {
            setCurrentLeague(null);
            return;
        }
        const unsubscribe = db.doc(`leagues/${currentLeagueId}`).onSnapshot(doc => {
            if (doc.exists) {
                setCurrentLeague({ id: doc.id, ...doc.data() });
            } else {
                if (currentLeagueId) {
                    handleLeaveLeague();
                    showMessage("The league you were in no longer exists.", "error");
                }
            }
        }, (error) => {
            console.error("Error fetching current league:", error);
            showMessage("Error loading league data.", "error");
        });
        return () => unsubscribe();
    }, [db, currentLeagueId]);

    useEffect(() => {
        if (!db || !currentTeamId) {
            setCurrentTeam(null);
            return;
        }
        const unsubscribe = db.doc(`leagues/${currentLeagueId}/teams/${currentTeamId}`).onSnapshot(doc => {
            if (doc.exists) {
                setCurrentTeam({ id: doc.id, ...doc.data() });
            } else {
                if (currentTeamId) {
                    handleLeaveLeague();
                    showMessage("Your team in this league was deleted.", "error");
                }
            }
        }, (error) => {
            console.error("Error fetching current team:", error);
            showMessage("Error loading team data.", "error");
        });
        return () => unsubscribe();
    }, [db, currentTeamId]);

    useEffect(() => {
        if (db) {
            draftService.setFirestore(db);
        }
    }, [db]);

    useEffect(() => {
        if (allPlayers.length) {
            draftService.setPlayerPool(allPlayers);
        }
    }, [allPlayers]);

    // Load all players when component mounts
    useEffect(() => {
        const loadPlayers = async () => {
            try {
                const players = await nflPlayerService.getAllPlayers();
                setAllPlayers(players);
            } catch (error) {
                console.error('Error loading players:', error);
                showMessage('Error loading player data', 'error');
            }
        };
        
        loadPlayers();
    }, []);

    const handlePlayerTransaction = () => {};

    if (!isAuthReady || (!isFirebaseReady && !firebaseError)) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-4">
                <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-purple-500"></div>
                <p className="text-gray-400">Loading Fantasy Dynasty Central...</p>
            </div>
        );
    }

    if (!userId) {
        return <AuthScreen showMessage={showMessage} />;
    }
    
    return (
        <div className="min-h-screen min-h-[100dvh] text-gray-100 p-3 sm:p-6 lg:p-8 mobile-safe-top overflow-x-hidden">
            <header className="bg-emerald-950 p-3 sm:p-4 rounded-lg shadow-md mb-4 sm:mb-8 flex flex-col sm:flex-row justify-between items-center text-center sm:text-left gap-3">
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-red-700 text-center leading-tight">
                    Dynasty League Central
                </h1>
                <div className="flex items-center gap-3 sm:gap-4 flex-wrap justify-center">
                    <div className="text-center sm:text-right">
                        <span className="text-emerald-300 text-sm">Welcome,</span>
                        <p className="font-bold text-purple-300 truncate max-w-[10rem] sm:max-w-none">
                            {userDisplayName || 'User'}
                        </p>
                    </div>
                    <Avatar
                        docRefPath={`artifacts/${appId}/users/${userId}/userProfile/settings`}
                        storagePath={`user-avatars/${userId}`}
                        currentAvatarUrl={userAvatarUrl}
                        showMessage={showMessage}
                        size="h-12 w-12"
                    />
                    <button
                        type="button"
                        onClick={() => auth.signOut()}
                        className="px-4 py-2 bg-purple-800 hover:bg-purple-900 text-white text-sm rounded-md transition duration-200 touch-target"
                    >
                        Logout
                    </button>
                </div>
            </header>

            {message && (
                <div
                    className={`fixed top-3 left-3 right-3 sm:left-auto sm:right-5 sm:max-w-sm p-4 rounded-lg shadow-lg text-white z-50 text-sm sm:text-base mobile-safe-top ${
                        messageType === 'success' ? 'bg-purple-800' : 'bg-red-500'
                    }`}
                    role="status"
                >
                    {message}
                </div>
            )}

            <AppNavigation
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                showLeagueTabs={Boolean(currentLeagueId && currentTeamId)}
                isCommissioner={isCommissioner}
            />

            <main className="mobile-page max-w-7xl mx-auto w-full">
                {isLoadingData ? (
                    <LoadingSpinner />
                ) : (
                    <>
                        {activeTab === 'leagues' && <LeagueSelector userId={userId} showMessage={showMessage} userDisplayName={userDisplayName} onLeagueSelected={handleLeagueSelected} />}
                        <Suspense fallback={<LoadingSpinner />}>
                            {activeTab === 'roster' && currentTeam && currentLeague && <Roster teamData={currentTeam} allPlayers={allPlayers} showMessage={showMessage} currentLeague={currentLeague} handleLeaveLeague={handleLeaveLeague} onPlayerTransaction={handlePlayerTransaction} currentTeamId={currentTeamId} />}
                            {activeTab === 'draft-center' && currentLeague && currentTeam && <DraftCenter currentLeague={currentLeague} currentTeam={currentTeam} allPlayers={allPlayers} showMessage={showMessage} currentTeamId={currentTeamId} userId={userId} />}

                            {activeTab === 'standings' && currentLeague && (
                                <Standings
                                    currentLeague={currentLeague}
                                    showMessage={showMessage}
                                />
                            )}
                            {activeTab === 'live-scores' && currentLeague && (
                                <LiveScores
                                    currentLeague={currentLeague}
                                    currentTeam={currentTeam}
                                    currentTeamId={currentTeamId}
                                    allPlayers={allPlayers}
                                    showMessage={showMessage}
                                />
                            )}
                            {activeTab === 'waiver-wire' && currentLeague && currentTeam && (
                                <WaiverWire
                                    currentLeague={currentLeague}
                                    currentTeam={currentTeam}
                                    allPlayers={allPlayers}
                                    showMessage={showMessage}
                                    currentTeamId={currentTeamId}
                                />
                            )}
                            {activeTab === 'trade' && (
                                <div>
                                    {currentLeague && currentTeam ? (
                                        <TradeCenter currentLeague={currentLeague} currentTeam={currentTeam} allPlayers={allPlayers} showMessage={showMessage} currentTeamId={currentTeamId} />
                                    ) : (
                                        <div className="text-center text-white">
                                            <h2 className="text-2xl font-bold mb-4">Trade Center</h2>
                                            <p className="text-gray-300">Loading data...</p>
                                            <p className="text-sm text-gray-400">League: {currentLeague ? 'Loaded' : 'Loading...'}</p>
                                            <p className="text-sm text-gray-400">Team: {currentTeam ? 'Loaded' : 'Loading...'}</p>
                                        </div>
                                    )}
                                </div>
                            )}
                            {activeTab === 'commissioner' && currentLeague && isCommissioner && (
                                <CommissionerTools
                                    currentLeague={currentLeague}
                                    currentTeam={currentTeam}
                                    showMessage={showMessage}
                                    onLeagueUpdate={(updatedLeague) => {
                                        if (updatedLeague?.id) {
                                            setCurrentLeague(updatedLeague);
                                        }
                                    }}
                                />
                            )}
                        </Suspense>
                    </>
                )}
            </main>
        </div>
    );
};

export default App; 