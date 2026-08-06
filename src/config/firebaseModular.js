import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { firebaseConfig, RECAPTCHA_V3_SITE_KEY } from './firebase.js';

let appCheckInitialized = false;

/**
 * Modular App Check init (reCAPTCHA v3).
 * Safe to call multiple times — only activates once.
 *
 * Exact configuration:
 *   initializeAppCheck(app, {
 *     provider: new ReCaptchaV3Provider(RECAPTCHA_V3_SITE_KEY),
 *     isTokenAutoRefreshEnabled: true,
 *   });
 */
export const ensureModularAppCheck = (app) => {
    if (appCheckInitialized) return;
    if (!RECAPTCHA_V3_SITE_KEY) return;

    try {
        initializeAppCheck(app, {
            provider: new ReCaptchaV3Provider(RECAPTCHA_V3_SITE_KEY),
            isTokenAutoRefreshEnabled: true,
        });
        appCheckInitialized = true;
    } catch (error) {
        if (String(error?.message || error).toLowerCase().includes('already')) {
            appCheckInitialized = true;
            return;
        }
        console.error('Modular App Check init failed:', error);
    }
};

/** Modular Firebase app (npm SDK) — used by LeagueChat and other modular-only features. */
export const getModularApp = () => {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    ensureModularAppCheck(app);
    return app;
};

/** Initialize Auth so Firestore attaches the persisted signed-in user credentials. */
export const getModularAuth = () => getAuth(getModularApp());

export const getModularFirestore = () => {
    getModularAuth();
    return getFirestore(getModularApp());
};
