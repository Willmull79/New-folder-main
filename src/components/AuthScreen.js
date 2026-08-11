import React, { useEffect, useRef, useState } from 'react';
import { useFirebase } from '../contexts/FirebaseContext.js';
import { appId } from '../config/firebase.js';
import { normalizePhoneToE164, PHONE_FORMAT_HINT } from '../utils/phoneE164.js';
import { clearPhoneRecaptcha, createPhoneRecaptchaVerifier } from '../utils/phoneRecaptcha.js';

const firebase = window.firebase;

const friendlyAuthError = (error) => {
    switch (error?.code) {
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
        case 'auth/user-not-found':
            return 'Invalid email or password. Try Register if you do not have an account yet.';
        case 'auth/email-already-in-use':
            return 'An account with this email already exists. Try logging in instead.';
        case 'auth/invalid-email':
            return 'Please enter a valid email address.';
        case 'auth/weak-password':
            return 'Password must be at least 6 characters.';
        case 'auth/invalid-phone-number':
            return `That does not look like a valid phone number. ${PHONE_FORMAT_HINT}`;
        case 'auth/missing-phone-number':
            return `Enter a phone number. ${PHONE_FORMAT_HINT}`;
        case 'auth/invalid-verification-code':
            return 'Invalid verification code. Check the SMS and try again.';
        case 'auth/code-expired':
        case 'auth/session-expired':
            return 'That verification code expired. Request a new one.';
        case 'auth/missing-verification-code':
            return 'Enter the 6-digit code from your SMS.';
        case 'auth/too-many-requests':
            return 'Too many attempts. Wait a minute and try again.';
        case 'auth/quota-exceeded':
            return 'SMS quota exceeded for this project. Try again later or contact support.';
        case 'auth/network-request-failed':
            return 'Network error. Check your internet connection and try again.';
        case 'auth/operation-not-allowed':
            return 'This sign-in method is disabled. In Firebase Console → Authentication → Sign-in method, enable Email/Password and/or Phone.';
        case 'auth/admin-restricted-operation':
            return 'Phone SMS is restricted for this region. In Firebase Console → Authentication → Settings, allow SMS for your country (e.g. United States).';
        case 'auth/captcha-check-failed':
            return 'reCAPTCHA failed. Complete the checkbox, turn off ad blockers, and confirm this site is listed under Firebase Console → Authentication → Settings → Authorized domains (fantasydynastyleagues.com and dynasty-420.web.app).';
        case 'auth/invalid-app-credential':
            return 'Phone auth is blocked for this domain. In Firebase Console → Authentication → Settings → Authorized domains, add the exact site you are using.';
        case 'auth/user-disabled':
            return 'This account has been disabled.';
        default:
            return error?.message || 'Authentication failed. Please try again.';
    }
};

const inputClass = 'w-full p-3 mb-4 rounded-md bg-gray-700 text-white border border-gray-600';
const primaryBtnClass =
    'w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-md disabled:opacity-50 disabled:cursor-not-allowed';

export const AuthScreen = ({ showMessage, hasPendingInvite = false, onAuthSuccess, startInRegisterMode = false }) => {
    const { auth, db, isFirebaseReady, firebaseError, refreshAuthState } = useFirebase();
    // Invitees still land on Login; they can switch to Register from the form.
    const [isLogin, setIsLogin] = useState(!startInRegisterMode);
    const [authMethod, setAuthMethod] = useState('email'); // 'email' | 'phone'
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [smsCode, setSmsCode] = useState('');
    const [confirmationResult, setConfirmationResult] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSendingCode, setIsSendingCode] = useState(false);
    const [localMessage, setLocalMessage] = useState('');
    const [localMessageType, setLocalMessageType] = useState('');

    const recaptchaVerifierRef = useRef(null);

    useEffect(() => {
        return () => {
            clearPhoneRecaptcha(recaptchaVerifierRef.current);
            recaptchaVerifierRef.current = null;
        };
    }, []);

    const displayMessage = (msg, type = 'success') => {
        setLocalMessage(msg);
        setLocalMessageType(type);
        showMessage?.(msg, type);
    };

    const clearRecaptcha = () => {
        clearPhoneRecaptcha(recaptchaVerifierRef.current);
        recaptchaVerifierRef.current = null;
    };

    const ensureRecaptcha = async () => {
        if (!auth || !firebase) {
            throw new Error('Firebase Auth is not ready.');
        }
        if (recaptchaVerifierRef.current) {
            return recaptchaVerifierRef.current;
        }
        recaptchaVerifierRef.current = await createPhoneRecaptchaVerifier(
            firebase,
            'auth-screen-recaptcha',
            {
                onExpired: () => {
                    displayMessage('reCAPTCHA expired. Check the box again, then resend the code.', 'error');
                },
            }
        );
        return recaptchaVerifierRef.current;
    };

    const ensureSignedIn = async () => {
        if (auth?.currentUser) return true;
        for (let i = 0; i < 10; i += 1) {
            await new Promise((resolve) => setTimeout(resolve, 200));
            if (auth?.currentUser) return true;
            if (refreshAuthState) {
                const ok = await refreshAuthState();
                if (ok) return true;
            }
        }
        return false;
    };

    const writeUserProfile = async (uid, updates) => {
        if (!db || !uid) return;
        const userProfileDocRef = db.doc(`artifacts/${appId}/users/${uid}/userProfile/settings`);
        await userProfileDocRef.set(updates, { merge: true });
    };

    const finishAuthSuccess = async ({ registered }) => {
        const signedIn = await ensureSignedIn();
        if (!signedIn) {
            displayMessage('Signed in, but the app did not update. Refresh the page.', 'error');
            return;
        }
        displayMessage(registered ? 'Registered successfully!' : 'Logged in successfully!', 'success');
        onAuthSuccess?.({ registered });
    };

    const handleAuthAction = async (e) => {
        e?.preventDefault();

        if (firebaseError) {
            return displayMessage(firebaseError, 'error');
        }
        if (!isFirebaseReady || !auth || !db) {
            return displayMessage('Still connecting to Firebase. Wait a moment and try again.', 'error');
        }
        if (!email.trim() || !password) {
            return displayMessage('Email and password are required.', 'error');
        }

        setIsLoading(true);
        setLocalMessage('');

        try {
            let registered = false;
            if (isLogin) {
                await auth.signInWithEmailAndPassword(email.trim(), password);
            } else {
                if (!username.trim()) {
                    displayMessage('Name cannot be empty.', 'error');
                    setIsLoading(false);
                    return;
                }
                if (password.length < 6) {
                    displayMessage('Password must be at least 6 characters.', 'error');
                    setIsLoading(false);
                    return;
                }
                const userCredential = await auth.createUserWithEmailAndPassword(email.trim(), password);
                await writeUserProfile(userCredential.user.uid, { username: username.trim() });
                registered = true;
            }

            await finishAuthSuccess({ registered });
        } catch (error) {
            console.error('Auth error:', error);
            displayMessage(friendlyAuthError(error), 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handlePasswordReset = async () => {
        if (!email.trim()) {
            return displayMessage('Enter your email above, then click Forgot password.', 'error');
        }
        if (!auth) {
            return displayMessage('Firebase is not ready yet. Please wait and try again.', 'error');
        }
        setIsLoading(true);
        try {
            await auth.sendPasswordResetEmail(email.trim());
            displayMessage('Password reset email sent. Check your inbox.', 'success');
        } catch (error) {
            displayMessage(friendlyAuthError(error), 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSendPhoneCode = async (e) => {
        e?.preventDefault();

        if (firebaseError) {
            return displayMessage(firebaseError, 'error');
        }
        if (!isFirebaseReady || !auth || !db) {
            return displayMessage('Still connecting to Firebase. Wait a moment and try again.', 'error');
        }
        if (!isLogin && !username.trim()) {
            return displayMessage('Name cannot be empty.', 'error');
        }

        const normalized = normalizePhoneToE164(phoneNumber);
        if (!normalized.ok) {
            return displayMessage(
                normalized.reason === 'empty'
                    ? `Enter a phone number. ${PHONE_FORMAT_HINT}`
                    : `Please enter a valid phone number. ${PHONE_FORMAT_HINT}`,
                'error'
            );
        }
        const phone = normalized.e164;
        if (phone !== phoneNumber.trim()) {
            setPhoneNumber(phone);
        }

        setIsSendingCode(true);
        setConfirmationResult(null);
        setSmsCode('');
        setLocalMessage('');

        try {
            const appVerifier = await ensureRecaptcha();
            const result = await auth.signInWithPhoneNumber(phone, appVerifier);
            setConfirmationResult(result);
            displayMessage('Verification code sent. Enter the 6-digit SMS code below.', 'success');
        } catch (error) {
            console.error('Error sending phone code:', error);
            clearRecaptcha();
            displayMessage(friendlyAuthError(error), 'error');
        } finally {
            setIsSendingCode(false);
        }
    };

    const handleVerifyPhoneCode = async (e) => {
        e?.preventDefault();

        if (!confirmationResult) {
            return displayMessage('Send a verification code first.', 'error');
        }
        if (!/^\d{6}$/.test(smsCode.trim())) {
            return displayMessage('Enter the 6-digit code from your SMS.', 'error');
        }
        if (!isLogin && !username.trim()) {
            return displayMessage('Name cannot be empty.', 'error');
        }

        setIsLoading(true);
        setLocalMessage('');

        try {
            const userCredential = await confirmationResult.confirm(smsCode.trim());
            const user = userCredential.user;
            const isNewUser = Boolean(userCredential.additionalUserInfo?.isNewUser);
            const registered = !isLogin || isNewUser;

            const normalized = normalizePhoneToE164(phoneNumber);
            const linkedPhone = user.phoneNumber || (normalized.ok ? normalized.e164 : phoneNumber.trim());
            const profileUpdates = { phoneNumber: linkedPhone };
            if (registered && username.trim()) {
                profileUpdates.username = username.trim();
            } else if (isNewUser && !username.trim()) {
                profileUpdates.username = linkedPhone || user.uid.substring(0, 6);
            }
            await writeUserProfile(user.uid, profileUpdates);

            setConfirmationResult(null);
            setSmsCode('');
            clearRecaptcha();

            await finishAuthSuccess({ registered });
        } catch (error) {
            console.error('Phone verify error:', error);
            displayMessage(friendlyAuthError(error), 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const switchMode = () => {
        setIsLogin(!isLogin);
        setLocalMessage('');
        setLocalMessageType('');
        setConfirmationResult(null);
        setSmsCode('');
    };

    const switchAuthMethod = (method) => {
        if (method === authMethod) return;
        setAuthMethod(method);
        setLocalMessage('');
        setLocalMessageType('');
        setConfirmationResult(null);
        setSmsCode('');
        clearRecaptcha();
    };

    const methodTabClass = (method) =>
        `flex-1 py-2 px-3 text-sm font-semibold rounded-md transition-colors ${
            authMethod === method
                ? 'bg-green-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
        }`;

    return (
        <div className="flex items-center justify-center min-h-screen min-h-[100dvh] app-shell-bg p-4 mobile-safe-top mobile-safe-bottom">
            <div className="bg-gray-800 p-6 sm:p-8 rounded-lg shadow-xl w-full max-w-md">
                <h1 className="app-brand-title text-2xl sm:text-3xl font-extrabold mb-4 leading-tight">
                    FANTASY DYNASTY LEAGUES
                </h1>
                <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2 text-center">{isLogin ? 'Login' : 'Register'}</h2>
                <p className="text-gray-400 text-sm text-center mb-4">
                    {isFirebaseReady
                        ? 'Sign in to access your account'
                        : 'Connecting to Firebase...'}
                </p>

                {hasPendingInvite && (
                    <div className="mb-4 p-3 rounded-md text-sm bg-emerald-900/50 text-emerald-100 border border-emerald-600 text-center">
                        Sign up or log in to accept your league invitation!
                    </div>
                )}

                {firebaseError && (
                    <div className="mb-4 p-3 rounded-md text-sm bg-red-900/50 text-red-200 border border-red-700">
                        {firebaseError}
                    </div>
                )}

                {localMessage && (
                    <div className={`mb-4 p-3 rounded-md text-sm ${localMessageType === 'success' ? 'bg-green-900/50 text-green-200 border border-green-700' : 'bg-red-900/50 text-red-200 border border-red-700'}`}>
                        {localMessage}
                    </div>
                )}

                <div className="flex gap-2 mb-5" role="tablist" aria-label="Sign-in method">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={authMethod === 'email'}
                        onClick={() => switchAuthMethod('email')}
                        className={methodTabClass('email')}
                    >
                        Email
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={authMethod === 'phone'}
                        onClick={() => switchAuthMethod('phone')}
                        className={methodTabClass('phone')}
                    >
                        Phone
                    </button>
                </div>

                {authMethod === 'email' ? (
                    <form onSubmit={handleAuthAction}>
                        {!isLogin && (
                            <input
                                type="text"
                                placeholder="Your Name"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className={inputClass}
                                autoComplete="name"
                            />
                        )}
                        <input
                            type="email"
                            placeholder="Email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className={inputClass}
                            autoComplete="email"
                        />
                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className={inputClass}
                            autoComplete={isLogin ? 'current-password' : 'new-password'}
                        />

                        {isLogin && (
                            <button
                                type="button"
                                onClick={handlePasswordReset}
                                disabled={isLoading || !isFirebaseReady}
                                className="mb-4 text-sm text-green-400 hover:underline disabled:opacity-50"
                            >
                                Forgot password?
                            </button>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading || !isFirebaseReady}
                            className={primaryBtnClass}
                        >
                            {isLoading
                                ? (isLogin ? 'Logging In...' : 'Registering...')
                                : !isFirebaseReady
                                    ? 'Connecting...'
                                    : (isLogin ? 'Login' : 'Register')}
                        </button>
                    </form>
                ) : (
                    <div>
                        {!isLogin && (
                            <input
                                type="text"
                                placeholder="Your Name"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className={inputClass}
                                autoComplete="name"
                            />
                        )}

                        <form onSubmit={handleSendPhoneCode}>
                            <input
                                type="tel"
                                placeholder="(555) 123-4567"
                                value={phoneNumber}
                                onChange={(e) => setPhoneNumber(e.target.value)}
                                className={inputClass}
                                autoComplete="tel"
                                inputMode="tel"
                            />
                            <p className="text-xs text-gray-400 mb-4 -mt-2">{PHONE_FORMAT_HINT}</p>
                            <button
                                type="submit"
                                disabled={isSendingCode || isLoading || !isFirebaseReady}
                                className={primaryBtnClass}
                            >
                                {isSendingCode
                                    ? 'Sending code...'
                                    : !isFirebaseReady
                                        ? 'Connecting...'
                                        : confirmationResult
                                            ? 'Resend code'
                                            : 'Send code'}
                            </button>
                        </form>

                        {confirmationResult && (
                            <form onSubmit={handleVerifyPhoneCode} className="mt-4">
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="\d{6}"
                                    maxLength={6}
                                    placeholder="6-digit code"
                                    value={smsCode}
                                    onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    className={inputClass}
                                    autoComplete="one-time-code"
                                />
                                <button
                                    type="submit"
                                    disabled={isLoading || !isFirebaseReady}
                                    className={primaryBtnClass}
                                >
                                    {isLoading
                                        ? (isLogin ? 'Verifying...' : 'Creating account...')
                                        : (isLogin ? 'Verify & Login' : 'Verify & Register')}
                                </button>
                            </form>
                        )}

                        <p className="text-xs text-gray-400 mb-2">Check the box below, then send the code.</p>
                        <div id="auth-screen-recaptcha" className="flex justify-center mb-2 min-h-[78px]" />
                    </div>
                )}

                <p className="text-center text-gray-400 mt-4">
                    {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
                    <button type="button" onClick={switchMode} className="text-green-400 hover:underline font-semibold">
                        {isLogin ? 'Register' : 'Login'}
                    </button>
                </p>
            </div>
        </div>
    );
};
