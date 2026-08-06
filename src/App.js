import React, { useState, useEffect, useRef, Suspense } from 'react';
import {
    collection,
    doc,
    limit,
    onSnapshot,
    query,
    updateDoc,
    where,
} from 'firebase/firestore';
import { useFirebase } from './contexts/FirebaseContext.js';
import { getModularFirestore } from './config/firebaseModular.js';
import { LandingPage } from './components/LandingPage.js';
import { LeagueSelector } from './components/LeagueSelector.js';
import { Avatar } from './components/Avatar.js';
import { AppNavigation } from './components/AppNavigation.js';
import nflPlayerService, {
    fetchPlayersFromFirestore,
    readPlayersFromCache,
    writePlayersToCache,
} from './utils/nflPlayerService.js';
import draftService from './utils/draftService.js';
import { appId } from './config/firebase.js';
import { isLeagueCommissioner } from './constants/leagueDefaults.js';
import {
    capturePendingInviteFromUrl,
    clearAllInviteState,
    clearInviteLoginGate,
    getPendingInviteLeagueId,
    hasPendingInvite,
    inviteRequiresLogin,
    joinLeagueAsUser,
} from './utils/leagueInvite.js';
import {
    NOTIFICATION_TYPES,
    defaultNotificationToast,
} from './utils/leagueNotifications.js';
import {
    clearPendingSubscribe,
    goToSubscribePath,
    hasPendingSubscribe,
    isSubscribePath,
} from './utils/subscribeGate.js';
import { SubscribePage } from './components/SubscribePage.js';

// Capture invite before first paint / auth routing
capturePendingInviteFromUrl();

// Lazy load components to reduce initial bundle size
const Roster = React.lazy(() => import('./components/Roster.js').then(module => ({ default: module.Roster })));
const DraftCenter = React.lazy(() => import('./components/DraftCenter.js'));
const TradeCenter = React.lazy(() => import('./components/TradeCenter.js').then(module => ({ default: module.TradeCenter })));
const WaiverWire = React.lazy(() => import('./components/WaiverWire.js').then(module => ({ default: module.WaiverWire })));
const Standings = React.lazy(() => import('./components/Standings.js'));
const Matchups = React.lazy(() => import('./components/Matchups.js').then(module => ({ default: module.Matchups })));
const LiveScores = React.lazy(() => import('./components/LiveScores.js'));
const CommissionerTools = React.lazy(() => import('./components/CommissionerTools.js').then(module => ({ default: module.CommissionerTools })));
const AccountProfile = React.lazy(() => import('./components/AccountProfile.js'));
const LeagueDues = React.lazy(() => import('./components/LeagueDues.js').then(module => ({ default: module.LeagueDues })));
const LeagueChat = React.lazy(() => import('./components/LeagueChat.js').then(module => ({ default: module.LeagueChat })));
const DirectMessages = React.lazy(() => import('./components/DirectMessages.js').then(module => ({ default: module.DirectMessages })));

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
    const [unreadTradeNotifications, setUnreadTradeNotifications] = useState([]);
    const [unreadChatNotifications, setUnreadChatNotifications] = useState([]);
    const [unreadDmNotifications, setUnreadDmNotifications] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessingInvite, setIsProcessingInvite] = useState(false);
    const [inviteLoginGate, setInviteLoginGate] = useState(false);
    const [isClearingInviteSession, setIsClearingInviteSession] = useState(false);
    const inviteProcessedRef = useRef(false);
    const inviteSignOutStartedRef = useRef(false);
    const seenNotificationIdsRef = useRef(new Set());
    const activeTabRef = useRef(activeTab);

    useEffect(() => {
        activeTabRef.current = activeTab;
    }, [activeTab]);

    const isLoadingData = (currentLeagueId && !currentLeague) || (currentTeamId && !currentTeam);
    const isCommissioner = isLeagueCommissioner(currentLeague, userId);

    const showMessage = (msg, type = 'success') => {
        setMessage(msg);
        setMessageType(type);
        setTimeout(() => { setMessage(''); setMessageType(''); }, 4000);
    };

    // Stripe Checkout / Portal return: ?billing=success|cancel|manage
    useEffect(() => {
        if (!isAuthReady || !userId) return undefined;

        const params = new URLSearchParams(window.location.search);
        const billing = params.get('billing');
        if (!billing) return undefined;

        if (billing === 'success') {
            clearPendingSubscribe();
            setActiveTab('leagues');
            showMessage('Subscription updated. It may take a moment to reflect.', 'success');
            params.delete('billing');
            params.delete('session_id');
            window.history.replaceState({}, '', `/${params.toString() ? `?${params}` : ''}`);
        } else if (billing === 'cancel') {
            showMessage('Checkout canceled — no charge was made.', 'error');
            goToSubscribePath();
        } else {
            setActiveTab('profile');
            params.delete('billing');
            params.delete('session_id');
            const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`;
            window.history.replaceState({}, '', next);
        }
        return undefined;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthReady, userId]);

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
        seenNotificationIdsRef.current = new Set();
        setUnreadTradeNotifications([]);
        setUnreadChatNotifications([]);
        setUnreadDmNotifications([]);

        if (!currentLeagueId || !userId) return undefined;

        const modularDb = getModularFirestore();
        const notificationsQuery = query(
            collection(modularDb, 'leagues', currentLeagueId, 'notifications'),
            where('recipientUserId', '==', userId),
            limit(50)
        );

        return onSnapshot(notificationsQuery, (snapshot) => {
            const unread = snapshot.docs
                .map((notificationDoc) => ({ id: notificationDoc.id, ...notificationDoc.data() }))
                .filter((notification) => !notification.read);

            const tradeUnread = unread.filter((n) => n.type === NOTIFICATION_TYPES.TRADE_PROPOSED);
            const chatUnread = unread.filter((n) => n.type === NOTIFICATION_TYPES.LEAGUE_CHAT);
            const dmUnread = unread.filter((n) => n.type === NOTIFICATION_TYPES.DIRECT_MESSAGE);

            setUnreadTradeNotifications(tradeUnread);
            setUnreadChatNotifications(chatUnread);
            setUnreadDmNotifications(dmUnread);

            const newNotification = unread.find(
                (notification) => !seenNotificationIdsRef.current.has(notification.id)
            );
            unread.forEach((notification) => {
                seenNotificationIdsRef.current.add(notification.id);
            });

            if (newNotification) {
                const tabForType = {
                    [NOTIFICATION_TYPES.TRADE_PROPOSED]: 'trade',
                    [NOTIFICATION_TYPES.LEAGUE_CHAT]: 'league-chat',
                    [NOTIFICATION_TYPES.DIRECT_MESSAGE]: 'direct-messages',
                }[newNotification.type];
                if (tabForType && tabForType === activeTabRef.current) {
                    return;
                }
                setMessage(defaultNotificationToast(newNotification));
                setMessageType('success');
                setTimeout(() => {
                    setMessage('');
                    setMessageType('');
                }, 6000);
            }
        }, (error) => {
            console.error('Error listening for league notifications:', error);
        });
    }, [currentLeagueId, userId]);

    useEffect(() => {
        if (!currentLeagueId) return;

        let toMark = [];
        if (activeTab === 'trade') {
            toMark = unreadTradeNotifications;
        } else if (activeTab === 'league-chat') {
            toMark = unreadChatNotifications;
        } else if (activeTab === 'direct-messages') {
            toMark = unreadDmNotifications;
        }

        if (!toMark.length) return;

        const modularDb = getModularFirestore();
        Promise.all(toMark.map((notification) => (
            updateDoc(
                doc(modularDb, 'leagues', currentLeagueId, 'notifications', notification.id),
                { read: true }
            )
        ))).catch((error) => {
            console.error('Error marking notifications read:', error);
        });
    }, [
        activeTab,
        currentLeagueId,
        unreadTradeNotifications,
        unreadChatNotifications,
        unreadDmNotifications,
    ]);

    // Re-capture invite on mount; pause league UI until invite is resolved
    useEffect(() => {
        const captured = capturePendingInviteFromUrl();
        if (captured || hasPendingInvite() || inviteRequiresLogin()) {
            inviteProcessedRef.current = false;
            inviteSignOutStartedRef.current = false;
            setCurrentLeagueId(null);
            setCurrentTeamId(null);
            setCurrentLeague(null);
            setCurrentTeam(null);
            setActiveTab('leagues');
        }
    }, []);

    // Logged-out invitees → AuthScreen. Already logged-in users keep their session and process the invite.
    useEffect(() => {
        if (!isAuthReady) return undefined;
        if (!hasPendingInvite() && !inviteRequiresLogin()) return undefined;

        if (!auth?.currentUser) {
            setInviteLoginGate(true);
            return undefined;
        }

        // Already authenticated — do not force logout / re-login for invite links
        clearInviteLoginGate();
        setInviteLoginGate(false);
        setIsClearingInviteSession(false);
        return undefined;
    }, [isAuthReady, auth, userId]);

    // After auth succeeds, reset invite processing for this session when user logs back in with a new invite
    useEffect(() => {
        if (!userId) {
            inviteProcessedRef.current = false;
        }
    }, [userId]);

    // Process pending invite once authenticated: existing members → dashboard; newcomers → join then dashboard
    useEffect(() => {
        if (!isAuthReady || !userId || !db || !auth?.currentUser) return undefined;
        if (inviteLoginGate || isClearingInviteSession) return undefined;
        if (inviteProcessedRef.current) return undefined;

        const pendingId = getPendingInviteLeagueId();
        if (!pendingId) return undefined;

        let cancelled = false;
        inviteProcessedRef.current = true;
        setIsProcessingInvite(true);

        const processInvite = async () => {
            try {
                const result = await joinLeagueAsUser({
                    db,
                    leagueId: pendingId,
                    userId,
                    userDisplayName,
                });
                if (cancelled) return;

                // Always clear pending invite before routing
                clearAllInviteState();
                handleLeagueSelected(result.leagueId, result.teamId);

                if (result.alreadyMember) {
                    showMessage('You are already in this league!', 'success');
                } else {
                    showMessage(`Successfully joined "${result.leagueName}"!`, 'success');
                }
            } catch (error) {
                console.error('Error processing league invite:', error);
                if (!cancelled) {
                    clearAllInviteState();
                    showMessage(error?.message || 'Could not join the invited league.', 'error');
                    setActiveTab('leagues');
                }
            } finally {
                if (!cancelled) {
                    setIsProcessingInvite(false);
                }
            }
        };

        processInvite();
        return () => {
            cancelled = true;
        };
    }, [isAuthReady, userId, db, userDisplayName, auth, inviteLoginGate, isClearingInviteSession]);

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
            nflPlayerService.setFirebaseDB(db);
        }
    }, [db]);

    useEffect(() => {
        if (allPlayers.length) {
            draftService.setPlayerPool(allPlayers);
        }
    }, [allPlayers]);

    // Master NFL rankings: 30-min localStorage cache, else one doc read (rankings/master_list)
    useEffect(() => {
        if (!db) return undefined;

        let cancelled = false;

        const loadPlayers = async () => {
            try {
                const cached = readPlayersFromCache();
                if (cached?.players?.length) {
                    if (!cancelled) {
                        setAllPlayers(cached.players);
                    }
                    return;
                }

                const firestorePlayers = await fetchPlayersFromFirestore(db);
                if (firestorePlayers.length) {
                    writePlayersToCache(firestorePlayers);
                    if (!cancelled) {
                        setAllPlayers(firestorePlayers);
                    }
                    return;
                }

                // Fallback if rankings/master_list is empty
                const players = await nflPlayerService.getAllPlayers({ forceRefresh: true });
                if (!cancelled) {
                    setAllPlayers(players);
                }
            } catch (error) {
                console.error('Error loading players:', error);
                try {
                    const players = await nflPlayerService.getAllPlayers();
                    if (!cancelled) {
                        setAllPlayers(players);
                    }
                } catch (fallbackError) {
                    console.error('Fallback player load failed:', fallbackError);
                    showMessage('Error loading player data', 'error');
                }
            }
        };

        loadPlayers();
        return () => {
            cancelled = true;
        };
    }, [db]);

    const handlePlayerTransaction = () => {};

    if (!isAuthReady || (!isFirebaseReady && !firebaseError)) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-4">
                <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-purple-500"></div>
                <p className="text-gray-400">Loading Fantasy Dynasty Central...</p>
            </div>
        );
    }

    // Public landing (Stripe website verification) + auth for logged-out users
    if (!userId || !auth?.currentUser || inviteLoginGate) {
        return (
            <LandingPage
                showMessage={showMessage}
                hasPendingInvite={hasPendingInvite() || inviteLoginGate}
                forceAuth={Boolean(inviteLoginGate || hasPendingInvite())}
                onAuthSuccess={({ registered } = {}) => {
                    clearInviteLoginGate();
                    setInviteLoginGate(false);
                    inviteSignOutStartedRef.current = false;
                    if (registered) {
                        goToSubscribePath();
                    }
                }}
            />
        );
    }

    // New registrations go to subscribe/pricing before the main app
    if (hasPendingSubscribe() || isSubscribePath()) {
        return <SubscribePage showMessage={showMessage} />;
    }

    if (isProcessingInvite) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-4">
                <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-purple-500"></div>
                <p className="text-gray-400">Joining your invited league...</p>
            </div>
        );
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
                        editable={false}
                    />
                    <div className="flex flex-col gap-2">
                        <button
                            type="button"
                            onClick={() => auth.signOut()}
                            className="px-4 py-2 bg-purple-800 hover:bg-purple-900 text-white text-sm rounded-md transition duration-200 touch-target"
                        >
                            Logout
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('profile')}
                            className={`px-4 py-2 text-sm rounded-md transition duration-200 touch-target ${
                                activeTab === 'profile'
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-emerald-800 hover:bg-emerald-700 text-emerald-100'
                            }`}
                        >
                            Profile
                        </button>
                    </div>
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
                unreadTradeCount={unreadTradeNotifications.length}
                unreadChatCount={unreadChatNotifications.length}
                unreadDmCount={unreadDmNotifications.length}
            />

            <main className="mobile-page max-w-7xl mx-auto w-full">
                {isLoadingData ? (
                    <LoadingSpinner />
                ) : (
                    <>
                        {activeTab === 'leagues' && (
                            <LeagueSelector
                                userId={userId}
                                showMessage={showMessage}
                                userDisplayName={userDisplayName}
                                onLeagueSelected={handleLeagueSelected}
                            />
                        )}
                        {activeTab === 'profile' && (
                            <Suspense fallback={<LoadingSpinner />}>
                                <AccountProfile showMessage={showMessage} />
                            </Suspense>
                        )}
                        <Suspense fallback={<LoadingSpinner />}>
                            {activeTab === 'roster' && currentTeam && currentLeague && <Roster teamData={currentTeam} allPlayers={allPlayers} showMessage={showMessage} currentLeague={currentLeague} handleLeaveLeague={handleLeaveLeague} onPlayerTransaction={handlePlayerTransaction} currentTeamId={currentTeamId} />}
                            {activeTab === 'draft-center' && currentLeague && currentTeam && <DraftCenter currentLeague={currentLeague} currentTeam={currentTeam} allPlayers={allPlayers} showMessage={showMessage} currentTeamId={currentTeamId} userId={userId} />}

                            {activeTab === 'standings' && currentLeague && (
                                <Standings
                                    currentLeague={currentLeague}
                                    showMessage={showMessage}
                                />
                            )}
                            {activeTab === 'matchups' && currentLeague && (
                                <Matchups
                                    currentLeague={currentLeague}
                                    currentTeam={currentTeam}
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
                            {activeTab === 'league-dues' && currentLeague && (
                                <LeagueDues
                                    currentLeague={currentLeague}
                                    showMessage={showMessage}
                                    userId={userId}
                                />
                            )}
                            {activeTab === 'league-chat' && currentLeague && (
                                <LeagueChat
                                    leagueId={currentLeague.id}
                                    senderId={userId}
                                    senderName={userDisplayName}
                                    teamsData={teamsData}
                                />
                            )}
                            {activeTab === 'direct-messages' && currentLeague && (
                                <DirectMessages
                                    currentUserId={userId}
                                    currentUserDisplayName={userDisplayName}
                                    teamsData={teamsData}
                                    leagueId={currentLeague.id}
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
                                    allPlayers={allPlayers}
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