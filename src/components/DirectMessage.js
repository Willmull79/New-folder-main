import React, { useEffect, useRef, useState } from 'react';
import {
    addDoc,
    collection,
    doc,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
} from 'firebase/firestore';
import { getModularFirestore } from '../config/firebaseModular.js';
import './DirectMessage.css';

/**
 * One-on-one private Direct Messaging via the modular Firebase Firestore SDK.
 * Schema: direct_messages/{chatId}/messages/{messageId}
 *
 * @param {{ uid: string, displayName: string }} currentUser
 * @param {{ uid: string, displayName: string }} targetUser
 */
export const DirectMessage = ({ currentUser, targetUser }) => {
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState('');
    const messagesEndRef = useRef(null);
    const chatDocEnsuredRef = useRef(false);

    /** Deterministic chat id: sorted UIDs joined with an underscore. */
    const getChatId = (uidA, uidB) => [uidA, uidB].sort().join('_');

    const chatId =
        currentUser?.uid && targetUser?.uid
            ? getChatId(currentUser.uid, targetUser.uid)
            : null;

    useEffect(() => {
        chatDocEnsuredRef.current = false;
    }, [chatId]);

    useEffect(() => {
        if (!chatId) {
            setMessages([]);
            return undefined;
        }

        const db = getModularFirestore();
        const messagesRef = collection(db, 'direct_messages', chatId, 'messages');
        const messagesQuery = query(messagesRef, orderBy('createdAt', 'asc'));

        const unsubscribe = onSnapshot(
            messagesQuery,
            (snapshot) => {
                const nextMessages = snapshot.docs.map((docSnap) => ({
                    id: docSnap.id,
                    ...docSnap.data(),
                }));
                setMessages(nextMessages);
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
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSubmit = async (event) => {
        event.preventDefault();
        const trimmed = text.trim();
        if (!trimmed || !chatId || !currentUser?.uid || isSending) return;

        setIsSending(true);
        setError('');
        try {
            const db = getModularFirestore();
            const chatDocRef = doc(db, 'direct_messages', chatId);

            // Ensure parent chat doc exists with participants before the first message
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
