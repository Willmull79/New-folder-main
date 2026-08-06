import React, { useEffect, useRef, useState } from 'react';
import {
    addDoc,
    collection,
    getDocs,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    startAfter,
} from 'firebase/firestore';
import { getModularFirestore } from '../config/firebaseModular.js';
import {
    NOTIFICATION_TYPES,
    createLeagueNotifications,
} from '../utils/leagueNotifications.js';
import './LeagueChat.css';

const PAGE_SIZE = 100;

/**
 * Real-time league chat.
 * Newest 100 via live query; older history via "Load older messages".
 */
export const LeagueChat = ({ leagueId, senderId, senderName, teamsData = [] }) => {
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [isLoadingOlder, setIsLoadingOlder] = useState(false);
    const [hasMoreOlder, setHasMoreOlder] = useState(false);
    const [error, setError] = useState('');
    const messagesEndRef = useRef(null);
    const oldestLiveDocRef = useRef(null);
    const olderCursorRef = useRef(null);
    const stickToBottomRef = useRef(true);

    useEffect(() => {
        if (!leagueId) {
            setMessages([]);
            oldestLiveDocRef.current = null;
            olderCursorRef.current = null;
            setHasMoreOlder(false);
            return undefined;
        }

        const db = getModularFirestore();
        const messagesRef = collection(db, 'leagues', leagueId, 'messages');
        const liveQuery = query(messagesRef, orderBy('createdAt', 'desc'), limit(PAGE_SIZE));

        const unsubscribe = onSnapshot(
            liveQuery,
            (snapshot) => {
                const liveChronological = [...snapshot.docs].reverse().map((docSnap) => ({
                    id: docSnap.id,
                    ...docSnap.data(),
                }));

                oldestLiveDocRef.current = snapshot.docs.length
                    ? snapshot.docs[snapshot.docs.length - 1]
                    : null;
                olderCursorRef.current = oldestLiveDocRef.current;
                setHasMoreOlder(snapshot.docs.length >= PAGE_SIZE);

                setMessages((prev) => {
                    const liveIds = new Set(liveChronological.map((m) => m.id));
                    const olderOnly = prev.filter((m) => !liveIds.has(m.id));
                    return [...olderOnly, ...liveChronological];
                });
                setError('');
            },
            (snapshotError) => {
                console.error('League chat listener error:', snapshotError);
                setError(snapshotError?.message || 'Failed to load chat messages.');
            }
        );

        return () => unsubscribe();
    }, [leagueId]);

    useEffect(() => {
        if (stickToBottomRef.current) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    const loadOlderMessages = async () => {
        if (!leagueId || !olderCursorRef.current || isLoadingOlder || !hasMoreOlder) return;
        setIsLoadingOlder(true);
        stickToBottomRef.current = false;
        try {
            const db = getModularFirestore();
            const messagesRef = collection(db, 'leagues', leagueId, 'messages');
            const olderQuery = query(
                messagesRef,
                orderBy('createdAt', 'desc'),
                startAfter(olderCursorRef.current),
                limit(PAGE_SIZE)
            );
            const snap = await getDocs(olderQuery);
            if (snap.docs.length < PAGE_SIZE) {
                setHasMoreOlder(false);
            }
            if (snap.empty) {
                setHasMoreOlder(false);
                return;
            }
            olderCursorRef.current = snap.docs[snap.docs.length - 1];
            const olderChronological = [...snap.docs].reverse().map((docSnap) => ({
                id: docSnap.id,
                ...docSnap.data(),
            }));
            setMessages((prev) => {
                const existing = new Set(prev.map((m) => m.id));
                const fresh = olderChronological.filter((m) => !existing.has(m.id));
                return [...fresh, ...prev];
            });
        } catch (loadError) {
            console.error('Error loading older chat messages:', loadError);
            setError(loadError?.message || 'Failed to load older messages.');
        } finally {
            setIsLoadingOlder(false);
        }
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        const trimmed = text.trim();
        if (!trimmed || !leagueId || !senderId || isSending) return;

        setIsSending(true);
        stickToBottomRef.current = true;
        setError('');
        try {
            const db = getModularFirestore();
            const messagesRef = collection(db, 'leagues', leagueId, 'messages');
            const displayName = senderName || 'Manager';
            await addDoc(messagesRef, {
                text: trimmed,
                senderId,
                senderName: displayName,
                createdAt: serverTimestamp(),
            });

            const recipientUserIds = (teamsData || [])
                .map((team) => team?.ownerId)
                .filter(Boolean);
            await createLeagueNotifications(db, leagueId, {
                type: NOTIFICATION_TYPES.LEAGUE_CHAT,
                recipientUserIds,
                senderId,
                senderName: displayName,
                message: `${displayName} posted in league chat.`,
                extra: { preview: trimmed.slice(0, 120) },
            });

            setText('');
        } catch (submitError) {
            console.error('Error sending chat message:', submitError);
            setError(submitError?.message || 'Failed to send message.');
        } finally {
            setIsSending(false);
        }
    };

    const formatTime = (createdAt) => {
        if (!createdAt?.toDate) return '';
        try {
            return createdAt.toDate().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        } catch (_) {
            return '';
        }
    };

    if (!leagueId) {
        return (
            <div className="league-chat">
                <p className="league-chat__empty">Select a league to open chat.</p>
            </div>
        );
    }

    return (
        <div className="league-chat">
            <header className="league-chat__header">
                <h2 className="league-chat__title">League Chat</h2>
                <p className="league-chat__subtitle">Real-time messages for your league</p>
            </header>

            <div className="league-chat__window" role="log" aria-live="polite">
                {error && <p className="league-chat__error">{error}</p>}
                {hasMoreOlder && (
                    <div className="flex justify-center py-2">
                        <button
                            type="button"
                            onClick={loadOlderMessages}
                            disabled={isLoadingOlder}
                            className="text-sm text-emerald-300 hover:text-white disabled:opacity-50"
                        >
                            {isLoadingOlder ? 'Loading…' : 'Load older messages'}
                        </button>
                    </div>
                )}
                {messages.length === 0 && !error ? (
                    <p className="league-chat__empty">No messages yet. Say hello!</p>
                ) : (
                    messages.map((message) => {
                        const isMine = message.senderId === senderId;
                        return (
                            <div
                                key={message.id}
                                className={`league-chat__bubble ${isMine ? 'league-chat__bubble--mine' : 'league-chat__bubble--theirs'}`}
                            >
                                <div className="league-chat__meta">
                                    <span className="league-chat__sender">
                                        {isMine ? 'You' : (message.senderName || 'Manager')}
                                    </span>
                                    <span className="league-chat__time">{formatTime(message.createdAt)}</span>
                                </div>
                                <p className="league-chat__text">{message.text}</p>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            <form className="league-chat__composer" onSubmit={handleSubmit}>
                <input
                    type="text"
                    className="league-chat__input"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Type a message..."
                    maxLength={500}
                    disabled={!senderId || isSending}
                    aria-label="Chat message"
                />
                <button
                    type="submit"
                    className="league-chat__send"
                    disabled={!senderId || isSending || !text.trim()}
                >
                    {isSending ? 'Sending…' : 'Send'}
                </button>
            </form>
        </div>
    );
};

export default LeagueChat;
