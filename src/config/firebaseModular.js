import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { firebaseConfig } from './firebase.js';

/** Modular Firebase app (npm SDK) — used by LeagueChat and other modular-only features. */
export const getModularApp = () => {
    if (getApps().length) {
        return getApp();
    }
    return initializeApp(firebaseConfig);
};

/** Initialize Auth so Firestore attaches the persisted signed-in user credentials. */
export const getModularAuth = () => getAuth(getModularApp());

export const getModularFirestore = () => {
    getModularAuth();
    return getFirestore(getModularApp());
};
