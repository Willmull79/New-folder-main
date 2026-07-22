import React, { useEffect, useState } from 'react';
import { useFirebase } from '../contexts/FirebaseContext.js';
import { Avatar } from './Avatar.js';
import { AccountSettings } from './AccountSettings.js';
import { appId } from '../config/firebase.js';

export const AccountProfile = ({ showMessage }) => {
    const {
        db,
        userId,
        userDisplayName,
        userAvatarUrl,
        updateUserProfile,
    } = useFirebase();
    const [username, setUsername] = useState(userDisplayName || '');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setUsername(userDisplayName || '');
    }, [userDisplayName]);

    const handleSaveUsername = async () => {
        const nextName = username.trim();
        if (!nextName) {
            showMessage('Username cannot be empty.', 'error');
            return;
        }
        if (nextName.length > 32) {
            showMessage('Username must be 32 characters or fewer.', 'error');
            return;
        }

        setIsSaving(true);
        try {
            await updateUserProfile({ username: nextName });
            showMessage('Username updated successfully!', 'success');
        } catch (error) {
            console.error('Error updating username:', error);
            showMessage(error.message || 'Failed to update username.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    if (!userId || !db) {
        return (
            <div className="bg-emerald-950 p-6 rounded-lg text-center text-emerald-300">
                Sign in to manage your profile.
            </div>
        );
    }

    const profilePath = `artifacts/${appId}/users/${userId}/userProfile/settings`;

    return (
        <div className="p-4 sm:p-6 bg-emerald-950 rounded-lg shadow-xl max-w-xl mx-auto my-2 sm:my-8 text-white space-y-6">
            <div>
                <h2 className="text-3xl font-bold text-white mb-2">Profile Settings</h2>
                <p className="text-emerald-300">Update your profile, username, and sign-in methods.</p>
            </div>

            <div className="bg-emerald-900 p-6 rounded-lg border border-emerald-700 space-y-8">
                <div className="flex flex-col items-center gap-4">
                    <h3 className="text-lg font-semibold text-purple-300 self-start">Profile Picture</h3>
                    <Avatar
                        docRefPath={profilePath}
                        storagePath={`user-avatars/${userId}`}
                        currentAvatarUrl={userAvatarUrl}
                        showMessage={showMessage}
                        size="h-28 w-28"
                        editable
                        onAvatarUpdated={(url) => updateUserProfile({ avatarUrl: url })}
                    />
                    <p className="text-sm text-emerald-400 text-center">
                        Click the edit icon on your photo to upload a new image.
                    </p>
                </div>

                <div>
                    <h3 className="text-lg font-semibold text-purple-300 mb-3">Username</h3>
                    <label className="block">
                        <span className="text-emerald-200 text-sm font-medium">Display name</span>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            maxLength={32}
                            className="w-full p-3 mt-1 rounded-md bg-emerald-800 text-white border border-emerald-600 focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                            placeholder="Enter a username"
                        />
                    </label>
                    <button
                        type="button"
                        onClick={handleSaveUsername}
                        disabled={isSaving || username.trim() === (userDisplayName || '')}
                        className="mt-4 w-full sm:w-auto px-6 py-3 bg-purple-800 hover:bg-purple-900 text-white font-bold rounded-md disabled:opacity-50 transition-colors"
                    >
                        {isSaving ? 'Saving...' : 'Save Username'}
                    </button>
                </div>
            </div>

            <div className="bg-emerald-900 p-6 rounded-lg border border-emerald-700">
                <h3 className="text-xl font-bold text-purple-300 mb-2">Account Settings</h3>
                <p className="text-sm text-emerald-400 mb-6">
                    Link additional sign-in methods so you can log in with email or phone.
                </p>
                <AccountSettings showMessage={showMessage} embedded />
            </div>
        </div>
    );
};

export default AccountProfile;
