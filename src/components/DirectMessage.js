import React, { useEffect, useRef, useState } from 'react';
import {
    addDoc,
    collection,
    doc,
    getDocs,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    startAfter,
} from 'firebase/firestore';
import { getModularFirestore } from '../config/firebaseModular.js';
import {
    NOTIFICATION_TYPES,
    createLeagueNotifications,
} from '../utils/leagueNotifications.js';
import './DirectMessage.css';

const PAGE_SIZE = 100;

/**
 * One-on-one DMs. Newest 100 live; older via pagination.
 */
export const DirectMessage = ({ currentUser, targetUser, leagueId }) => {
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [isLoadingOlder, setIsLoadingOlder] = useState(false);
    const [hasMoreOlder, setHasMoreOlder] = useState(false);
    const [error, setError] = useState('');
    const messagesEndRef = useRef(null);
    const chatDocEnsuredRef = useRef(false);
    const olderCursorRef = useRef(null);
    const stickToBottomRef = useRef(true);

    const getChatId = (uidA, uidB) => [uidA, uidB].sort().join('_');

    const chatId =
        currentUser?.uid && targetUser?.uid
            ? getChatId(currentUser.uid, targetUser.uid)
            : null;

    useEffect(() => {
        chatDocEnsuredRef.current = false;
        olderCursorRef.current = null;
        setHasMoreOlder(false);
    }, [chatId]);

    useEffect(() => {
        if (!chatId) {
            setMessages([]);
            return undefined;
        }

        const db = getModularFirestore();
        const messagesRef = collection(db, 'direct_messages', chatId, 'messages');
        const liveQuery = query(messagesRef, orderBy('createdAt', 'desc'), limit(PAGE_SIZE));

        const unsubscribe = onSnapshot(
            liveQuery,
            (snapshot) => {
                const liveChronological = [...snapshot.docs].reverse().map((docSnap) => ({
                    id: docSnap.id,
                    ...docSnap.data(),
                }));
                olderCursorRef.current = snapshot.docs.length
                    ? snapshot.docs[snapshot.docs.length - 1]
                    : null;
                setHasMoreOlder(snapshot.docs.length >= PAGE_SIZE);
                setMessages((prev) => {
                    const liveIds = new Set(liveChronological.map((m) => m.id));
                    const olderOnly = prev.filter((m) => !liveIds.has(m.id));
                    return [...olderOnly, ...liveChronological];
                });
                setError('');
            },
            (snapshotError) => {
                console.error('Direct message listener error:', snapshotError);
                setError(snapshotError?.message || 'Failed to load messages.');
            }
        );

        return () => unsubscribe();
    }, [chatId]);

    useEffect(() => {
        if (stickToBottomRef.current) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    const loadOlderMessages = async () => {
        if (!chatId || !olderCursorRef.current || isLoadingOlder || !hasMoreOlder) return;
        setIsLoadingOlder(true);
        stickToBottomRef.current = false;
        try {
            const db = getModularFirestore();
            const messagesRef = collection(db, 'direct_messages', chatId, 'messages');
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
            console.error('Error loading older DMs:', loadError);
            setError(loadError?.message || 'Failed to load older messages.');
        } finally {
            setIsLoadingOlder(false);
        }
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        const trimmed = text.trim();
        if (!trimmed || !chatId || !currentUser?.uid || isSending) return;

        setIsSending(true);
        stickToBottomRef.current = true;
        setError('');
        try {
            const db = getModularFirestore();
            const chatDocRef = doc(db, 'direct_messages', chatId);

            if (!chatDocEnsuredRef.current) {
                await setDoc(
                    chatDocRef,
                    {
                        participants: [currentUser.uid, targetUser.uid],
                        updatedAt: serverTimestamp(),
                    },
                    { merge: true }
                );
                chatDocEnsuredRef.current = true;
            }

            const messagesRef = collection(db, 'direct_messages', chatId, 'messages');
            await addDoc(messagesRef, {
                text: trimmed,
                senderId: currentUser.uid,
                createdAt: serverTimestamp(),
            });

            if (leagueId && targetUser?.uid) {
                const senderLabel = currentUser.displayName || 'A manager';
                await createLeagueNotifications(db, leagueId, {
                    type: NOTIFICATION_TYPES.DIRECT_MESSAGE,
                    recipientUserIds: [targetUser.uid],
                    senderId: currentUser.uid,
                    senderName: senderLabel,
                    message: `${senderLabel} sent you a direct message.`,
                    extra: {
                        chatId,
                        preview: trimmed.slice(0, 120),
                    },
                });
            }

            setText('');
        } catch (submitError) {
            console.error('Error sending direct message:', submitError);
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

    if (!currentUser?.uid || !targetUser?.uid) {
        return (
            <div className="direct-message">
                <p className="direct-message__empty">Select a manager to start a private message.</p>
            </div>
        );
    }

    if (currentUser.uid === targetUser.uid) {
        return (
            <div className="direct-message">
                <p className="direct-message__empty">You cannot message yourself.</p>
            </div>
        );
    }

    return (
        <div className="direct-message">
            <header className="direct-message__header">
                <h2 className="direct-message__title">
                    Message {targetUser.displayName || 'Manager'}
                </h2>
                <p className="direct-message__subtitle">Private conversation</p>
            </header>

            <div className="direct-message__window" role="log" aria-live="polite">
                {error && <p className="direct-message__error">{error}</p>}
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
                    <p className="direct-message__empty">No messages yet. Say hello!</p>
                ) : (
                    messages.map((message) => {
                        const isMine = message.senderId === currentUser.uid;
                        return (
                            <div
                                key={message.id}
                                className={`direct-message__bubble ${
                                    isMine
                                        ? 'direct-message__bubble--mine'
                                        : 'direct-message__bubble--theirs'
                                }`}
                            >
                                <div className="direct-message__meta">
                                    <span className="direct-message__sender">
                                        {isMine
                                            ? (currentUser.displayName || 'You')
                                            : (targetUser.displayName || 'Manager')}
                                    </span>
                                    <span className="direct-message__time">{formatTime(message.createdAt)}</span>
                                </div>
                                <p className="direct-message__text">{message.text}</p>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            <form className="direct-message__composer" onSubmit={handleSubmit}>
                <input
                    type="text"
                    className="direct-message__input"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={`Message ${targetUser.displayName || ''}...`}
                    maxLength={500}
                    disabled={isSending}
                    aria-label="Direct message"
                />
                <button
                    type="submit"
                    className="direct-message__send"
                    disabled={isSending || !text.trim()}
                >
                    {isSending ? 'Sending…' : 'Send'}
                </button>
            </form>
        </div>
    );
};

export default DirectMessage;
