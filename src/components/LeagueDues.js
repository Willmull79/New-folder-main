import React, { useEffect, useState } from 'react';
import { useFirebase } from '../contexts/FirebaseContext.js';
import { isLeagueCommissioner } from '../constants/leagueDefaults.js';

const PAYMENT_METHODS = ['LeagueSafe', 'TeamStake', 'Venmo', 'PayPal', 'Cash App'];

const isPlatformUrlMethod = (method) => method === 'LeagueSafe' || method === 'TeamStake';
const isHandleMethod = (method) => method === 'Venmo' || method === 'PayPal' || method === 'Cash App';

const normalizeHandle = (value = '') => String(value).trim().replace(/^@/, '').replace(/^\$/, '');

const getBuyInAmount = (settings = {}) => {
    const fromDues = Number(settings?.dues?.buyIn);
    if (Number.isFinite(fromDues) && fromDues > 0) return fromDues;
    const fromSalary = Number(settings?.teamSalary);
    if (Number.isFinite(fromSalary) && fromSalary > 0) return fromSalary;
    return 0;
};

export const buildPayDuesUrl = (method, handle, amount) => {
    const raw = String(handle || '').trim();
    if (!raw || !method) return null;

    const amountValue = Number(amount) || 0;
    const handleClean = normalizeHandle(raw);

    if (isPlatformUrlMethod(method)) {
        try {
            const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
            return url.toString();
        } catch (_) {
            return raw;
        }
    }

    if (method === 'Venmo') {
        return `https://venmo.com/${encodeURIComponent(handleClean)}?txn=pay&amount=${amountValue}&note=Fantasy+Dues`;
    }
    if (method === 'PayPal') {
        return `https://paypal.me/${encodeURIComponent(handleClean)}/${amountValue}`;
    }
    if (method === 'Cash App') {
        return `https://cash.app/$${encodeURIComponent(handleClean)}/${amountValue}`;
    }
    return null;
};

export const LeagueDues = ({ currentLeague, showMessage, userId }) => {
    const { db } = useFirebase();
    const isCommissioner = isLeagueCommissioner(currentLeague, userId);
    const settings = currentLeague?.settings || {};
    const savedDues = settings.dues || {};

    const [paymentMethod, setPaymentMethod] = useState(savedDues.method || '');
    const [paymentValue, setPaymentValue] = useState(savedDues.handle || '');
    const [buyIn, setBuyIn] = useState(getBuyInAmount(settings) || '');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const next = currentLeague?.settings?.dues || {};
        setPaymentMethod(next.method || '');
        setPaymentValue(next.handle || '');
        setBuyIn(getBuyInAmount(currentLeague?.settings) || '');
    }, [currentLeague?.id, currentLeague?.settings?.dues?.method, currentLeague?.settings?.dues?.handle, currentLeague?.settings?.dues?.buyIn, currentLeague?.settings?.teamSalary]);

    const buyInAmount = getBuyInAmount({
        ...settings,
        dues: {
            ...savedDues,
            buyIn: Number(buyIn) || savedDues.buyIn,
        },
    });

    // Payment deep-links use teamSalary when set; otherwise the configured buy-in.
    const paymentAmount = Number(settings.teamSalary) > 0
        ? Number(settings.teamSalary)
        : buyInAmount;

    const payUrl = buildPayDuesUrl(
        savedDues.method || paymentMethod,
        savedDues.handle || paymentValue,
        paymentAmount
    );

    const duesConfigured = Boolean(savedDues.method && savedDues.handle && payUrl);

    const handleSaveDuesSettings = async (e) => {
        e?.preventDefault();
        if (!db || !currentLeague?.id) {
            return showMessage('League is not available.', 'error');
        }
        if (!paymentMethod) {
            return showMessage('Select a payment collection method.', 'error');
        }
        if (!String(paymentValue).trim()) {
            return showMessage(
                isPlatformUrlMethod(paymentMethod)
                    ? 'Paste your league URL.'
                    : 'Enter your username / cashtag.',
                'error'
            );
        }

        const buyInNumber = Number(buyIn);
        if (!Number.isFinite(buyInNumber) || buyInNumber <= 0) {
            return showMessage('Enter a valid buy-in amount greater than zero.', 'error');
        }

        setIsSaving(true);
        try {
            await db.doc(`leagues/${currentLeague.id}`).update({
                'settings.dues': {
                    method: paymentMethod,
                    handle: String(paymentValue).trim(),
                    buyIn: buyInNumber,
                    updatedAt: new Date().toISOString(),
                },
            });
            showMessage('League dues payment settings saved!', 'success');
        } catch (error) {
            console.error('Error saving dues settings:', error);
            showMessage(error?.message || 'Failed to save dues settings.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const inputClass =
        'w-full p-3 mt-1 rounded-md bg-emerald-800 text-white border border-emerald-600 focus:border-purple-500 focus:ring-2 focus:ring-purple-200';

    return (
        <div className="p-4 sm:p-6 bg-emerald-950 rounded-lg shadow-xl max-w-3xl mx-auto my-2 sm:my-8 text-white space-y-6">
            <div>
                <h2 className="text-3xl font-bold text-white mb-2">League Dues</h2>
                <p className="text-emerald-300">
                    Pay your league buy-in through the commissioner&apos;s preferred external payout option.
                </p>
            </div>

            {/* Member pay view */}
            <div className="bg-emerald-900 p-6 rounded-lg border-2 border-emerald-700">
                <h3 className="text-xl font-bold text-purple-300 mb-4">Buy-In</h3>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <div>
                        <p className="text-sm uppercase tracking-wide text-emerald-400 mb-1">Required league buy-in</p>
                        <p className="text-4xl font-extrabold text-yellow-300">
                            ${Number(buyInAmount || 0).toFixed(2)}
                        </p>
                        {duesConfigured && (
                            <p className="text-sm text-emerald-300 mt-2">
                                Pay via <span className="font-semibold text-white">{savedDues.method}</span>
                            </p>
                        )}
                    </div>
                </div>

                {duesConfigured ? (
                    <a
                        href={payUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block w-full text-center px-8 py-5 bg-purple-700 hover:bg-purple-800 active:bg-purple-900 text-white text-xl font-extrabold rounded-lg shadow-lg transition-colors touch-target"
                    >
                        Pay Dues
                    </a>
                ) : (
                    <div className="rounded-md border border-yellow-700 bg-yellow-900/30 p-4 text-yellow-100 text-sm">
                        {isCommissioner
                            ? 'Configure an external payout option below so managers can pay dues.'
                            : 'The commissioner has not set up a payment method yet.'}
                    </div>
                )}
            </div>

            {/* Commissioner configuration */}
            {isCommissioner && (
                <form
                    onSubmit={handleSaveDuesSettings}
                    className="bg-emerald-900 p-6 rounded-lg border-2 border-purple-700 space-y-5"
                >
                    <div>
                        <h3 className="text-2xl font-bold text-purple-300 mb-1">External Payout Options</h3>
                        <p className="text-sm text-emerald-400">
                            Choose how managers should send league dues. Saved to this league&apos;s settings.
                        </p>
                    </div>

                    <label className="block">
                        <span className="text-emerald-200 font-medium">Payment collection method</span>
                        <select
                            value={paymentMethod}
                            onChange={(e) => {
                                setPaymentMethod(e.target.value);
                                setPaymentValue('');
                            }}
                            className={inputClass}
                        >
                            <option value="">Select a method...</option>
                            {PAYMENT_METHODS.map((method) => (
                                <option key={method} value={method}>{method}</option>
                            ))}
                        </select>
                    </label>

                    {isPlatformUrlMethod(paymentMethod) && (
                        <label className="block">
                            <span className="text-emerald-200 font-medium">
                                {paymentMethod} league URL
                            </span>
                            <input
                                type="url"
                                value={paymentValue}
                                onChange={(e) => setPaymentValue(e.target.value)}
                                placeholder={`https://... your ${paymentMethod} league link`}
                                className={inputClass}
                            />
                        </label>
                    )}

                    {isHandleMethod(paymentMethod) && (
                        <label className="block">
                            <span className="text-emerald-200 font-medium">
                                {paymentMethod === 'Cash App' ? 'Cashtag' : 'Username'}
                            </span>
                            <input
                                type="text"
                                value={paymentValue}
                                onChange={(e) => setPaymentValue(e.target.value)}
                                placeholder={
                                    paymentMethod === 'Cash App'
                                        ? '$yourCashtag'
                                        : paymentMethod === 'Venmo'
                                            ? 'your-venmo-username'
                                            : 'YourPayPalUsername'
                                }
                                className={inputClass}
                                autoComplete="username"
                            />
                        </label>
                    )}

                    <label className="block">
                        <span className="text-emerald-200 font-medium">League buy-in amount ($)</span>
                        <input
                            type="number"
                            min="1"
                            step="0.01"
                            value={buyIn}
                            onChange={(e) => setBuyIn(e.target.value)}
                            placeholder={String(settings.teamSalary || 100)}
                            className={inputClass}
                        />
                        <span className="text-xs text-emerald-400 mt-1 block">
                            Shown to managers as the required buy-in. Venmo / PayPal / Cash App links use the league team salary when set, otherwise this amount.
                        </span>
                    </label>

                    <button
                        type="submit"
                        disabled={isSaving}
                        className="w-full sm:w-auto px-6 py-3 bg-purple-800 hover:bg-purple-900 text-white font-bold rounded-md disabled:opacity-50 transition-colors"
                    >
                        {isSaving ? 'Saving...' : 'Save Payout Settings'}
                    </button>
                </form>
            )}
        </div>
    );
};

export default LeagueDues;
