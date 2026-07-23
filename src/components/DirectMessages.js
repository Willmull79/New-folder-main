import React, { useMemo, useState } from 'react';
import { DirectMessage } from './DirectMessage.js';

/**
 * League-scoped picker that opens a one-on-one DirectMessage thread.
 */
export const DirectMessages = ({
    currentUserId,
    currentUserDisplayName,
    teamsData = [],
}) => {
    const [targetUid, setTargetUid] = useState('');

    const contacts = useMemo(() => {
        const byOwner = new Map();
        (teamsData || []).forEach((team) => {
            if (!team?.ownerId || team.ownerId === currentUserId) return;
            if (byOwner.has(team.ownerId)) return;
            byOwner.set(team.ownerId, {
                uid: team.ownerId,
                displayName: team.ownerName || team.teamName || 'Manager',
                teamName: team.teamName || '',
            });
        });
        return Array.from(byOwner.values()).sort((a, b) =>
            a.displayName.localeCompare(b.displayName)
        );
    }, [teamsData, currentUserId]);

    const currentUser = {
        uid: currentUserId,
        displayName: currentUserDisplayName || 'You',
    };

    const targetUser = contacts.find((c) => c.uid === targetUid) || null;

    return (
        <div className="p-4 sm:p-6 max-w-3xl mx-auto my-2 sm:my-8 space-y-4">
            <div className="bg-emerald-950 border border-emerald-700 rounded-lg p-4">
                <h2 className="text-2xl font-bold text-white mb-2">Direct Messages</h2>
                <p className="text-sm text-emerald-300 mb-4">
                    Private one-on-one chat with another manager in this league.
                </p>
                <label className="block">
                    <span className="text-emerald-200 text-sm font-medium">Message</span>
                    <select
                        value={targetUid}
                        onChange={(e) => setTargetUid(e.target.value)}
                        className="w-full p-3 mt-1 rounded-md bg-emerald-800 text-white border border-emerald-600 focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                    >
                        <option value="">Select a manager...</option>
                        {contacts.map((contact) => (
                            <option key={contact.uid} value={contact.uid}>
                                {contact.displayName}
                                {contact.teamName ? ` (${contact.teamName})` : ''}
                            </option>
                        ))}
                    </select>
                </label>
                {contacts.length === 0 && (
                    <p className="text-sm text-yellow-300 mt-3">
                        No other managers in this league yet.
                    </p>
                )}
            </div>

            {targetUser ? (
                <DirectMessage currentUser={currentUser} targetUser={targetUser} />
            ) : (
                <div className="bg-emerald-950 border border-emerald-700 rounded-lg p-8 text-center text-emerald-300">
                    Choose a manager above to open a private chat.
                </div>
            )}
        </div>
    );
};

export default DirectMessages;
