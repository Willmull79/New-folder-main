import React, { useState } from 'react';
import { useFirebase } from '../contexts/FirebaseContext.js';
import { appId } from '../config/firebase.js';

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
        case 'auth/too-many-requests':
            return 'Too many attempts. Wait a minute and try again.';
        case 'auth/network-request-failed':
            return 'Network error. Check your internet connection and try again.';
        case 'auth/operation-not-allowed':
            return 'Email/password sign-in is disabled for this project. Contact support.';
        case 'auth/user-disabled':
            return 'This account has been disabled.';
        default:
            return error?.message || 'Authentication failed. Please try again.';
    }
};

export const AuthScreen = ({ showMessage }) => {
    const { auth, db, isFirebaseReady, firebaseError, refreshAuthState } = useFirebase();
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [localMessage, setLocalMessage] = useState('');
    const [localMessageType, setLocalMessageType] = useState('');

    const displayMessage = (msg, type = 'success') => {
        setLocalMessage(msg);
        setLocalMessageType(type);
        showMessage?.(msg, type);
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
                const userProfileDocRef = db.doc(`artifacts/${appId}/users/${userCredential.user.uid}/userProfile/settings`);
                await userProfileDocRef.set({ username: username.trim() }, { merge: true });
            }

            const signedIn = await ensureSignedIn();
            if (!signedIn) {
                displayMessage('Signed in, but the app did not update. Refresh the page.', 'error');
                return;
            }

            displayMessage(isLogin ? 'Logged in successfully!' : 'Registered successfully!', 'success');
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

    const switchMode = () => {
        setIsLogin(!isLogin);
        setLocalMessage('');
        setLocalMessageType('');
    };

    return (
        <div className="flex items-center justify-center min-h-screen min-h-[100dvh] bg-gray-900 p-4 mobile-safe-top mobile-safe-bottom">
            <div className="bg-gray-800 p-6 sm:p-8 rounded-lg shadow-xl w-full max-w-md">
                <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2 text-center">{isLogin ? 'Login' : 'Register'}</h2>
                <p className="text-gray-400 text-sm text-center mb-6">
                    {isFirebaseReady ? 'Sign in to manage your dynasty leagues' : 'Connecting to Firebase...'}
                </p>

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

                <form onSubmit={handleAuthAction}>
                    {!isLogin && (
                        <input
                            type="text"
                            placeholder="Your Name"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full p-3 mb-4 rounded-md bg-gray-700 text-white border border-gray-600"
                            autoComplete="name"
                        />
                    )}
                    <input
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full p-3 mb-4 rounded-md bg-gray-700 text-white border border-gray-600"
                        autoComplete="email"
                    />
                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full p-3 mb-4 rounded-md bg-gray-700 text-white border border-gray-600"
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
                        className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading
                            ? (isLogin ? 'Logging In...' : 'Registering...')
                            : !isFirebaseReady
                                ? 'Connecting...'
                                : (isLogin ? 'Login' : 'Register')}
                    </button>
                </form>

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
