export const firebaseConfig = {
  apiKey: "AIzaSyATjCS24dzLOgWXTeKHzZhOt4D0jHB2pSE",
  authDomain: "dynasty-420.firebaseapp.com",
  projectId: "dynasty-420",
  storageBucket: "dynasty-420.appspot.com",
  messagingSenderId: "479339876160",
  appId: "1:479339876160:web:bad67f99b552c76eedb4a5",
  measurementId: "G-6PN842Q42W"
};

export const appId = '1:479339876160:web:bad67f99b552c76eedb4a5';

/**
 * reCAPTCHA v3 site key for Firebase App Check.
 * Set in Firebase Console → App Check → reCAPTCHA, or override at runtime:
 *   window.FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY = 'your-site-key'
 */
export const RECAPTCHA_V3_SITE_KEY = (
  (typeof window !== 'undefined' && window.FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY)
  || ''
);

/**
 * Initialize Firebase App Check with the reCAPTCHA v3 provider.
 * Call immediately after initializeApp(), before using Auth/Firestore/Storage.
 *
 * Compat SDK example:
 *   firebase.appCheck().activate(RECAPTCHA_V3_SITE_KEY, true);
 *
 * Modular SDK example:
 *   import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
 *   initializeAppCheck(app, {
 *     provider: new ReCaptchaV3Provider(RECAPTCHA_V3_SITE_KEY),
 *     isTokenAutoRefreshEnabled: true,
 *   });
 */
export const initializeFirebaseAppCheck = (firebaseInstance = null) => {
  const siteKey = RECAPTCHA_V3_SITE_KEY;
  if (!siteKey) {
    console.warn(
      'Firebase App Check skipped: set window.FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY '
      + 'to your reCAPTCHA v3 site key (Firebase Console → App Check).'
    );
    return null;
  }

  try {
    const firebaseSdk = firebaseInstance
      || (typeof firebase !== 'undefined' ? firebase : null);
    if (!firebaseSdk?.appCheck) {
      console.warn('Firebase App Check SDK not loaded (firebase-app-check-compat.js).');
      return null;
    }

    // Pass true so tokens auto-refresh (required for long sessions).
    const appCheck = firebaseSdk.appCheck();
    appCheck.activate(siteKey, true);
    console.log('Firebase App Check initialized (reCAPTCHA v3)');
    return appCheck;
  } catch (error) {
    console.error('Firebase App Check initialization failed:', error);
    return null;
  }
};

export const ensureFirebaseInitialized = () => {
    if (typeof firebase === 'undefined') {
        throw new Error('Firebase is not loaded. Check if Firebase scripts are included.');
    }
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
        initializeFirebaseAppCheck(firebase);
        console.log('Firebase initialized successfully');
    }
    return firebase;
};

/** Wait for CDN Firebase scripts (deferred bundle may run before compat SDK is ready). */
export const waitForFirebase = (timeoutMs = 10000) => new Promise((resolve, reject) => {
    if (typeof firebase !== 'undefined') {
        try {
            resolve(ensureFirebaseInitialized());
        } catch (error) {
            reject(error);
        }
        return;
    }

    const deadline = Date.now() + timeoutMs;
    const timer = setInterval(() => {
        if (typeof firebase !== 'undefined') {
            clearInterval(timer);
            try {
                resolve(ensureFirebaseInitialized());
            } catch (error) {
                reject(error);
            }
            return;
        }
        if (Date.now() >= deadline) {
            clearInterval(timer);
            reject(new Error('Firebase failed to load. Check your network or ad blocker, then refresh.'));
        }
    }, 50);
});

// Initialize as soon as the SDK is available (scripts load before the bundle)
if (typeof firebase !== 'undefined') {
    ensureFirebaseInitialized();
} else if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        waitForFirebase().catch((error) => {
            console.error('Error initializing Firebase:', error);
        });
    });
}

// Export Firebase instance for use in components
export const getFirebase = () => {
    if (typeof firebase !== 'undefined') {
        return firebase;
    }
    throw new Error('Firebase is not loaded');
};
