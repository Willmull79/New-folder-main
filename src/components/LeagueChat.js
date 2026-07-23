import React, { useEffect, useRef, useState } from 'react';
import {
    addDoc,
    collection,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
} from 'firebase/firestore';
import { getModularFirestore } from '../config/firebaseModular.js';
import './LeagueChat.css';

/**
 * Real-time league chat using the modular Firebase Firestore SDK.
 * Schema: leagues/{leagueId}/messages/{messageId}
 */
export const LeagueChat = ({ leagueId, senderId, senderName }) => {
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState('');
    const messagesEndRef = useRef(null);

    useEffect(() => {
        if (!leagueId) {
            setMessages([]);
            return undefined;
        }

        const db = getModularFirestore();
        const messagesRef = collection(db, 'leagues', leagueId, 'messages');
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
                console.error('League chat listener error:', snapshotError);
                setError(snapshotError?.message || 'Failed to load chat messages.');
            }
        );

        return () => unsubscribe();
    }, [leagueId]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSubmit = async (event) => {
        event.preventDefault();
        const trimmed = text.trim();
        if (!trimmed || !leagueId || !senderId || isSending) return;

        setIsSending(true);
        setError('');
        try {
            const db = getModularFirestore();
            const messagesRef = collection(db, 'leagues', leagueId, 'messages');
            await addDoc(messagesRef, {
                text: trimmed,
                senderId,
                senderName: senderName || 'Manager',
                createdAt: serverTimestamp(),
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
