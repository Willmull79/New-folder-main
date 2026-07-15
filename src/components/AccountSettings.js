import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFirebase } from '../contexts/FirebaseContext.js';
import { appId } from '../config/firebase.js';

const firebase = window.firebase;

const PROVIDER_PASSWORD = 'password';
const PROVIDER_PHONE = 'phone';

const friendlyLinkError = (error) => {
    switch (error?.code) {
        case 'auth/credential-already-in-use':
        case 'auth/email-already-in-use':
        case 'auth/account-exists-with-different-credential':
            return 'That email or phone is already linked to another account.';
        case 'auth/provider-already-linked':
            return 'This sign-in method is already linked to your account.';
        case 'auth/requires-recent-login':
            return 'For security, please log out and log back in, then try linking again.';
        case 'auth/invalid-email':
            return 'Please enter a valid email address.';
        case 'auth/weak-password':
            return 'Password must be at least 6 characters.';
        case 'auth/invalid-phone-number':
            return 'Please enter a valid phone number (include country code, e.g. +15551234567).';
        case 'auth/invalid-verification-code':
            return 'Invalid verification code. Check the SMS and try again.';
        case 'auth/code-expired':
            return 'That verification code expired. Request a new one.';
        case 'auth/too-many-requests':
            return 'Too many attempts. Wait a minute and try again.';
        case 'auth/operation-not-allowed':
            return 'This sign-in method is not enabled for this project.';
        case 'auth/captcha-check-failed':
            return 'reCAPTCHA verification failed. Refresh and try again.';
        case 'auth/missing-verification-code':
            return 'Enter the 6-digit code from your SMS.';
        default:
            return error?.message || 'Failed to link account. Please try again.';
    }
};

const getProviderFlags = (user) => {
    const providers = user?.providerData || [];
    const emailProvider = providers.find((p) => p.providerId === PROVIDER_PASSWORD);
    const phoneProvider = providers.find((p) => p.providerId === PROVIDER_PHONE);
    return {
        hasEmail: Boolean(emailProvider),
        hasPhone: Boolean(phoneProvider),
        email: emailProvider?.email || user?.email || null,
        phoneNumber: phoneProvider?.phoneNumber || user?.phoneNumber || null,
        providers,
    };
};

export const AccountSettings = ({ showMessage }) => {
    const { auth, db, userId } = useFirebase();
    const [providerInfo, setProviderInfo] = useState(() => getProviderFlags(auth?.currentUser));

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLinkingEmail, setIsLinkingEmail] = useState(false);

    const [phoneNumber, setPhoneNumber] = useState('');
    const [smsCode, setSmsCode] = useState('');
    const [verificationId, setVerificationId] = useState(null);
    const [isSendingCode, setIsSendingCode] = useState(false);
    const [isLinkingPhone, setIsLinkingPhone] = useState(false);

    const recaptchaContainerRef = useRef(null);
    const recaptchaVerifierRef = useRef(null);

    const refreshProviders = useCallback(() => {
        setProviderInfo(getProviderFlags(auth?.currentUser));
    }, [auth]);

    useEffect(() => {
        refreshProviders();
    }, [refreshProviders, auth?.currentUser]);

    useEffect(() => {
        return () => {
            if (recaptchaVerifierRef.current) {
                try {
                    recaptchaVerifierRef.current.clear();
                } catch (_) {
                    // ignore cleanup errors
                }
                recaptchaVerifierRef.current = null;
            }
        };
    }, []);

    const updateProfileDoc = async (updates) => {
        if (!db || !userId) return;
        const profileRef = db.doc(`artifacts/${appId}/users/${userId}/userProfile/settings`);
        await profileRef.set(updates, { merge: true });
    };

    const ensureRecaptcha = () => {
        if (!auth || !firebase) {
            throw new Error('Firebase Auth is not ready.');
        }
        if (recaptchaVerifierRef.current) {
            return recaptchaVerifierRef.current;
        }
        if (!recaptchaContainerRef.current) {
            throw new Error('reCAPTCHA container is missing.');
        }

        recaptchaVerifierRef.current = new firebase.auth.RecaptchaVerifier(recaptchaContainerRef.current, {
            size: 'invisible',
            callback: () => {},
            'expired-callback': () => {
                showMessage('reCAPTCHA expired. Try sending the code again.', 'error');
            },
        });
        return recaptchaVerifierRef.current;
    };

    const handleLinkEmail = async (e) => {
        e?.preventDefault();
        const user = auth?.currentUser;
        if (!user) {
            return showMessage('You must be signed in to link an email.', 'error');
        }
        if (!email.trim() || !password) {
            return showMessage('Email and password are required.', 'error');
        }
        if (password.length < 6) {
            return showMessage('Password must be at least 6 characters.', 'error');
        }

        setIsLinkingEmail(true);
        try {
            const credential = firebase.auth.EmailAuthProvider.credential(email.trim(), password);
            await user.linkWithCredential(credential);
            await updateProfileDoc({ email: email.trim() });
            refreshProviders();
            setEmail('');
            setPassword('');
            showMessage('Email/password successfully linked to your account.', 'success');
        } catch (error) {
            console.error('Error linking email:', error);
            showMessage(friendlyLinkError(error), 'error');
        } finally {
            setIsLinkingEmail(false);
        }
    };

    const handleSendPhoneCode = async (e) => {
        e?.preventDefault();
        const user = auth?.currentUser;
        if (!user) {
            return showMessage('You must be signed in to link a phone number.', 'error');
        }
        const phone = phoneNumber.trim();
        if (!phone) {
            return showMessage('Enter a phone number with country code (e.g. +15551234567).', 'error');
        }

        setIsSendingCode(true);
        setVerificationId(null);
        setSmsCode('');
        try {
            const appVerifier = ensureRecaptcha();
            // Sends SMS while keeping the current session; we link via credential (do not confirm()).
            const confirmationResult = await auth.signInWithPhoneNumber(phone, appVerifier);
            setVerificationId(confirmationResult.verificationId);
            showMessage('Verification code sent. Enter the 6-digit SMS code below.', 'success');
        } catch (error) {
            console.error('Error sending phone code:', error);
            if (recaptchaVerifierRef.current) {
                try {
                    recaptchaVerifierRef.current.clear();
                } catch (_) {
                    // ignore
                }
                recaptchaVerifierRef.current = null;
            }
            showMessage(friendlyLinkError(error), 'error');
        } finally {
            setIsSendingCode(false);
        }
    };

    const handleLinkPhone = async (e) => {
        e?.preventDefault();
        const user = auth?.currentUser;
        if (!user) {
            return showMessage('You must be signed in to link a phone number.', 'error');
        }
        if (!verificationId) {
            return showMessage('Send a verification code first.', 'error');
        }
        if (!/^\d{6}$/.test(smsCode.trim())) {
            return showMessage('Enter the 6-digit code from your SMS.', 'error');
        }

        setIsLinkingPhone(true);
        try {
            const credential = firebase.auth.PhoneAuthProvider.credential(verificationId, smsCode.trim());
            await user.linkWithCredential(credential);
            const linkedPhone = auth.currentUser?.phoneNumber || phoneNumber.trim();
            await updateProfileDoc({ phoneNumber: linkedPhone });
            refreshProviders();
            setPhoneNumber('');
            setSmsCode('');
            setVerificationId(null);
            showMessage('Phone number successfully linked to your account.', 'success');
        } catch (error) {
            console.error('Error linking phone:', error);
            showMessage(friendlyLinkError(error), 'error');
        } finally {
            setIsLinkingPhone(false);
        }
    };

    if (!userId || !auth) {
        return (
            <div className="bg-emerald-950 p-6 rounded-lg text-center text-emerald-300">
                Sign in to manage account settings.
            </div>
        );
    }

    const inputClass =
        'w-full p-3 mt-1 rounded-md bg-emerald-800 text-white border border-emerald-600 focus:border-purple-500 focus:ring-2 focus:ring-purple-200';
    const buttonClass =
        'mt-4 w-full sm:w-auto px-6 py-3 bg-purple-800 hover:bg-purple-900 text-white font-bold rounded-md disabled:opacity-50 transition-colors';

    return (
        <div className="p-4 sm:p-6 bg-emerald-950 rounded-lg shadow-xl max-w-xl mx-auto my-2 sm:my-8 text-white">
            <h2 className="text-3xl font-bold text-white mb-2">Account Settings</h2>
            <p className="text-emerald-300 mb-8">
                Link additional sign-in methods to this same profile so you can log in with email or phone.
            </p>

            <div className="bg-emerald-900 p-6 rounded-lg border border-emerald-700 space-y-8">
                <div>
                    <h3 className="text-lg font-semibold text-purple-300 mb-3">Linked Sign-In Methods</h3>
                    <ul className="space-y-2 text-sm text-emerald-200">
                        <li>
                            Email/Password:{' '}
                            <span className={providerInfo.hasEmail ? 'text-green-400 font-semibold' : 'text-yellow-400'}>
                                {providerInfo.hasEmail ? `Linked (${providerInfo.email || 'on file'})` : 'Not linked'}
                            </span>
                        </li>
                        <li>
                            Phone:{' '}
                            <span className={providerInfo.hasPhone ? 'text-green-400 font-semibold' : 'text-yellow-400'}>
                                {providerInfo.hasPhone ? `Linked (${providerInfo.phoneNumber || 'on file'})` : 'Not linked'}
                            </span>
                        </li>
                    </ul>
                </div>

                {!providerInfo.hasEmail && (
                    <form onSubmit={handleLinkEmail} className="border-t border-emerald-700 pt-6">
                        <h3 className="text-lg font-semibold text-purple-300 mb-3">Link Email / Password</h3>
                        <p className="text-sm text-emerald-400 mb-4">
                            Add an email and password so you can sign in with them later.
                        </p>
                        <label className="block mb-3">
                            <span className="text-emerald-200 text-sm font-medium">Email</span>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className={inputClass}
                                autoComplete="email"
                                required
                            />
                        </label>
                        <label className="block">
                            <span className="text-emerald-200 text-sm font-medium">Password</span>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className={inputClass}
                                autoComplete="new-password"
                                minLength={6}
                                required
                            />
                        </label>
                        <button type="submit" disabled={isLinkingEmail} className={buttonClass}>
                            {isLinkingEmail ? 'Linking...' : 'Link Email & Password'}
                        </button>
                    </form>
                )}

                {!providerInfo.hasPhone && (
                    <div className="border-t border-emerald-700 pt-6">
                        <h3 className="text-lg font-semibold text-purple-300 mb-3">Link Phone Number</h3>
                        <p className="text-sm text-emerald-400 mb-4">
                            Use E.164 format with country code (example: +15551234567).
                        </p>

                        <form onSubmit={handleSendPhoneCode} className="mb-4">
                            <label className="block">
                                <span className="text-emerald-200 text-sm font-medium">Phone number</span>
                                <input
                                    type="tel"
                                    value={phoneNumber}
                                    onChange={(e) => setPhoneNumber(e.target.value)}
                                    className={inputClass}
                                    placeholder="+15551234567"
                                    autoComplete="tel"
                                    required
                                />
                            </label>
                            <button type="submit" disabled={isSendingCode} className={buttonClass}>
                                {isSendingCode ? 'Sending...' : 'Send SMS Code'}
                            </button>
                        </form>

                        {verificationId && (
                            <form onSubmit={handleLinkPhone}>
                                <label className="block">
                                    <span className="text-emerald-200 text-sm font-medium">6-digit code</span>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        pattern="\d{6}"
                                        maxLength={6}
                                        value={smsCode}
                                        onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        className={inputClass}
                                        placeholder="123456"
                                        required
                                    />
                                </label>
                                <button type="submit" disabled={isLinkingPhone} className={buttonClass}>
                                    {isLinkingPhone ? 'Linking...' : 'Verify & Link Phone'}
                                </button>
                            </form>
                        )}

                        {/* Invisible reCAPTCHA mounts here */}
                        <div ref={recaptchaContainerRef} id="account-settings-recaptcha" />
                    </div>
                )}

                {providerInfo.hasEmail && providerInfo.hasPhone && (
                    <p className="text-sm text-emerald-300 border-t border-emerald-700 pt-6">
                        Both email/password and phone are linked to this profile.
                    </p>
                )}
            </div>
        </div>
    );
};

export default AccountSettings;
