import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useFirebase } from '../contexts/FirebaseContext.js';
import { appId } from '../config/firebase.js';
import nflPlayerService from '../utils/nflPlayerService.js';
import draftService from '../utils/draftService.js';
import { playTurnNotification } from '../utils/turnNotificationSound.js';
import { ConfirmationModal } from './ConfirmationModal.js';
import { SleeperPlayerList } from './SleeperPlayerList.js';
import {
    MAX_ROUNDS,
} from '../utils/draftOrderUtils.js';
import { isOnActiveNflRoster } from '../utils/helpers.js';
import { isLeagueCommissioner } from '../constants/leagueDefaults.js';

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
    const [showStopModal, setShowStopModal] = useState(false);
    const [isDraftActionLoading, setIsDraftActionLoading] = useState(false);
    
    const timerRef = useRef(null);
    const countdownRef = useRef(null);
    const draftTimerIntervalRef = useRef(null);
    const prevIsMyTurnRef = useRef(false);
    const autoPickInFlightRef = useRef(false);
    const auctionResolveInFlightRef = useRef(false);
    const [localTimeRemaining, setLocalTimeRemaining] = useState(0);

    const isCommissioner = isLeagueCommissioner(currentLeague, userId);
    const isAuctionDraft = (
        currentLeague?.settings?.draftType === 'auction'
        || draftData?.type === 'auction'
    );
    const auctionLive = draftData?.auctionLive || null;
    const nominationOrder = draftData?.nominationOrder
        || draftData?.roundOneOrder
        || draftOrder
        || [];
    const nominatorTeamId = auctionLive?.nominatorTeamId
        || nominationOrder[draftData?.currentNominatorIndex ?? 0]
        || null;
    const isNominator = Boolean(nominatorTeamId && nominatorTeamId === currentTeamId);
    const canNominate = isAuctionDraft && draftStatus === 'live' && isNominator && !auctionLive?.isActive;
    const canBid = isAuctionDraft && draftStatus === 'live' && Boolean(auctionLive?.isActive && auctionLive?.currentPlayer);

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
        const draftedIds = new Set([
            ...(draftData?.draftedPlayers || []).map((player) => player.id || player.playerId),
            ...(draftData?.picks || []).map((pick) => pick.playerId),
            ...(currentLeague?.allRosteredPlayerIds || []),
        ]);

        const source = (draftStatus === 'live' && draftData?.availablePlayers?.length)
            ? draftData.availablePlayers
            : playerSource;

        return source.filter((player) => (
            isOnActiveNflRoster(player) && !draftedIds.has(player.id)
        ));
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
                setAvailablePlayers(
                    (data.draft?.availablePlayers || []).filter(isOnActiveNflRoster)
                );
                const order = data.draft?.type === 'auction'
                    ? (data.draft?.nominationOrder || data.draft?.roundOneOrder || [])
                    : (data.draft?.draftOrder || []);
                setDraftOrder(order);
                setCurrentPick(data.draft?.currentPick || null);

                const liveAuction = data.draft?.auctionLive || null;
                setAuctionPlayer(liveAuction?.currentPlayer || null);
                setCurrentBid(
                    liveAuction?.isActive
                        ? { amount: liveAuction.currentBid, teamId: liveAuction.currentBidder }
                        : null
                );
                setIsAuctionActive(Boolean(liveAuction?.isActive));
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
        if (draftStatus !== 'live') {
            setIsMyTurn(false);
            setIsOnClock(false);
            setPicksUntilMyTurn(0);
            if (draftStatus !== 'paused') {
                setLocalTimeRemaining(0);
            }
            return;
        }

        if (isAuctionDraft) {
            const onClock = auctionLive?.isActive
                ? true // all teams can bid while auction is active
                : isNominator;
            setIsOnClock(isNominator && !auctionLive?.isActive);
            setIsMyTurn(onClock);
            setPicksUntilMyTurn(0);
            setDraftTimerState({
                status: draftStatus,
                currentPick: draftData?.currentNominatorIndex ?? 0,
                currentTeamId: nominatorTeamId,
                draftOrder: nominationOrder,
                timeRemaining: localTimeRemaining,
                mode: 'auction',
            });
            return;
        }

        if (!draftOrder.length) {
            setIsMyTurn(false);
            setIsOnClock(false);
            setPicksUntilMyTurn(0);
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
    }, [
        draftStatus,
        draftOrder,
        draftData?.currentPick,
        draftData?.currentNominatorIndex,
        currentTeamId,
        localTimeRemaining,
        isAuctionDraft,
        auctionLive?.isActive,
        isNominator,
        nominatorTeamId,
        nominationOrder,
    ]);

    useEffect(() => {
        if (draftStatus === 'paused') {
            setLocalTimeRemaining(draftData?.pausedTimeRemaining ?? 0);
            return undefined;
        }

        if (draftStatus !== 'live') {
            setLocalTimeRemaining(0);
            return undefined;
        }

        // Auction uses bidDeadline; pick drafts use pickDeadline
        const deadline = isAuctionDraft
            ? auctionLive?.bidDeadline
            : draftData?.pickDeadline;

        if (!deadline) {
            setLocalTimeRemaining(0);
            return undefined;
        }

        const tick = () => {
            const remaining = Math.max(
                0,
                Math.floor((new Date(deadline).getTime() - Date.now()) / 1000)
            );
            setLocalTimeRemaining(remaining);
        };

        tick();
        const intervalId = setInterval(tick, 1000);
        return () => clearInterval(intervalId);
    }, [
        draftStatus,
        draftData?.pickDeadline,
        draftData?.currentPick,
        draftData?.pausedTimeRemaining,
        isAuctionDraft,
        auctionLive?.bidDeadline,
        auctionLive?.currentPlayer?.id,
    ]);

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

    // Load all NFL players and teams data
    useEffect(() => {
        const fetchPlayers = async () => {
            try {
                if (allPlayers?.length) {
                    const sortedPlayers = [...allPlayers]
                        .filter(isOnActiveNflRoster)
                        .sort((a, b) => {
                        if (a.rank && b.rank) return a.rank - b.rank;
                        return a.name.localeCompare(b.name);
                    });
                    setAllNFLPlayers(sortedPlayers);
                    setFilteredPlayers(sortedPlayers);
                    return;
                }

                const players = await nflPlayerService.getAllPlayers();
                if (players && players.length > 0) {
                    const sortedPlayers = players
                        .filter(isOnActiveNflRoster)
                        .sort((a, b) => {
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

    const autoPickPlayer = async () => {
        if (isAuctionDraft || autoPickInFlightRef.current) return;

        const pool = draftablePlayers.length ? draftablePlayers : draftData?.availablePlayers || [];
        if (!pool.length && !draftBoard.some(Boolean)) return;

        const availableIds = new Set(pool.map((player) => String(player.id)));

        // Prefer the next still-available player on this team's draft board (slot order)
        let boardSlotIndex = -1;
        let selectedPlayer = null;
        for (let i = 0; i < draftBoard.length; i += 1) {
            const boardPlayer = draftBoard[i];
            if (!boardPlayer?.id) continue;
            if (!availableIds.has(String(boardPlayer.id))) continue;
            selectedPlayer = pool.find((p) => String(p.id) === String(boardPlayer.id)) || boardPlayer;
            boardSlotIndex = i;
            break;
        }

        let fromBoard = boardSlotIndex >= 0;

        // Fall back to best available from the draft pool (lowest rank number)
        if (!selectedPlayer) {
            fromBoard = false;
            selectedPlayer = [...pool].sort((a, b) => (a.rank || 9999) - (b.rank || 9999))[0];
        }

        if (!selectedPlayer?.id) return;

        autoPickInFlightRef.current = true;
        try {
            await draftService.makeDraftPick(currentLeague.id, currentTeamId, selectedPlayer.id);

            if (fromBoard && boardSlotIndex >= 0) {
                setDraftBoard((prev) => {
                    const next = [...prev];
                    next[boardSlotIndex] = null;
                    return next;
                });
            }

            showMessage(
                fromBoard
                    ? `Clock expired — auto-drafted ${selectedPlayer.name} from your draft board.`
                    : `Clock expired — auto-drafted ${selectedPlayer.name} (rank ${selectedPlayer.rank}).`,
                'success',
            );
            setIsMyTurn(false);
            setIsOnClock(false);
        } catch (error) {
            console.error('Auto-pick failed:', error);
        } finally {
            autoPickInFlightRef.current = false;
        }
    };

    // Standard / snake: auto-pick best available when the clock hits 0
    useEffect(() => {
        if (isAuctionDraft) return;
        if (draftStatus !== 'live' || !isMyTurn) return;
        if (!draftData?.pickDeadline) return;
        if (localTimeRemaining > 0) return;
        if (autoPickInFlightRef.current) return;

        autoPickPlayer();
    }, [
        localTimeRemaining,
        isMyTurn,
        draftStatus,
        isAuctionDraft,
        draftData?.pickDeadline,
        draftData?.currentPick,
    ]);

    // Auction: award player when bid timer expires
    useEffect(() => {
        if (!isAuctionDraft || draftStatus !== 'live') return;
        if (!auctionLive?.isActive || !auctionLive?.bidDeadline) return;
        if (localTimeRemaining > 0) return;
        if (auctionResolveInFlightRef.current || !currentLeague?.id) return;

        auctionResolveInFlightRef.current = true;
        draftService.resolveExpiredAuction(currentLeague.id)
            .then((result) => {
                if (result?.resolved) {
                    showMessage(
                        `${result.player?.name} awarded for $${result.winningBid}.`,
                        'success',
                    );
                }
            })
            .catch((error) => {
                console.error('Auction resolve failed:', error);
            })
            .finally(() => {
                auctionResolveInFlightRef.current = false;
            });
    }, [
        isAuctionDraft,
        draftStatus,
        auctionLive?.isActive,
        auctionLive?.bidDeadline,
        auctionLive?.currentPlayer?.id,
        localTimeRemaining,
        currentLeague?.id,
    ]);

    const makePick = async (player) => {
        if (!player || !player.id) {
            showMessage("Invalid player selected", "error");
            return;
        }

        if (isAuctionDraft) {
            showMessage("This is an auction draft — nominate or bid instead of drafting.", "error");
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
            const result = await draftService.makeDraftPick(
                currentLeague.id, 
                currentTeamId, 
                player.id
            );
            
            console.log('Draft pick successful:', result);
            showMessage(`Drafted ${player.name}!`, "success");
            
            setIsMyTurn(false);
            setIsOnClock(false);
        } catch (error) {
            console.error("Error making pick:", error);
            showMessage(error.message || "Error making pick", "error");
        }
    };

    const handleAuctionBid = async (amount) => {
        if (!auctionPlayer) {
            showMessage('No player is up for auction.', 'error');
            return;
        }

        try {
            const result = await draftService.placeAuctionBid(
                currentLeague.id,
                currentTeamId,
                amount,
            );
            showMessage(`Bid placed: $${result.currentBid}`, 'success');
            setBidAmount((result.currentBid || amount) + 1);
        } catch (error) {
            console.error('Error placing bid:', error);
            showMessage(error.message || 'Error placing bid', 'error');
        }
    };

    const handleNominatePlayer = async (player) => {
        try {
            const result = await draftService.nominatePlayer(
                currentLeague.id,
                currentTeamId,
                player.id,
            );
            setBidAmount((result.currentBid || 1) + 1);
            showMessage(`Nominated ${player.name} for auction at $${result.currentBid}`, 'success');
        } catch (error) {
            console.error('Error nominating player:', error);
            showMessage(error.message || 'Error nominating player', 'error');
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
            showMessage(
                result?.type === 'auction' || isAuctionDraft
                    ? 'Auction started! First team can nominate a player.'
                    : 'Draft started!',
                'success',
            );
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

    const canStartDraft = ['pending', 'order_set', 'scheduled', 'completed'].includes(draftStatus);
    const canPauseDraft = draftStatus === 'live';
    const canResumeDraft = draftStatus === 'paused';
    const canStopDraft = ['live', 'paused'].includes(draftStatus);
    const hasDraftOrder = Boolean(
        draftOrder?.length
        || draftData?.nominationOrder?.length
        || draftData?.roundOneOrder?.length
        || teamsData.length
    );

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

            {/* Commissioner Controls — start / pause / resume / stop only */}
                <div className="mb-6 p-4 bg-emerald-900 rounded-lg">
                    <h3 className="text-xl font-semibold text-purple-400 mb-4">
                        Commissioner Controls
                        {!isCommissioner && <span className="text-sm text-red-400 ml-2">(Commissioner only)</span>}
                    </h3>

                    {isCommissioner ? (
                        <div className="p-4 rounded-lg bg-emerald-950/70 border border-emerald-700">
                            <p className="text-sm text-emerald-300 mb-4">
                                Configure draft type, order, and schedule in{' '}
                                <span className="font-semibold text-white">Commissioner Tools</span>.
                                Status: <span className="font-semibold text-white">{String(draftStatus || 'pending').replace('_', ' ')}</span>
                            </p>
                            <div className="flex flex-wrap gap-3">
                                {canStartDraft && (
                                    <button
                                        type="button"
                                        onClick={handleStartDraft}
                                        disabled={isDraftActionLoading || !hasDraftOrder}
                                        className="px-5 py-2.5 bg-green-600 hover:bg-green-700 rounded-md font-semibold disabled:opacity-50"
                                    >
                                        Start Draft
                                    </button>
                                )}
                                {canPauseDraft && (
                                    <button
                                        type="button"
                                        onClick={handlePauseDraft}
                                        disabled={isDraftActionLoading}
                                        className="px-5 py-2.5 bg-yellow-600 hover:bg-yellow-700 rounded-md font-semibold disabled:opacity-50"
                                    >
                                        Pause Draft
                                    </button>
                                )}
                                {canResumeDraft && (
                                    <button
                                        type="button"
                                        onClick={handleResumeDraft}
                                        disabled={isDraftActionLoading}
                                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-md font-semibold disabled:opacity-50"
                                    >
                                        Resume Draft
                                    </button>
                                )}
                                {canStopDraft && (
                                    <button
                                        type="button"
                                        onClick={() => setShowStopModal(true)}
                                        disabled={isDraftActionLoading}
                                        className="px-5 py-2.5 bg-red-600 hover:bg-red-700 rounded-md font-semibold disabled:opacity-50"
                                    >
                                        Stop Draft
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm text-emerald-300">
                            Draft controls are available to the league commissioner only.
                            Draft setup is in Commissioner Tools.
                        </p>
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
                        {draftStatus === 'live' && isAuctionDraft && (
                            <div className="mt-4 p-3 bg-purple-800 rounded-lg">
                                <div className="text-purple-200 font-medium">
                                    {auctionLive?.isActive ? 'Auction in progress' : 'Currently nominating:'}
                                </div>
                                <div className="text-white font-semibold text-lg">
                                    {auctionLive?.isActive
                                        ? (auctionPlayer?.name || 'Player')
                                        : (teamsData.find((t) => t.id === nominatorTeamId)?.teamName || 'Unknown Team')}
                                </div>
                            </div>
                        )}
                        {draftStatus === 'live' && !isAuctionDraft && draftData?.currentPick !== undefined && draftOrder[draftData.currentPick] && (
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
                                
                    {/* Enhanced Timer and Current Turn (pick drafts only) */}
                    {!isAuctionDraft && (draftStatus === 'live' || draftStatus === 'paused') && (
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

                    {/* Auction live interface */}
                    {draftStatus === 'live' && isAuctionDraft && (
                        <div className="space-y-6">
                            <div className="bg-purple-900 p-4 rounded-lg">
                                <h3 className="text-xl font-semibold mb-2 text-purple-200">Auction Draft</h3>
                                {auctionLive?.isActive && auctionPlayer ? (
                                    <div className="space-y-3">
                                        <p className="text-lg text-white">
                                            Bidding on: <span className="font-bold">{auctionPlayer.name}</span>
                                            {' '}({auctionPlayer.position} · {auctionPlayer.nflTeam})
                                        </p>
                                        <p className="text-purple-200">
                                            Current bid: <span className="font-bold text-white">${currentBid?.amount || auctionLive.currentBid || 1}</span>
                                            {' '}by{' '}
                                            {teamsData.find((t) => t.id === (currentBid?.teamId || auctionLive.currentBidder))?.teamName || 'Unknown'}
                                        </p>
                                        <p className="text-3xl font-bold text-red-300">{localTimeRemaining}s</p>
                                        <div className="flex flex-wrap items-center gap-3">
                                            <input
                                                type="number"
                                                min={(currentBid?.amount || auctionLive.currentBid || 1) + 1}
                                                value={bidAmount}
                                                onChange={(e) => setBidAmount(parseInt(e.target.value, 10) || 1)}
                                                className="px-3 py-2 bg-emerald-800 text-white border border-emerald-600 rounded w-28"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => handleAuctionBid(bidAmount)}
                                                className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded font-semibold"
                                            >
                                                Place Bid
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div>
                                        <p className="text-purple-200 mb-1">
                                            Nominating: {teamsData.find((t) => t.id === nominatorTeamId)?.teamName || 'Unknown Team'}
                                        </p>
                                        {canNominate ? (
                                            <p className="text-white font-semibold">Your turn to nominate a player below.</p>
                                        ) : (
                                            <p className="text-purple-300">Waiting for nomination...</p>
                                        )}
                                    </div>
                                )}
                            </div>

                            {canNominate && (
                                <SleeperPlayerList
                                    players={visibleDraftPlayers}
                                    title="Nominate a Player"
                                    emptyMessage="No players available to nominate."
                                    maxHeight="24rem"
                                    compact
                                    onPlayerSelect={handleNominatePlayer}
                                    selectLabel="Nominate"
                                />
                            )}

                            {!canNominate && !auctionLive?.isActive && (
                                <div className="bg-emerald-900 p-4 rounded-lg text-emerald-300">
                                    Waiting for {teamsData.find((t) => t.id === nominatorTeamId)?.teamName || 'the next team'} to nominate.
                                </div>
                            )}

                            <div className="bg-emerald-900 p-4 rounded-lg">
                                <h3 className="text-lg font-semibold mb-3 text-emerald-200">
                                    Auction Results ({draftData?.draftedPlayers?.length || 0})
                                </h3>
                                <div className="space-y-2 max-h-64 overflow-y-auto">
                                    {(draftData?.draftedPlayers || []).slice().reverse().map((player, index) => (
                                        <div key={`${player.id}-${index}`} className="p-2 bg-emerald-800 rounded text-sm">
                                            <span className="font-semibold text-white">{player.name}</span>
                                            <span className="text-emerald-300">
                                                {' '}· ${player.bid ?? player.salary ?? '?'} ·{' '}
                                                {teamsData.find((t) => t.id === player.teamId)?.teamName || 'Unknown'}
                                            </span>
                                        </div>
                                    ))}
                                    {!draftData?.draftedPlayers?.length && (
                                        <p className="text-emerald-400 text-sm">No players awarded yet.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Main Draft Interface - Available Players and Drafted Players */}
                    {draftStatus === 'live' && !isAuctionDraft && (
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                            <div className="lg:col-span-7 min-w-0">
                                <SleeperPlayerList
                                    players={visibleDraftPlayers}
                                    title="Available Players"
                                    emptyMessage="No players available. Refresh the page or ask the commissioner to restart the draft."
                                    maxHeight="24rem"
                                    compact
                                    onPlayerSelect={isMyTurn ? makePick : undefined}
                                    selectLabel="Draft"
                                />
                            </div>

                            {/* Drafted Players - Two Columns of 12 Slots Each (narrower) */}
                            <div className="lg:col-span-5 min-w-0">
                                <div className="bg-emerald-900 p-3 rounded-lg">
                                    <h3 className="text-lg font-semibold mb-3 text-emerald-200">Drafted Players</h3>
                                    
                                    {/* Two Columns Layout */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {/* Left Column - 12 Slots */}
                                        <div>
                                            <h4 className="text-sm font-semibold mb-2 text-emerald-200">Column 1 (1-12)</h4>
                                            <div className="space-y-1.5">
                                                {Array.from({ length: 12 }, (_, index) => {
                                                    const slotNumber = index + 1;
                                                    const draftedPlayer = draftData?.draftedPlayers?.[slotNumber - 1];
                                                    return (
                                                        <div 
                                                            key={slotNumber}
                                                            className={`p-2 rounded border ${
                                                                draftedPlayer 
                                                                    ? 'bg-emerald-800 border-emerald-600' 
                                                                    : 'bg-emerald-800/50 border-dashed border-emerald-600/50'
                                                            }`}
                                                        >
                                                            <div className="text-[10px] text-emerald-400 mb-0.5">Slot {slotNumber}</div>
                                                            {draftedPlayer ? (
                                                                <div>
                                                                    <div className="font-semibold text-xs truncate">{draftedPlayer.name}</div>
                                                                    <div className="text-[10px] text-emerald-300 truncate">
                                                                        {draftedPlayer.position} • {draftedPlayer.nflTeam}
                                                                    </div>
                                                                    <div className="text-[10px] text-emerald-400 mt-0.5 truncate">
                                                                        {teamsData.find(t => t.id === draftedPlayer.teamId)?.teamName || 'Unknown'}
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div className="text-center text-emerald-400 text-xs py-1">
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
                                            <h4 className="text-sm font-semibold mb-2 text-emerald-200">Column 2 (13-24)</h4>
                                            <div className="space-y-1.5">
                                                {Array.from({ length: 12 }, (_, index) => {
                                                    const slotNumber = index + 13;
                                                    const draftedPlayer = draftData?.draftedPlayers?.[slotNumber - 1];
                                                    return (
                                                        <div 
                                                            key={slotNumber}
                                                            className={`p-2 rounded border ${
                                                                draftedPlayer 
                                                                    ? 'bg-emerald-800 border-emerald-600' 
                                                                    : 'bg-emerald-800/50 border-dashed border-emerald-600/50'
                                                            }`}
                                                        >
                                                            <div className="text-[10px] text-emerald-400 mb-0.5">Slot {slotNumber}</div>
                                                            {draftedPlayer ? (
                                                                <div>
                                                                    <div className="font-semibold text-xs truncate">{draftedPlayer.name}</div>
                                                                    <div className="text-[10px] text-emerald-300 truncate">
                                                                        {draftedPlayer.position} • {draftedPlayer.nflTeam}
                                                                    </div>
                                                                    <div className="text-[10px] text-emerald-400 mt-0.5 truncate">
                                                                        {teamsData.find(t => t.id === draftedPlayer.teamId)?.teamName || 'Unknown'}
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div className="text-center text-emerald-400 text-xs py-1">
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

                    {/* Draft Order / Nomination Order */}
                    <div className="bg-emerald-900 p-4 rounded-lg">
                        <h3 className="text-xl font-semibold mb-4 text-emerald-200">
                            {isAuctionDraft ? 'Nomination Order' : 'Draft Order'}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {(isAuctionDraft ? nominationOrder : draftOrder).map((teamId, index) => {
                                const team = teamsData.find(t => t.id === teamId);
                                const isCurrent = isAuctionDraft
                                    ? (!auctionLive?.isActive && nominatorTeamId === teamId)
                                    : draftData?.currentPick === index;
                                return (
                                    <div key={`${teamId}-${index}`} className={`p-3 rounded ${isCurrent ? 'bg-purple-800' : 'bg-emerald-800'}`}>
                                        <div className="font-semibold">
                                            {index + 1}. {team?.teamName || 'Unknown Team'}
                                        </div>
                                        {isCurrent && (
                                            <div className="text-sm text-purple-300">
                                                {isAuctionDraft ? 'Nominating' : 'Current Pick'}
                                            </div>
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
        </div>
    );
};

export default DraftCenter; 