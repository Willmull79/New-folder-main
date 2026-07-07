import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useFirebase } from '../contexts/FirebaseContext.js';
import { appId } from '../config/firebase.js';
import nflPlayerService from '../utils/nflPlayerService.js';
import draftService from '../utils/draftService.js';
import { playTurnNotification } from '../utils/turnNotificationSound.js';
import { ConfirmationModal } from './ConfirmationModal.js';
import { SleeperPlayerList } from './SleeperPlayerList.js';
import {
    PICK_TIME_OPTIONS,
    DRAFT_FORMAT_OPTIONS,
    MAX_ROUNDS,
    MIN_ROUNDS,
    generatePickOrder,
    formatPickTimeLabel
} from '../utils/draftOrderUtils.js';

const DraftCenter = ({ currentLeague, currentTeam, allPlayers, showMessage, currentTeamId, userId }) => {
    const { db } = useFirebase();
    const [activeTab, setActiveTab] = useState('draft-board');
    const [draftData, setDraftData] = useState(null);
    const [teamsData, setTeamsData] = useState([]);
    const [allNFLPlayers, setAllNFLPlayers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [draftBoard, setDraftBoard] = useState(Array(MAX_ROUNDS).fill(null));
    const [showDraftBoard, setShowDraftBoard] = useState(true);
    const [draggedPlayer, setDraggedPlayer] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const [playerSearchQuery, setPlayerSearchQuery] = useState('');
    const [filteredPlayers, setFilteredPlayers] = useState([]);

    // Draft Room States
    const [timeRemaining, setTimeRemaining] = useState(0);
    const [isMyTurn, setIsMyTurn] = useState(false);
    const [currentPick, setCurrentPick] = useState(null);
    const [availablePlayers, setAvailablePlayers] = useState([]);
    const [draftOrder, setDraftOrder] = useState([]);
    const [currentBid, setCurrentBid] = useState(null);
    const [auctionPlayer, setAuctionPlayer] = useState(null);
    const [bidAmount, setBidAmount] = useState(1);
    const [isAuctionActive, setIsAuctionActive] = useState(false);
    
    // Enhanced Draft Room States
    const [draftTimerState, setDraftTimerState] = useState(null);
    const [picksUntilMyTurn, setPicksUntilMyTurn] = useState(0);
    const [draftScheduledTime, setDraftScheduledTime] = useState(null);
    const [isOnClock, setIsOnClock] = useState(false);
    const [draftStatus, setDraftStatus] = useState('pending');
    
    // Draft Configuration State (Commissioner Only)
    const [draftDateTime, setDraftDateTime] = useState('');
    const [draftOrderType, setDraftOrderType] = useState('random');
    const [manualDraftOrder, setManualDraftOrder] = useState([]);
    const [showDraftConfig, setShowDraftConfig] = useState(false);
    const [draftFormat, setDraftFormat] = useState('standard');
    const [draftRounds, setDraftRounds] = useState(MAX_ROUNDS);
    const [pickTimeLimit, setPickTimeLimit] = useState(60);
    const [roundOneOrder, setRoundOneOrder] = useState([]);
    const [showStopModal, setShowStopModal] = useState(false);
    const [showResetModal, setShowResetModal] = useState(false);
    const [isDraftActionLoading, setIsDraftActionLoading] = useState(false);
    
    const timerRef = useRef(null);
    const countdownRef = useRef(null);
    const draftTimerIntervalRef = useRef(null);
    const prevIsMyTurnRef = useRef(false);
    const [localTimeRemaining, setLocalTimeRemaining] = useState(0);

    const isCommissioner = currentLeague?.commissionerId === userId;
    const isAuctionDraft = currentLeague?.settings?.draftType === 'auction';

    useEffect(() => {
        if (db) {
            draftService.setFirestore(db);
        }
    }, [db]);

    useEffect(() => {
        const playerSource = allNFLPlayers.length ? allNFLPlayers : allPlayers;
        if (playerSource.length) {
            draftService.setPlayerPool(playerSource);
        }
    }, [allNFLPlayers, allPlayers]);

    const playerSource = useMemo(
        () => (allNFLPlayers.length ? allNFLPlayers : allPlayers),
        [allNFLPlayers, allPlayers]
    );

    const draftablePlayers = useMemo(() => {
        if (draftStatus === 'live' && draftData?.availablePlayers?.length) {
            return draftData.availablePlayers;
        }

        const draftedIds = new Set([
            ...(draftData?.draftedPlayers || []).map((player) => player.id || player.playerId),
            ...(draftData?.picks || []).map((pick) => pick.playerId),
            ...(currentLeague?.allRosteredPlayerIds || []),
        ]);

        return playerSource.filter((player) => !draftedIds.has(player.id));
    }, [draftStatus, draftData, currentLeague, playerSource]);

    const visibleDraftPlayers = useMemo(() => {
        if (!playerSearchQuery.trim()) return draftablePlayers;
        const query = playerSearchQuery.toLowerCase();
        return draftablePlayers.filter((player) =>
            player.name.toLowerCase().includes(query)
            || player.position?.toLowerCase().includes(query)
            || player.nflTeam?.toLowerCase().includes(query)
        );
    }, [draftablePlayers, playerSearchQuery]);

    // Fetch draft data
    useEffect(() => {
        if (!db || !currentLeague?.id) return;

        const unsubscribe = db.doc(`leagues/${currentLeague.id}`).onSnapshot(doc => {
            if (doc.exists) {
                const data = doc.data();
                setDraftData(data.draft || {});
                setAvailablePlayers(data.draft?.availablePlayers || []);
                setDraftOrder(data.draft?.draftOrder || []);
                setCurrentPick(data.draft?.currentPick || null);
                setIsAuctionActive(data.draft?.status === 'active');
                setDraftScheduledTime(data.draft?.scheduledDateTime);
                setDraftStatus(data.draft?.status || 'pending');
                setIsLoading(false);
            }
        }, error => {
            console.error("Error fetching draft data:", error);
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [db, currentLeague]);

    // Turn tracking and local countdown from Firestore draft state
    useEffect(() => {
        if (draftStatus !== 'live' || !draftOrder.length) {
            setIsMyTurn(false);
            setIsOnClock(false);
            setPicksUntilMyTurn(0);
            if (draftStatus !== 'paused') {
                setLocalTimeRemaining(0);
            }
            return;
        }

        const currentPickIndex = draftData?.currentPick ?? 0;
        const onClockTeamId = draftOrder[currentPickIndex];
        const onClock = onClockTeamId === currentTeamId;

        setIsOnClock(onClock);
        setIsMyTurn(onClock);

        let picksUntil = 0;
        for (let i = currentPickIndex; i < draftOrder.length; i += 1) {
            if (draftOrder[i] === currentTeamId) {
                picksUntil = i - currentPickIndex;
                break;
            }
        }
        setPicksUntilMyTurn(picksUntil);

        setDraftTimerState({
            status: draftStatus,
            currentPick: currentPickIndex,
            currentTeamId: onClockTeamId,
            draftOrder,
            timeRemaining: localTimeRemaining,
        });
    }, [draftStatus, draftOrder, draftData?.currentPick, currentTeamId, localTimeRemaining]);

    useEffect(() => {
        if (draftStatus === 'paused') {
            setLocalTimeRemaining(draftData?.pausedTimeRemaining ?? 0);
            return undefined;
        }

        if (draftStatus !== 'live' || !draftData?.pickDeadline) {
            setLocalTimeRemaining(0);
            return undefined;
        }

        const tick = () => {
            const remaining = Math.max(
                0,
                Math.floor((new Date(draftData.pickDeadline).getTime() - Date.now()) / 1000)
            );
            setLocalTimeRemaining(remaining);
        };

        tick();
        const intervalId = setInterval(tick, 1000);
        return () => clearInterval(intervalId);
    }, [draftStatus, draftData?.pickDeadline, draftData?.currentPick, draftData?.pausedTimeRemaining]);

    useEffect(() => {
        if (isMyTurn && !prevIsMyTurnRef.current && draftStatus === 'live') {
            playTurnNotification();
        }
        prevIsMyTurnRef.current = isMyTurn;
    }, [isMyTurn, draftStatus]);

    // Auto-start trigger when scheduled time arrives
    useEffect(() => {
        if (draftScheduledTime && draftStatus === 'scheduled') {
            const scheduledTime = new Date(draftScheduledTime);
            const now = new Date();
            
            if (now >= scheduledTime) {
                console.log('Draft scheduled time has arrived - auto-start should trigger');
                // The actual auto-start is handled by Cloud Function
            }
        }
    }, [draftScheduledTime, draftStatus]);

    // Initialize draft configuration state
    useEffect(() => {
        if (currentLeague) {
            const settings = currentLeague.draft?.settings || {};
            const savedRoundOneOrder = currentLeague.draft?.roundOneOrder
                || currentLeague.draft?.customOrder
                || currentLeague.draft?.manualOrder
                || [];

            setDraftDateTime(currentLeague.draft?.scheduledDateTime || '');
            setDraftOrderType(settings.orderType || currentLeague.draft?.orderType || 'random');
            setManualDraftOrder(savedRoundOneOrder);
            setRoundOneOrder(savedRoundOneOrder);
            setDraftFormat(settings.draftFormat || currentLeague.settings?.draftType || 'standard');
            setDraftRounds(settings.rounds ?? MAX_ROUNDS);
            setPickTimeLimit(settings.pickTimeLimit ?? settings.timeLimit ?? 60);
            setDraftStatus(currentLeague.draft?.status || 'pending');
        }
    }, [currentLeague]);

    // Initialize manual draft order with current teams if empty
    useEffect(() => {
        if (draftOrderType === 'manual' && manualDraftOrder.length === 0 && teamsData.length > 0) {
            setManualDraftOrder(teamsData.map(team => team.id));
        }
    }, [draftOrderType, manualDraftOrder.length, teamsData]);

    // Load all NFL players and teams data
    useEffect(() => {
        const fetchPlayers = async () => {
            try {
                if (allPlayers?.length) {
                    const sortedPlayers = [...allPlayers].sort((a, b) => {
                        if (a.rank && b.rank) return a.rank - b.rank;
                        return a.name.localeCompare(b.name);
                    });
                    setAllNFLPlayers(sortedPlayers);
                    setFilteredPlayers(sortedPlayers);
                    return;
                }

                const players = await nflPlayerService.getAllPlayers();
                if (players && players.length > 0) {
                    const sortedPlayers = players.sort((a, b) => {
                        if (a.rank && b.rank) {
                            return a.rank - b.rank;
                        }
                        return a.name.localeCompare(b.name);
                    });
                    setAllNFLPlayers(sortedPlayers);
                    setFilteredPlayers(sortedPlayers);
                }
            } catch (error) {
                console.error("Error fetching players:", error);
            }
        };

        const fetchTeams = async () => {
            if (!db || !currentLeague?.id) return;
            
            try {
                const teamsSnapshot = await db.collection(`leagues/${currentLeague.id}/teams`).get();
                const teams = teamsSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setTeamsData(teams);
            } catch (error) {
                console.error("Error fetching teams:", error);
            }
        };

            fetchPlayers();
        fetchTeams();
    }, [db, currentLeague?.id, allPlayers]);

    // Filter players based on search query
    useEffect(() => {
        if (!allNFLPlayers.length) return;
        
        if (!playerSearchQuery.trim()) {
            setFilteredPlayers(allNFLPlayers);
        } else {
            const filtered = allNFLPlayers.filter(player => 
                player.name.toLowerCase().includes(playerSearchQuery.toLowerCase()) ||
                player.position?.toLowerCase().includes(playerSearchQuery.toLowerCase()) ||
                player.nflTeam?.toLowerCase().includes(playerSearchQuery.toLowerCase())
            );
            setFilteredPlayers(filtered);
        }
    }, [playerSearchQuery, allNFLPlayers]);

    // Search functionality for draft board
    useEffect(() => {
        if (!searchQuery.trim()) {
                setSearchResults([]);
            return;
        }

        const results = playerSource.filter(player => 
                player.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            player.position?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            player.nflTeam?.toLowerCase().includes(searchQuery.toLowerCase())
        ).slice(0, 10);

        setSearchResults(results);
    }, [searchQuery, playerSource]);

    const handleDragStart = (e, player) => {
        setDraggedPlayer(player);
        setIsDragging(true);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragEnd = () => {
        setIsDragging(false);
        setDraggedPlayer(null);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e, slotIndex) => {
        e.preventDefault();
        if (draggedPlayer) {
            addToDraftBoardSlot(draggedPlayer, slotIndex);
        }
    };

    const handleTimeUp = async () => {
        if (timeRemaining <= 0 && isMyTurn) {
            await autoPickPlayer();
        }
    };

    const autoPickPlayer = async () => {
        const pool = draftablePlayers.length ? draftablePlayers : draftData?.availablePlayers || [];
        if (!pool.length) return;

        const bestPlayer = [...pool].sort((a, b) => (a.rank || 999) - (b.rank || 999))[0];
        await makePick(bestPlayer);
    };

    const makePick = async (player) => {
        if (!player || !player.id) {
            showMessage("Invalid player selected", "error");
            return;
        }

        if (!isMyTurn) {
            showMessage("It's not your turn to pick", "error");
            return;
        }

        if (draftStatus !== 'live') {
            showMessage(draftStatus === 'paused' ? 'Draft is paused' : 'Draft is not currently live', 'error');
            return;
        }

        try {
            console.log('Making draft pick:', {
                leagueId: currentLeague.id,
                teamId: currentTeamId,
                playerId: player.id,
                playerName: player.name
            });

            const result = await draftService.makeDraftPick(
                currentLeague.id, 
                currentTeamId, 
                player.id
            );
            
            console.log('Draft pick successful:', result);
            showMessage(`Drafted ${player.name}!`, "success");
            
            // Reset turn state immediately
            setIsMyTurn(false);
            setIsOnClock(false);
        } catch (error) {
            console.error("Error making pick:", error);
            showMessage(error.message || "Error making pick", "error");
        }
    };

    const handleAuctionBid = async (amount) => {
        try {
            const response = await fetch(`https://us-central1-dynasty-420.cloudfunctions.net/validateAuctionAction`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    leagueId: currentLeague.id,
                    teamId: currentTeamId,
                    action: 'bid',
                    amount: amount,
                    playerId: auctionPlayer.id
                })
            });

            if (response.ok) {
                showMessage(`Bid placed: $${amount}`, "success");
                setBidAmount(1);
            } else {
                const errorData = await response.json();
                showMessage(errorData.error || "Error placing bid", "error");
            }
        } catch (error) {
            console.error("Error placing bid:", error);
            showMessage("Error placing bid", "error");
        }
    };

    const handleNominatePlayer = async (player) => {
        try {
            const response = await fetch(`https://us-central1-dynasty-420.cloudfunctions.net/validateAuctionAction`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    leagueId: currentLeague.id,
                    teamId: currentTeamId,
                    action: 'nominate',
                    playerId: player.id
                })
            });

            if (response.ok) {
            showMessage(`Nominated ${player.name} for auction`, "success");
            } else {
                const errorData = await response.json();
                showMessage(errorData.error || "Error nominating player", "error");
            }
        } catch (error) {
            console.error("Error nominating player:", error);
            showMessage("Error nominating player", "error");
        }
    };

    const addToDraftBoardSlot = (player, slotIndex) => {
        const newDraftBoard = [...draftBoard];
        newDraftBoard[slotIndex] = player;
        setDraftBoard(newDraftBoard);
    };

    const removeFromDraftBoard = (slotIndex) => {
        const newDraftBoard = [...draftBoard];
        newDraftBoard[slotIndex] = null;
        setDraftBoard(newDraftBoard);
    };

    const moveDraftBoardItem = (fromIndex, toIndex) => {
        const newDraftBoard = [...draftBoard];
        const item = newDraftBoard[fromIndex];
        newDraftBoard[fromIndex] = null;
        newDraftBoard[toIndex] = item;
        setDraftBoard(newDraftBoard);
    };

    const handleUpdateNFLData = async () => {
        try {
            const players = await nflPlayerService.getAllPlayers({ forceRefresh: true });
            const sortedPlayers = [...players].sort((a, b) => {
                if (a.rank && b.rank) return a.rank - b.rank;
                return a.name.localeCompare(b.name);
            });
            setAllNFLPlayers(sortedPlayers);
            setFilteredPlayers(sortedPlayers);
            showMessage(`Player data updated from Sleeper (${sortedPlayers.length} QB/RB/WR/TE).`, 'success');
        } catch (error) {
            console.error('Error updating NFL data:', error);
            showMessage('Error updating NFL data', 'error');
        }
    };

    const handleStartDraft = async () => {
        if (!currentLeague?.id) {
            showMessage('No league selected', 'error');
            return;
        }

        setIsDraftActionLoading(true);
        try {
            draftService.setPlayerPool(playerSource);
            const result = await draftService.startDraft(currentLeague.id);
            setDraftStatus('live');
            if (result?.timeRemaining != null) {
                setLocalTimeRemaining(result.timeRemaining);
            }
            showMessage('Draft started!', 'success');
        } catch (error) {
            console.error('Error starting draft:', error);
            showMessage(error.message || 'Error starting draft', 'error');
        } finally {
            setIsDraftActionLoading(false);
        }
    };

    const handlePauseDraft = async () => {
        if (!currentLeague?.id) return;

        setIsDraftActionLoading(true);
        try {
            await draftService.pauseDraft(currentLeague.id);
            setDraftStatus('paused');
            showMessage('Draft paused', 'success');
        } catch (error) {
            console.error('Error pausing draft:', error);
            showMessage(error.message || 'Error pausing draft', 'error');
        } finally {
            setIsDraftActionLoading(false);
        }
    };

    const handleResumeDraft = async () => {
        if (!currentLeague?.id) return;

        setIsDraftActionLoading(true);
        try {
            const result = await draftService.resumeDraft(currentLeague.id);
            setDraftStatus('live');
            if (result?.timeRemaining != null) {
                setLocalTimeRemaining(result.timeRemaining);
            }
            showMessage('Draft resumed', 'success');
        } catch (error) {
            console.error('Error resuming draft:', error);
            showMessage(error.message || 'Error resuming draft', 'error');
        } finally {
            setIsDraftActionLoading(false);
        }
    };

    const handleStopDraft = async () => {
        if (!currentLeague?.id) return;

        setIsDraftActionLoading(true);
        try {
            await draftService.stopDraft(currentLeague.id);
            setDraftStatus('completed');
            setShowStopModal(false);
            showMessage('Draft stopped', 'success');
        } catch (error) {
            console.error('Error stopping draft:', error);
            showMessage(error.message || 'Error stopping draft', 'error');
        } finally {
            setIsDraftActionLoading(false);
        }
    };

    const handleResetDraft = async () => {
        if (!currentLeague?.id) return;

        setIsDraftActionLoading(true);
        try {
            draftService.setPlayerPool(playerSource);
            const result = await draftService.resetDraft(currentLeague.id);
            setDraftStatus(result?.status || 'order_set');
            setShowResetModal(false);
            showMessage('Draft reset successfully', 'success');
        } catch (error) {
            console.error('Error resetting draft:', error);
            showMessage(error.message || 'Error resetting draft', 'error');
        } finally {
            setIsDraftActionLoading(false);
        }
    };

    // Draft Configuration Functions (Commissioner Only)
    const handleSetDraftDateTime = async () => {
        if (!currentLeague?.id) return;
        
        try {
            await draftService.setDraftDateTime(currentLeague.id, draftDateTime);
            showMessage("Draft date and time set successfully!", "success");
        } catch (error) {
            console.error("Error setting draft date/time:", error);
            showMessage(error.message || "Failed to set draft date/time.", "error");
        }
    };

    const handleSaveDraftSettings = async () => {
        if (!currentLeague?.id) return;

        try {
            await draftService.configureDraft(currentLeague.id, {
                draftFormat,
                rounds: draftRounds,
                pickTimeLimit,
                orderType: draftOrderType,
                roundOneOrder: manualDraftOrder.length ? manualDraftOrder : roundOneOrder
            });
            showMessage("Draft settings saved successfully!", "success");
        } catch (error) {
            console.error("Error saving draft settings:", error);
            showMessage(error.message || "Failed to save draft settings.", "error");
        }
    };

    const handleRandomizeDraftOrder = async () => {
        if (!currentLeague?.id || !teamsData.length) return;
        
        try {
            const result = await draftService.randomizeDraftOrder(currentLeague.id, {
                draftFormat,
                rounds: draftRounds
            });

            const randomizedOrder = result.roundOneOrder || [];
            setManualDraftOrder(randomizedOrder);
            setRoundOneOrder(randomizedOrder);
            setDraftOrder(result.draftOrder || generatePickOrder(randomizedOrder, draftFormat, draftRounds));
            setDraftOrderType('random');
            showMessage("Draft lineup randomized! Order is locked until you randomize again.", "success");
        } catch (error) {
            console.error("Error randomizing draft order:", error);
            showMessage(error.message || "Failed to randomize draft order.", "error");
        }
    };

    const handleSetManualDraftOrder = async () => {
        if (!currentLeague?.id || !teamsData.length) return;
        
        try {
            const result = await draftService.setDraftOrder(currentLeague.id, manualDraftOrder);
            setRoundOneOrder(manualDraftOrder);
            setDraftOrder(result.draftOrder || generatePickOrder(manualDraftOrder, draftFormat, draftRounds));
            setDraftOrderType('manual');
            showMessage("Manual draft order set successfully!", "success");
        } catch (error) {
            console.error("Error setting manual draft order:", error);
            showMessage(error.message || "Failed to set manual draft order.", "error");
        }
    };

    const handleMoveTeamInDraftOrder = (fromIndex, toIndex) => {
        const newOrder = [...manualDraftOrder];
        const [movedTeam] = newOrder.splice(fromIndex, 1);
        newOrder.splice(toIndex, 0, movedTeam);
        setManualDraftOrder(newOrder);
    };

    const canStartDraft = ['pending', 'order_set', 'scheduled', 'completed'].includes(draftStatus);
    const canPauseDraft = draftStatus === 'live';
    const canResumeDraft = draftStatus === 'paused';
    const canStopDraft = ['live', 'paused'].includes(draftStatus);
    const canResetDraft = draftStatus !== 'pending' || draftData?.picks?.length || draftData?.draftedPlayers?.length;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center pt-20">
                <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-purple-500"></div>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-6 bg-emerald-950 rounded-lg shadow-xl max-w-7xl mx-auto my-2 sm:my-8 text-white">
            <div className="mb-6">
                <h2 className="text-3xl font-bold text-white mb-4">Draft Center</h2>
                
                {/* Tab Navigation */}
                <div className="flex gap-2 mb-6 overflow-x-auto pb-1 scrollbar-hide">
                    <button
                        type="button"
                        onClick={() => setActiveTab('draft-board')}
                        className={`flex-shrink-0 px-4 py-2.5 rounded-md font-semibold transition-colors touch-target ${
                            activeTab === 'draft-board' 
                                ? 'bg-purple-800 text-white' 
                                : 'bg-emerald-900 text-emerald-200 hover:bg-emerald-800'
                        }`}
                    >
                        Draft Board
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('draft-room')}
                        className={`flex-shrink-0 px-4 py-2.5 rounded-md font-semibold transition-colors touch-target ${
                            activeTab === 'draft-room' 
                                ? 'bg-purple-800 text-white' 
                                : 'bg-emerald-900 text-emerald-200 hover:bg-emerald-800'
                        }`}
                    >
                        Draft Room
                    </button>
                </div>

            {/* Commissioner Controls */}
                <div className="mb-6 p-4 bg-emerald-900 rounded-lg">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-semibold text-purple-400">
                            Commissioner Controls
                            {!isCommissioner && <span className="text-sm text-red-400 ml-2">(Commissioner only)</span>}
                        </h3>
                        {isCommissioner && (
                            <button
                                onClick={() => setShowDraftConfig(!showDraftConfig)}
                                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-semibold"
                            >
                                {showDraftConfig ? 'Hide' : 'Show'} Draft Configuration
                            </button>
                        )}
                    </div>

                    {isCommissioner && (
                        <div className="mb-4 p-4 rounded-lg bg-emerald-950/70 border border-emerald-700">
                            <h4 className="text-lg font-semibold text-yellow-400 mb-2">Draft Controls</h4>
                            <p className="text-sm text-emerald-300 mb-4">
                                Manage the live draft. Status: <span className="font-semibold text-white">{draftStatus.replace('_', ' ')}</span>
                            </p>
                            <div className="flex flex-wrap gap-3">
                                {canStartDraft && (
                                    <button
                                        onClick={handleStartDraft}
                                        disabled={isDraftActionLoading || (!manualDraftOrder.length && !draftOrder.length && !teamsData.length)}
                                        className="px-5 py-2.5 bg-green-600 hover:bg-green-700 rounded-md font-semibold disabled:opacity-50"
                                    >
                                        Start Draft
                                    </button>
                                )}
                                {canPauseDraft && (
                                    <button
                                        onClick={handlePauseDraft}
                                        disabled={isDraftActionLoading}
                                        className="px-5 py-2.5 bg-yellow-600 hover:bg-yellow-700 rounded-md font-semibold disabled:opacity-50"
                                    >
                                        Pause Draft
                                    </button>
                                )}
                                {canResumeDraft && (
                                    <button
                                        onClick={handleResumeDraft}
                                        disabled={isDraftActionLoading}
                                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-md font-semibold disabled:opacity-50"
                                    >
                                        Resume Draft
                                    </button>
                                )}
                                {canStopDraft && (
                                    <button
                                        onClick={() => setShowStopModal(true)}
                                        disabled={isDraftActionLoading}
                                        className="px-5 py-2.5 bg-red-600 hover:bg-red-700 rounded-md font-semibold disabled:opacity-50"
                                    >
                                        Stop Draft
                                    </button>
                                )}
                                {(canResetDraft || draftStatus === 'completed' || draftStatus === 'live' || draftStatus === 'paused' || draftStatus === 'order_set') && (
                                    <button
                                        onClick={() => setShowResetModal(true)}
                                        disabled={isDraftActionLoading}
                                        className="px-5 py-2.5 bg-orange-700 hover:bg-orange-800 rounded-md font-semibold disabled:opacity-50"
                                    >
                                        Reset Draft
                                    </button>
                                )}
                                <button
                                    onClick={handleUpdateNFLData}
                                    disabled={isDraftActionLoading}
                                    className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 rounded-md font-semibold disabled:opacity-50"
                                >
                                    Update Player Data
                                </button>
                            </div>
                        </div>
                    )}

                    {!isCommissioner && (
                        <p className="text-sm text-emerald-300">
                            Draft controls are available to the league commissioner only.
                        </p>
                    )}
                        
                    {isCommissioner && showDraftConfig && (
                        <div className="mt-4 p-4 bg-emerald-800 rounded-lg border-2 border-emerald-600">
                                <h4 className="text-xl font-semibold mb-4 text-orange-400">Draft Configuration</h4>

                                {/* Draft Settings */}
                                <div className="mb-6">
                                    <h5 className="text-lg font-bold mb-3 text-emerald-200 border-b border-emerald-500 pb-2">Draft Settings</h5>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                        <div>
                                            <label className="block text-emerald-200 font-medium text-sm mb-1">Draft Format</label>
                                            <select
                                                value={draftFormat}
                                                onChange={(e) => setDraftFormat(e.target.value)}
                                                className="w-full p-3 rounded-md bg-emerald-100 text-emerald-900 border-2 border-emerald-300 focus:border-purple-500"
                                            >
                                                {DRAFT_FORMAT_OPTIONS.map(option => (
                                                    <option key={option.value} value={option.value}>{option.label}</option>
                                                ))}
                                            </select>
                                            <p className="text-xs text-emerald-300 mt-1">
                                                {draftFormat === 'snake'
                                                    ? 'Snake reverses pick order every other round after round one.'
                                                    : 'Standard keeps the same pick order every round.'}
                                            </p>
                                        </div>
                                        <div>
                                            <label className="block text-emerald-200 font-medium text-sm mb-1">
                                                Rounds ({MIN_ROUNDS}-{MAX_ROUNDS})
                                            </label>
                                            <input
                                                type="number"
                                                min={MIN_ROUNDS}
                                                max={MAX_ROUNDS}
                                                value={draftRounds}
                                                onChange={(e) => setDraftRounds(Number(e.target.value))}
                                                className="w-full p-3 rounded-md bg-emerald-100 text-emerald-900 border-2 border-emerald-300 focus:border-purple-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-emerald-200 font-medium text-sm mb-1">Pick Timer</label>
                                            <select
                                                value={pickTimeLimit === null ? 'unlimited' : String(pickTimeLimit)}
                                                onChange={(e) => setPickTimeLimit(
                                                    e.target.value === 'unlimited' ? null : Number(e.target.value)
                                                )}
                                                className="w-full p-3 rounded-md bg-emerald-100 text-emerald-900 border-2 border-emerald-300 focus:border-purple-500"
                                            >
                                                {PICK_TIME_OPTIONS.map(option => (
                                                    <option
                                                        key={option.label}
                                                        value={option.value === null ? 'unlimited' : String(option.value)}
                                                    >
                                                        {option.label}
                                                    </option>
                                                ))}
                                            </select>
                                            <p className="text-xs text-emerald-300 mt-1">
                                                Current: {formatPickTimeLabel(pickTimeLimit)}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleSaveDraftSettings}
                                        className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-md transition-colors"
                                    >
                                        Save Draft Settings
                                    </button>
                                </div>
                                
                                {/* Draft Date and Time */}
                                <div className="mb-6">
                                    <h5 className="text-lg font-bold mb-3 text-emerald-200 border-b border-emerald-500 pb-2">Draft Date & Time</h5>
                                    <div className="flex gap-4 items-end">
                                        <div className="flex-1">
                                            <label className="block text-emerald-200 font-medium text-sm mb-1">Draft Date & Time:</label>
                                            <input
                                                type="datetime-local"
                                                value={draftDateTime}
                                                onChange={(e) => setDraftDateTime(e.target.value)}
                                                className="w-full p-3 rounded-md bg-emerald-100 text-emerald-900 border-2 border-emerald-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-colors"
                                            />
                                        </div>
                                        <button
                                            onClick={handleSetDraftDateTime}
                                            disabled={!draftDateTime}
                                            className="px-6 py-3 bg-purple-800 hover:bg-purple-900 text-white font-bold rounded-md disabled:opacity-50 transition-colors"
                                        >
                                            Set Date/Time
                                        </button>
                                    </div>
                                </div>

                                {/* Draft Order Management */}
                                <div className="mb-6">
                                    <h5 className="text-lg font-bold mb-3 text-emerald-200 border-b border-emerald-500 pb-2">Draft Order (Round 1)</h5>
                                    <p className="text-sm text-emerald-300 mb-4">
                                        Set round-one lineup order once. {draftFormat === 'snake' ? 'Snake draft reverses order on even rounds.' : 'Standard draft repeats this order each round.'}
                                    </p>
                                    
                                    <div className="mb-4">
                                        <div className="flex gap-4 items-center mb-4">
                                            <label className="flex items-center space-x-3 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="draftOrderType"
                                                    value="random"
                                                    checked={draftOrderType === 'random'}
                                                    onChange={(e) => setDraftOrderType(e.target.value)}
                                                    className="form-radio h-4 w-4 bg-emerald-100 border-emerald-300 text-purple-500 focus:ring-purple-500"
                                                />
                                                <span className="text-emerald-200 font-medium">Randomize Round 1</span>
                                            </label>
                                            <label className="flex items-center space-x-3 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="draftOrderType"
                                                    value="manual"
                                                    checked={draftOrderType === 'manual'}
                                                    onChange={(e) => setDraftOrderType(e.target.value)}
                                                    className="form-radio h-4 w-4 bg-emerald-100 border-emerald-300 text-purple-500 focus:ring-purple-500"
                                                />
                                                <span className="text-emerald-200 font-medium">Manual Round 1</span>
                                            </label>
                                        </div>
                                        
                                        <div className="flex gap-4">
                                            <button
                                                onClick={handleRandomizeDraftOrder}
                                                disabled={!teamsData.length}
                                                className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-md disabled:opacity-50 transition-colors"
                                            >
                                                Randomize Draft Lineup
                                            </button>
                                            {draftOrderType === 'manual' && (
                                                <button
                                                    onClick={handleSetManualDraftOrder}
                                                    disabled={manualDraftOrder.length === 0}
                                                    className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-md disabled:opacity-50 transition-colors"
                                                >
                                                    Save Manual Order
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Manual Draft Order Editor */}
                                    {draftOrderType === 'manual' && (
                                        <div className="bg-emerald-700 p-4 rounded-lg">
                                            <h6 className="text-md font-semibold mb-3 text-emerald-200">Manual Draft Order</h6>
                                            <p className="text-sm text-emerald-300 mb-4">Use the buttons to move teams up/down in the draft order:</p>
                                            
                                            <div className="space-y-2">
                                                {manualDraftOrder.map((teamId, index) => {
                                                    const team = teamsData.find(t => t.id === teamId);
                                                    return (
                                                        <div key={teamId} className="flex items-center gap-3 bg-emerald-800 p-3 rounded-lg">
                                                            <span className="text-emerald-300 font-bold min-w-[30px]">#{index + 1}</span>
                                                            <span className="flex-1 text-white font-medium">{team?.teamName || 'Unknown Team'}</span>
                                                            <div className="flex gap-2">
                                                                <button
                                                                    onClick={() => handleMoveTeamInDraftOrder(index, Math.max(0, index - 1))}
                                                                    disabled={index === 0}
                                                                    className="px-3 py-1 bg-purple-800 hover:bg-purple-900 text-white rounded disabled:opacity-50 transition-colors"
                                                                >
                                                                    ↑
                                                                </button>
                                                                <button
                                                                    onClick={() => handleMoveTeamInDraftOrder(index, Math.min(manualDraftOrder.length - 1, index + 1))}
                                                                    disabled={index === manualDraftOrder.length - 1}
                                                                    className="px-3 py-1 bg-purple-800 hover:bg-purple-900 text-white rounded disabled:opacity-50 transition-colors"
                                                                >
                                                                    ↓
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Current Draft Order Display */}
                                    {(draftOrderType === 'random' || manualDraftOrder.length > 0) && (
                                        <div className="mt-4 bg-emerald-700 p-4 rounded-lg">
                                            <h6 className="text-md font-semibold mb-3 text-emerald-200">
                                                Round 1 Order ({draftFormat === 'snake' ? 'Snake' : 'Standard'} · {draftRounds} rounds)
                                            </h6>
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                                {manualDraftOrder.map((teamId, index) => {
                                                    const team = teamsData.find(t => t.id === teamId);
                                                    return (
                                                        <div key={teamId} className="bg-emerald-800 p-2 rounded text-sm">
                                                            <span className="text-emerald-300 font-bold">#{index + 1}</span>
                                                            <span className="text-white ml-2">{team?.teamName || 'Unknown Team'}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>

                            </div>
                        )}
                </div>
            </div>



            {/* Draft Board Tab */}
            {activeTab === 'draft-board' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Player Search */}
                    <div className="lg:col-span-1">
                        <div className="bg-emerald-900 p-4 rounded-lg">
                            <h3 className="text-xl font-semibold mb-4 text-emerald-200">Player Search</h3>
                            <input
                                type="text"
                                placeholder="Search players..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full p-3 mb-4 rounded-md bg-emerald-800 text-white border-emerald-600 focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                            />
                            
                            <div className="max-h-96 overflow-y-auto">
                                {searchResults.length > 0 ? searchResults.map(player => (
                                    <div 
                                        key={player.id} 
                                        className={`flex justify-between items-center p-2 bg-emerald-800 rounded mb-2 cursor-move transition-all ${
                                            isDragging && draggedPlayer?.id === player.id 
                                                ? 'opacity-50 scale-95' 
                                                : 'hover:bg-emerald-700'
                                        }`}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, player)}
                                        onDragEnd={handleDragEnd}
                                    >
                                        <div className="flex-1">
                                            <div className="font-semibold">{player.name}</div>
                                            <div className="text-sm text-emerald-300">
                                                {player.position} • {player.nflTeam} • Rank: {player.rank}
                                            </div>
                                        </div>
                                        <div className="text-xs text-emerald-400">
                                            Drag to slot
                                        </div>
                                    </div>
                                )) : (
                                    <div className="text-center text-emerald-300 p-4">
                                        Search for players to add to your draft board
                                        </div>
                                    )}
                                </div>
                        </div>
                    </div>

                    {/* Draft Board - 20 Fixed Slots */}
                    <div className="lg:col-span-1">
                        <div className="bg-emerald-900 p-4 rounded-lg">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-xl font-semibold text-emerald-200">Draft Board (20 Slots)</h3>
                                <div className="text-sm text-emerald-300">
                                    {draftBoard.filter(slot => slot !== null).length}/20 filled
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3 max-h-96 overflow-y-auto">
                                {draftBoard.map((player, index) => (
                                    <div 
                                        key={index}
                                        className={`p-3 rounded border-2 transition-all ${
                                            player 
                                                ? 'bg-emerald-800 border-emerald-600' 
                                                : 'bg-emerald-800/50 border-dashed border-emerald-600/50 hover:border-emerald-500'
                                        }`}
                                        onDragOver={handleDragOver}
                                        onDrop={(e) => handleDrop(e, index)}
                                    >
                                        <div className="text-xs text-emerald-400 mb-1">Slot {index + 1}</div>
                                        
                                        {player ? (
                                            <div>
                                                <div className="font-semibold text-sm">{player.name}</div>
                                                <div className="text-xs text-emerald-300">
                                                    {player.position} • {player.nflTeam} • Rank: {player.rank}
                                                </div>
                                                <div className="flex justify-between items-center mt-2">
                                                    <button
                                                        onClick={() => removeFromDraftBoard(index)}
                                                        className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs"
                                                    >
                                                        Remove
                                                    </button>
                                                    <div className="text-xs text-emerald-400">
                                                        Drag to reorder
                                                    </div>
                                                </div>
                        </div>
                    ) : (
                                            <div className="text-center text-emerald-400 text-sm py-2">
                                                <div>Drop player here</div>
                                                <div className="text-xs mt-1">or search above</div>
                                        </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Draft Room Tab */}
            {activeTab === 'draft-room' && (
                <div className="space-y-6">
                    {/* Draft Status */}
                    <div className="bg-emerald-900 p-4 rounded-lg">
                        <h3 className="text-xl font-semibold mb-4 text-emerald-200">Draft Status</h3>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div>
                                <span className="text-emerald-300">Status: </span>
                                <span className="font-semibold">{draftStatus}</span>
                            </div>
                            <div>
                                <span className="text-emerald-300">Current Round: </span>
                                <span className="font-semibold">{draftData?.currentRound || 1}</span>
                            </div>
                            <div>
                                <span className="text-emerald-300">Current Pick: </span>
                                <span className="font-semibold">{draftData?.currentPick || 0}</span>
                            </div>
                            <div>
                                <span className="text-emerald-300">Draft Type: </span>
                                <span className="font-semibold">{currentLeague?.settings?.draftType || 'standard'}</span>
                                        </div>
                                    </div>
                        
                        {/* Current Team on the Clock */}
                        {draftStatus === 'live' && draftData?.currentPick !== undefined && draftOrder[draftData.currentPick] && (
                            <div className="mt-4 p-3 bg-purple-800 rounded-lg">
                                <div className="text-purple-200 font-medium">Currently on the Clock:</div>
                                <div className="text-white font-semibold text-lg">
                                    {teamsData.find(t => t.id === draftOrder[draftData.currentPick])?.teamName || 'Unknown Team'}
                                </div>
                                <div className="text-sm text-purple-300 mt-1">
                                    Pick #{draftData.currentPick + 1} • Round {draftData.currentRound || 1}
                                </div>
                            </div>
                        )}
                        
                        {/* Draft Scheduled Time */}
                        {draftScheduledTime && (
                            <div className="mt-4 p-3 bg-emerald-800 rounded-lg">
                                <div className="text-emerald-200 font-medium">Scheduled Draft Time:</div>
                                <div className="text-white font-semibold">
                                    {new Date(draftScheduledTime).toLocaleString()}
                                </div>
                                {draftStatus === 'scheduled' && (
                                    <div className="text-sm text-emerald-300 mt-1">
                                        Draft will auto-start at scheduled time
                                    </div>
                                )}
                            </div>
                        )}
                                </div>
                                
                    {/* Enhanced Timer and Current Turn */}
                    {(draftStatus === 'live' || draftStatus === 'paused') && (
                        <div className="bg-purple-900 p-4 rounded-lg">
                            <h3 className="text-xl font-semibold mb-4 text-purple-200">
                                {draftStatus === 'paused'
                                    ? 'DRAFT PAUSED'
                                    : isOnClock
                                        ? 'ON THE CLOCK!'
                                        : 'Draft Progress'}
                            </h3>
                            
                            {draftStatus === 'paused' ? (
                                <div className="text-center">
                                    <div className="text-3xl font-bold text-yellow-300 mb-2">
                                        Timer frozen at {localTimeRemaining}s
                                    </div>
                                    <p className="text-purple-200">Waiting for the commissioner to resume the draft.</p>
                                </div>
                            ) : isOnClock ? (
                                <div className="text-center">
                                    <div className="text-6xl font-bold text-red-400 mb-4">
                                        {localTimeRemaining || draftTimerState?.timeRemaining || 0}s
                                    </div>
                                    <div className="text-xl text-purple-200 mb-2">
                                        {draftTimerState?.isFirstPick ? 'First Pick (30s)' : 'Your Turn (20s)'}
                                    </div>
                                    <div className="text-sm text-purple-300 mb-4">
                                        Make your pick before time runs out!
                                    </div>
                                    <div className="text-lg text-purple-200">
                                        Round {draftData?.currentRound || 1} • Pick #{draftData?.currentPick + 1 || 1}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center">
                                    <div className="text-3xl font-bold text-purple-300 mb-2">
                                        {picksUntilMyTurn} picks until your turn
                                    </div>
                                    <div className="text-lg text-purple-200 mb-2">
                                        Current team: {teamsData.find(t => t.id === draftTimerState?.currentTeamId)?.teamName || 'Unknown Team'}
                                    </div>
                                    <div className="text-sm text-purple-300">
                                        Round {draftData?.currentRound || 1} • Pick #{draftData?.currentPick + 1 || 1}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Legacy Timer for Auction Drafts */}
                    {(isMyTurn || isAuctionActive) && isAuctionDraft && (
                        <div className="bg-purple-900 p-4 rounded-lg">
                            <h3 className="text-xl font-semibold mb-4 text-purple-200">
                                {isMyTurn ? 'Your Turn!' : 'Auction Active'}
                            </h3>
                            <div className="text-center">
                                <div className="text-4xl font-bold text-purple-300 mb-2">
                                    {timeRemaining}s
                                </div>
                                {isAuctionDraft && auctionPlayer && (
                                    <div className="text-lg text-purple-200">
                                        Bidding on: {auctionPlayer.name}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Pre-draft player pool */}
                    {draftStatus !== 'live' && (
                        <SleeperPlayerList
                            players={draftablePlayers}
                            title="Player Pool"
                            emptyMessage="No players loaded. Ask the commissioner to refresh player data."
                            maxHeight="20rem"
                        />
                    )}

                    {/* Main Draft Interface - Available Players and Drafted Players */}
                    {draftStatus === 'live' && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-1">
                                <SleeperPlayerList
                                    players={visibleDraftPlayers}
                                    title="Available Players"
                                    emptyMessage="No players available. Refresh the page or ask the commissioner to restart the draft."
                                    maxHeight="24rem"
                                    onPlayerSelect={isMyTurn ? makePick : undefined}
                                    selectLabel="Draft"
                                />
                            </div>

                            {/* Drafted Players - Two Columns of 12 Slots Each */}
                            <div className="lg:col-span-2">
                                <div className="bg-emerald-900 p-4 rounded-lg">
                                    <h3 className="text-xl font-semibold mb-4 text-emerald-200">Drafted Players</h3>
                                    
                                    {/* Two Columns Layout */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {/* Left Column - 12 Slots */}
                                        <div>
                                            <h4 className="text-lg font-semibold mb-3 text-emerald-200">Column 1 (1-12)</h4>
                                            <div className="space-y-2">
                                                {Array.from({ length: 12 }, (_, index) => {
                                                    const slotNumber = index + 1;
                                                    const draftedPlayer = draftData?.draftedPlayers?.[slotNumber - 1];
                                                    return (
                                                        <div 
                                                            key={slotNumber}
                                                            className={`p-3 rounded border-2 ${
                                                                draftedPlayer 
                                                                    ? 'bg-emerald-800 border-emerald-600' 
                                                                    : 'bg-emerald-800/50 border-dashed border-emerald-600/50'
                                                            }`}
                                                        >
                                                            <div className="text-xs text-emerald-400 mb-1">Slot {slotNumber}</div>
                                                            {draftedPlayer ? (
                                                                <div>
                                                                    <div className="font-semibold text-sm">{draftedPlayer.name}</div>
                                                                    <div className="text-xs text-emerald-300">
                                                                        {draftedPlayer.position} • {draftedPlayer.nflTeam} • Rank: {draftedPlayer.rank}
                                                                    </div>
                                                                    <div className="text-xs text-emerald-400 mt-1">
                                                                        Drafted by: {teamsData.find(t => t.id === draftedPlayer.teamId)?.teamName || 'Unknown'}
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div className="text-center text-emerald-400 text-sm py-2">
                                                                    Empty
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Right Column - 12 Slots */}
                                        <div>
                                            <h4 className="text-lg font-semibold mb-3 text-emerald-200">Column 2 (13-24)</h4>
                                            <div className="space-y-2">
                                                {Array.from({ length: 12 }, (_, index) => {
                                                    const slotNumber = index + 13;
                                                    const draftedPlayer = draftData?.draftedPlayers?.[slotNumber - 1];
                                                    return (
                                                        <div 
                                                            key={slotNumber}
                                                            className={`p-3 rounded border-2 ${
                                                                draftedPlayer 
                                                                    ? 'bg-emerald-800 border-emerald-600' 
                                                                    : 'bg-emerald-800/50 border-dashed border-emerald-600/50'
                                                            }`}
                                                        >
                                                            <div className="text-xs text-emerald-400 mb-1">Slot {slotNumber}</div>
                                                            {draftedPlayer ? (
                                                                <div>
                                                                    <div className="font-semibold text-sm">{draftedPlayer.name}</div>
                                                                    <div className="text-xs text-emerald-300">
                                                                        {draftedPlayer.position} • {draftedPlayer.nflTeam} • Rank: {draftedPlayer.rank}
                                                                    </div>
                                                                    <div className="text-xs text-emerald-400 mt-1">
                                                                        Drafted by: {teamsData.find(t => t.id === draftedPlayer.teamId)?.teamName || 'Unknown'}
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div className="text-center text-emerald-400 text-sm py-2">
                                                                    Empty
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Standard/Snake Draft Interface - Legacy */}
                    {!isAuctionDraft && draftData?.status === 'active' && draftStatus !== 'live' && (
                        <div className="bg-emerald-900 p-4 rounded-lg">
                            <h3 className="text-xl font-semibold mb-4 text-emerald-200">Available Players</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-auto">
                                {availablePlayers.slice(0, 30).map(player => (
                                    <div key={player.id} className="p-3 bg-emerald-800 rounded">
                                        <div className="font-semibold">{player.name}</div>
                                        <div className="text-sm text-emerald-300">
                                            {player.position} • {player.nflTeam} • Rank: {player.rank}
                </div>
                                        {isMyTurn && (
                                            <button
                                                onClick={() => makePick(player)}
                                                className="mt-2 w-full px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm"
                                            >
                                                Draft Player
                                            </button>
                                        )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                    {/* Auction Draft Interface */}
                    {isAuctionDraft && draftData?.status === 'active' && (
                        <div className="bg-emerald-900 p-4 rounded-lg">
                            <h3 className="text-xl font-semibold mb-4 text-emerald-200">Auction Draft</h3>
                            
                            {!auctionPlayer && isMyTurn && (
                                <div className="mb-4">
                                    <h4 className="text-lg font-semibold mb-2 text-emerald-200">Nominate a Player</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-auto">
                                        {availablePlayers.slice(0, 30).map(player => (
                                            <div key={player.id} className="p-3 bg-emerald-800 rounded">
                                                <div className="font-semibold">{player.name}</div>
                                                <div className="text-sm text-emerald-300">
                                                    {player.position} • {player.nflTeam} • Rank: {player.rank}
                                                </div>
                                                <button
                                                    onClick={() => handleNominatePlayer(player)}
                                                    className="mt-2 w-full px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded text-sm"
                                                >
                                                    Nominate
                                                </button>
                                            </div>
                                        ))}
                        </div>
                    </div>
                )}

                            {auctionPlayer && (
                                <div className="mb-4">
                                    <h4 className="text-lg font-semibold mb-2 text-emerald-200">
                                        Current Auction: {auctionPlayer.name}
                                    </h4>
                                    <div className="flex items-center space-x-4">
                                        <div>
                                            <span className="text-emerald-300">Current Bid: </span>
                                            <span className="font-semibold">${currentBid?.amount || 1}</span>
                                        </div>
                                        <div>
                                            <span className="text-emerald-300">By: </span>
                                            <span className="font-semibold">
                                                {teamsData.find(t => t.id === currentBid?.teamId)?.teamName || 'Unknown'}
                                            </span>
                                        </div>
            </div>

                                    {isMyTurn && (
                                        <div className="mt-4 flex items-center space-x-4">
                                            <input
                                                type="number"
                                                min={1}
                                                value={bidAmount}
                                                onChange={(e) => setBidAmount(parseInt(e.target.value) || 1)}
                                                className="px-3 py-2 bg-emerald-800 text-white border border-emerald-600 rounded"
                                            />
                                            <button
                                                onClick={() => handleAuctionBid(bidAmount)}
                                                className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded"
                                            >
                                                Place Bid
                                            </button>
                                </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Draft Order */}
                    <div className="bg-emerald-900 p-4 rounded-lg">
                        <h3 className="text-xl font-semibold mb-4 text-emerald-200">Draft Order</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {draftOrder.map((teamId, index) => {
                                const team = teamsData.find(t => t.id === teamId);
                                return (
                                    <div key={teamId} className={`p-3 rounded ${draftData?.currentPick === index ? 'bg-purple-800' : 'bg-emerald-800'}`}>
                                        <div className="font-semibold">
                                            {index + 1}. {team?.teamName || 'Unknown Team'}
                                        </div>
                                        {draftData?.currentPick === index && (
                                            <div className="text-sm text-purple-300">Current Pick</div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            <ConfirmationModal
                isOpen={showStopModal}
                onClose={() => setShowStopModal(false)}
                onConfirm={handleStopDraft}
                title="Stop Draft"
            >
                Stop the draft now? The current draft will be marked complete and no more picks can be made.
            </ConfirmationModal>

            <ConfirmationModal
                isOpen={showResetModal}
                onClose={() => setShowResetModal(false)}
                onConfirm={handleResetDraft}
                title="Reset Draft"
            >
                Reset the entire draft? All picks will be cleared, drafted players removed from benches, and the draft returned to order-set status.
            </ConfirmationModal>
        </div>
    );
};

export default DraftCenter; 