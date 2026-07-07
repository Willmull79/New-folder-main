import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { appId, waitForFirebase } from '../config/firebase.js';

const FirebaseContext = createContext(null);

const loadUserProfile = async (firestoreDb, user) => {
    const userProfileDocRef = firestoreDb.doc(`artifacts/${appId}/users/${user.uid}/userProfile/settings`);
    const docSnap = await userProfileDocRef.get();
    if (docSnap.exists) {
        const data = docSnap.data();
        return {
            displayName: data.username || user.email || user.uid.substring(0, 6),
            avatarUrl: data.avatarUrl || null,
        };
    }
    const displayName = user.email?.split('@')[0] || user.uid.substring(0, 6);
    await userProfileDocRef.set({ username: displayName }, { merge: true });
    return { displayName, avatarUrl: null };
};

export const FirebaseProvider = ({ children }) => {
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [storage, setStorage] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [isFirebaseReady, setIsFirebaseReady] = useState(false);
    const [firebaseError, setFirebaseError] = useState(null);
    const [userDisplayName, setUserDisplayName] = useState(null);
    const [userAvatarUrl, setUserAvatarUrl] = useState(null);

    const applyUser = useCallback(async (firestoreDb, user) => {
        if (!user) {
            setUserId(null);
            setUserDisplayName(null);
            setUserAvatarUrl(null);
            return;
        }

        setUserId(user.uid);
        setUserDisplayName(user.email?.split('@')[0] || user.uid.substring(0, 6));
        setUserAvatarUrl(null);

        try {
            const profile = await Promise.race([
                loadUserProfile(firestoreDb, user),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Profile load timed out')), 8000)),
            ]);
            setUserDisplayName(profile.displayName);
            setUserAvatarUrl(profile.avatarUrl);
        } catch (profileError) {
            console.warn('Could not load user profile, using defaults:', profileError);
            setUserDisplayName(user.email?.split('@')[0] || user.uid.substring(0, 6));
            setUserAvatarUrl(null);
        }
    }, []);

    useEffect(() => {
        let unsubscribe;
        let cancelled = false;

        const init = async () => {
            try {
                const fb = await waitForFirebase();
                if (cancelled) return;

                const firestoreDb = fb.firestore();
                const firebaseAuth = fb.auth();
                const firebaseStorage = fb.storage();

                await firebaseAuth.setPersistence(fb.auth.Auth.Persistence.LOCAL);

                setDb(firestoreDb);
                setAuth(firebaseAuth);
                setStorage(firebaseStorage);
                setIsFirebaseReady(true);
                setFirebaseError(null);

                unsubscribe = firebaseAuth.onAuthStateChanged((user) => {
                    applyUser(firestoreDb, user).finally(() => {
                        if (!cancelled) setIsAuthReady(true);
                    });
                });
            } catch (error) {
                console.error('Error initializing Firebase:', error);
                if (!cancelled) {
                    setFirebaseError(error.message || 'Failed to connect to Firebase.');
                    setIsFirebaseReady(false);
                    setIsAuthReady(true);
                }
            }
        };

        init();

        return () => {
            cancelled = true;
            if (unsubscribe) unsubscribe();
        };
    }, [applyUser]);

    const refreshAuthState = useCallback(async () => {
        if (!auth || !db) return false;
        const user = auth.currentUser;
        if (!user) return false;
        await applyUser(db, user);
        return true;
    }, [auth, db, applyUser]);

    return (
        <FirebaseContext.Provider value={{
            db,
            auth,
            storage,
            userId,
            isAuthReady,
            isFirebaseReady,
            firebaseError,
            userDisplayName,
            userAvatarUrl,
            refreshAuthState,
        }}>
            {children}
        </FirebaseContext.Provider>
    );
};

export const useFirebase = () => {
    const context = useContext(FirebaseContext);
    if (!context) {
        throw new Error('useFirebase must be used within a FirebaseProvider');
    }
    return context;
};
