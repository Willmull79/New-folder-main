import React, { useEffect, useMemo, useState } from 'react';
import { useFirebase } from '../contexts/FirebaseContext.js';
import draftService from '../utils/draftService.js';
import nflPlayerService from '../utils/nflPlayerService.js';
import { ConfirmationModal } from './ConfirmationModal.js';
import {
    DEFAULT_AUCTION_BID_TIME,
    DRAFT_TYPE_OPTIONS,
    MAX_AUCTION_BID_TIME,
    MAX_ROUNDS,
    MIN_AUCTION_BID_TIME,
    MIN_PICK_TIME,
    MIN_ROUNDS,
    PICK_TIME_OPTIONS,
    clampAuctionBidSeconds,
    draftTypeToFormat,
    formatPickTimeLabel,
    generatePickOrder,
    shuffleArray,
    toDateTimeLocalValue,
} from '../utils/draftOrderUtils.js';

export const DraftSettingsPanel = ({
    currentLeague,
    teamsData,
    showMessage,
    variant = 'commissioner',
}) => {
    const { db } = useFirebase();
    const [draftType, setDraftType] = useState('auction');
    const [draftDateTime, setDraftDateTime] = useState('');
    const [draftOrderType, setDraftOrderType] = useState('random');
    const [manualDraftOrder, setManualDraftOrder] = useState([]);
    const [draftRounds, setDraftRounds] = useState(MAX_ROUNDS);
    const [pickTimeLimit, setPickTimeLimit] = useState(60);
    const [draftStatus, setDraftStatus] = useState('pending');
    const [isSaving, setIsSaving] = useState(false);
    const [showResetDraftModal, setShowResetDraftModal] = useState(false);

    useEffect(() => {
        if (db) {
            draftService.setFirestore(db);
        }
    }, [db]);

    const sectionClassName = variant === 'commissioner'
        ? 'mb-8 p-4 sm:p-6 bg-emerald-800 rounded-lg border-2 border-emerald-600'
        : 'mt-6 p-4 bg-emerald-800 rounded-lg border-2 border-emerald-600';

    const inputClassName = variant === 'commissioner'
        ? 'w-full p-3 mt-1 rounded-md bg-emerald-100 text-emerald-900 border-2 border-emerald-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-colors'
        : 'w-full p-3 rounded-md bg-emerald-100 text-emerald-900 border-2 border-emerald-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-colors';

    const buttonClassName = 'px-6 py-3 font-bold rounded-md transition-colors disabled:opacity-50';

    useEffect(() => {
        if (!currentLeague) return;

        const draft = currentLeague.draft || {};
        const settings = draft.settings || {};
        const savedRoundOneOrder = draft.roundOneOrder
            || draft.customOrder
            || draft.manualOrder
            || [];

        const nextDraftType = currentLeague.settings?.draftType || draft.type || 'auction';
        const rawPickTime = settings.pickTimeLimit ?? settings.timeLimit;

        setDraftType(nextDraftType);
        setDraftDateTime(toDateTimeLocalValue(draft.scheduledDateTime));
        setDraftOrderType(settings.orderType || draft.orderType || 'random');
        setDraftRounds(settings.rounds ?? MAX_ROUNDS);
        setPickTimeLimit(
            nextDraftType === 'auction'
                ? clampAuctionBidSeconds(rawPickTime ?? DEFAULT_AUCTION_BID_TIME)
                : (rawPickTime === undefined ? 60 : rawPickTime)
        );
        setDraftStatus(draft.status || 'pending');

        if (savedRoundOneOrder.length) {
            setManualDraftOrder(savedRoundOneOrder);
        } else if (teamsData.length) {
            setManualDraftOrder(teamsData.map((team) => team.id));
        }
    }, [currentLeague, teamsData]);

    useEffect(() => {
        if (draftOrderType === 'manual' && manualDraftOrder.length === 0 && teamsData.length > 0) {
            setManualDraftOrder(teamsData.map((team) => team.id));
        }
    }, [draftOrderType, manualDraftOrder.length, teamsData]);

    const draftFormat = draftTypeToFormat(draftType);
    const isPickDraft = draftType !== 'auction';
    const previewOrder = useMemo(
        () => generatePickOrder(manualDraftOrder, draftFormat, draftRounds),
        [manualDraftOrder, draftFormat, draftRounds]
    );

    const persistDraftToFirestore = async (overrides = {}) => {
        if (!db || !currentLeague?.id) return;

        const roundOneOrder = overrides.roundOneOrder ?? manualDraftOrder;
        const nextStatus = overrides.status
            ?? (roundOneOrder.length ? 'order_set' : (draftDateTime ? 'scheduled' : 'pending'));

        const resolvedPickTimeLimit = draftType === 'auction'
            ? clampAuctionBidSeconds(pickTimeLimit ?? DEFAULT_AUCTION_BID_TIME)
            : pickTimeLimit;

        const draftPayload = {
            ...(currentLeague.draft || {}),
            type: draftType,
            status: nextStatus,
            scheduledDateTime: (overrides.scheduledDateTime ?? draftDateTime) || null,
            orderType: overrides.orderType ?? draftOrderType,
            roundOneOrder,
            settings: {
                ...(currentLeague.draft?.settings || {}),
                draftFormat,
                rounds: Number(draftRounds),
                pickTimeLimit: resolvedPickTimeLimit,
                orderType: overrides.orderType ?? draftOrderType,
            },
        };

        if (draftType === 'auction') {
            draftPayload.nominationOrder = roundOneOrder;
            draftPayload.draftOrder = roundOneOrder;
        } else {
            draftPayload.draftOrder = generatePickOrder(roundOneOrder, draftFormat, draftRounds);
        }

        await db.doc(`leagues/${currentLeague.id}`).update({
            'settings.draftType': draftType,
            draft: draftPayload,
        });
    };

    const handleSaveDraftSettings = async () => {
        if (!currentLeague?.id) return;

        setIsSaving(true);
        try {
            await persistDraftToFirestore();

            try {
                await draftService.configureDraft(currentLeague.id, {
                    draftFormat,
                    rounds: draftRounds,
                    pickTimeLimit: draftType === 'auction'
                        ? clampAuctionBidSeconds(pickTimeLimit ?? DEFAULT_AUCTION_BID_TIME)
                        : pickTimeLimit,
                    orderType: draftOrderType,
                    roundOneOrder: manualDraftOrder,
                });
            } catch (cloudError) {
                console.warn('Cloud draft configure failed, Firestore settings saved:', cloudError);
            }

            showMessage('Draft settings saved successfully!', 'success');
        } catch (error) {
            console.error('Error saving draft settings:', error);
            showMessage(error.message || 'Failed to save draft settings.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSetDraftDateTime = async () => {
        if (!currentLeague?.id || !draftDateTime) {
            showMessage('Choose a draft date and time first.', 'error');
            return;
        }

        setIsSaving(true);
        try {
            await persistDraftToFirestore({
                scheduledDateTime: draftDateTime,
                status: manualDraftOrder.length ? 'order_set' : 'scheduled',
            });

            try {
                await draftService.setDraftDateTime(currentLeague.id, draftDateTime);
            } catch (cloudError) {
                console.warn('Cloud draft datetime failed, Firestore settings saved:', cloudError);
            }

            setDraftStatus(manualDraftOrder.length ? 'order_set' : 'scheduled');
            showMessage('Draft date and time set successfully!', 'success');
        } catch (error) {
            console.error('Error setting draft date/time:', error);
            showMessage(error.message || 'Failed to set draft date/time.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleRandomizeDraftOrder = async () => {
        if (!currentLeague?.id || !teamsData.length) {
            showMessage('Add teams to the league before setting draft order.', 'error');
            return;
        }

        setIsSaving(true);
        try {
            const randomizedOrder = shuffleArray(teamsData.map((team) => team.id));
            setManualDraftOrder(randomizedOrder);
            setDraftOrderType('random');

            await persistDraftToFirestore({
                roundOneOrder: randomizedOrder,
                orderType: 'random',
                status: 'order_set',
            });

            try {
                await draftService.randomizeDraftOrder(currentLeague.id, {
                    draftFormat,
                    rounds: draftRounds,
                });
            } catch (cloudError) {
                console.warn('Cloud randomize failed, Firestore order saved:', cloudError);
            }

            setDraftStatus('order_set');
            showMessage('Draft order randomized successfully!', 'success');
        } catch (error) {
            console.error('Error randomizing draft order:', error);
            showMessage(error.message || 'Failed to randomize draft order.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSetManualDraftOrder = async () => {
        if (!currentLeague?.id || !manualDraftOrder.length) {
            showMessage('Set a manual draft order before saving.', 'error');
            return;
        }

        setIsSaving(true);
        try {
            setDraftOrderType('manual');

            await persistDraftToFirestore({
                roundOneOrder: manualDraftOrder,
                orderType: 'manual',
                status: 'order_set',
            });

            try {
                await draftService.setDraftOrder(currentLeague.id, manualDraftOrder, {
                    draftFormat,
                    rounds: draftRounds,
                });
            } catch (cloudError) {
                console.warn('Cloud manual order failed, Firestore order saved:', cloudError);
            }

            setDraftStatus('order_set');
            showMessage('Manual draft order saved successfully!', 'success');
        } catch (error) {
            console.error('Error setting manual draft order:', error);
            showMessage(error.message || 'Failed to set manual draft order.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleMoveTeamInDraftOrder = (fromIndex, toIndex) => {
        if (fromIndex === toIndex) return;
        const newOrder = [...manualDraftOrder];
        const [teamId] = newOrder.splice(fromIndex, 1);
        newOrder.splice(toIndex, 0, teamId);
        setManualDraftOrder(newOrder);
        setDraftOrderType('manual');
    };

    const handleStartDraft = async () => {
        if (!currentLeague?.id) return;
        if (!manualDraftOrder.length && !teamsData.length) {
            showMessage('Set or randomize the draft order before starting.', 'error');
            return;
        }

        setIsSaving(true);
        try {
            await draftService.startDraft(currentLeague.id);
            setDraftStatus('live');
            showMessage('Draft started!', 'success');
        } catch (error) {
            console.error('Error starting draft:', error);
            showMessage(error.message || 'Failed to start draft.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleResetDraft = async () => {
        if (!currentLeague?.id) return;

        setIsSaving(true);
        try {
            try {
                const players = await nflPlayerService.getAllPlayers();
                draftService.setPlayerPool(players);
            } catch (poolError) {
                console.warn('Could not refresh player pool before reset:', poolError);
            }

            const result = await draftService.resetDraft(currentLeague.id);
            setDraftStatus(result?.status || 'order_set');
            setShowResetDraftModal(false);
            showMessage('Draft reset successfully. Picks cleared and order preserved.', 'success');
        } catch (error) {
            console.error('Error resetting draft:', error);
            showMessage(error.message || 'Failed to reset draft.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const canResetDraft = ['live', 'paused', 'completed', 'order_set', 'scheduled'].includes(draftStatus)
        || Boolean(currentLeague?.draft?.picks?.length)
        || Boolean(currentLeague?.draft?.draftedPlayers?.length);

    const getTeamName = (teamId) => teamsData.find((team) => team.id === teamId)?.teamName || 'Unknown Team';

    return (
        <div className={sectionClassName}>
            <h4 className="text-xl font-semibold mb-2 text-yellow-400">Draft Settings</h4>
            <p className="text-sm text-emerald-300 mb-6">
                Schedule the draft, choose auction or pick-based format, and set the draft order.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <label className="block">
                    <span className="text-emerald-200 font-medium">Draft Type</span>
                    <select
                        value={draftType}
                        onChange={(e) => {
                            const nextType = e.target.value;
                            setDraftType(nextType);
                            if (nextType === 'auction') {
                                setPickTimeLimit((prev) => clampAuctionBidSeconds(prev ?? DEFAULT_AUCTION_BID_TIME));
                            } else if (pickTimeLimit != null && pickTimeLimit < MIN_PICK_TIME) {
                                setPickTimeLimit(60);
                            }
                        }}
                        className={inputClassName}
                    >
                        {DRAFT_TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                    <p className="text-xs text-emerald-400 mt-2">
                        {draftType === 'auction' && 'Teams bid on players with a salary cap.'}
                        {draftType === 'standard' && 'Same pick order repeats every round.'}
                        {draftType === 'snake' && 'Pick order reverses every other round.'}
                    </p>
                </label>

                <div>
                    <span className="text-emerald-200 font-medium">Draft Status</span>
                    <div className="mt-3">
                        <span className={`inline-flex px-3 py-1 rounded-full text-sm font-bold ${
                            draftStatus === 'live' ? 'bg-green-600 text-white'
                                : draftStatus === 'scheduled' ? 'bg-purple-600 text-white'
                                    : draftStatus === 'order_set' ? 'bg-yellow-500 text-black'
                                        : 'bg-emerald-700 text-emerald-100'
                        }`}>
                            {draftStatus.replace('_', ' ')}
                        </span>
                    </div>
                </div>
            </div>

            <div className="mb-6 p-4 rounded-lg bg-emerald-900/60 border border-emerald-700">
                <h5 className="text-lg font-bold mb-3 text-emerald-200 border-b border-emerald-600 pb-2">Draft Date &amp; Time</h5>
                <div className="flex flex-col sm:flex-row gap-4 items-end">
                    <label className="flex-1 block">
                        <span className="text-emerald-200 font-medium text-sm">Scheduled Start</span>
                        <input
                            type="datetime-local"
                            value={draftDateTime}
                            onChange={(e) => setDraftDateTime(e.target.value)}
                            className={inputClassName}
                        />
                    </label>
                    <button
                        type="button"
                        onClick={handleSetDraftDateTime}
                        disabled={isSaving || !draftDateTime}
                        className={`${buttonClassName} bg-purple-800 hover:bg-purple-900 text-white`}
                    >
                        Set Date/Time
                    </button>
                </div>
            </div>

            {!isPickDraft && (
                <div className="mb-6 p-4 rounded-lg bg-emerald-900/60 border border-emerald-700">
                    <h5 className="text-lg font-bold mb-3 text-emerald-200 border-b border-emerald-600 pb-2">Auction Options</h5>
                    <label className="block max-w-xs">
                        <span className="text-emerald-200 font-medium text-sm">
                            Bid Timer ({MIN_AUCTION_BID_TIME}-{MAX_AUCTION_BID_TIME} seconds)
                        </span>
                        <input
                            type="number"
                            min={MIN_AUCTION_BID_TIME}
                            max={MAX_AUCTION_BID_TIME}
                            value={pickTimeLimit ?? DEFAULT_AUCTION_BID_TIME}
                            onChange={(e) => setPickTimeLimit(clampAuctionBidSeconds(e.target.value))}
                            className={inputClassName}
                        />
                        <p className="text-xs text-emerald-400 mt-2">
                            How long bidding stays open after a nomination or new bid. Current: {formatPickTimeLabel(clampAuctionBidSeconds(pickTimeLimit ?? DEFAULT_AUCTION_BID_TIME))}
                        </p>
                    </label>
                </div>
            )}

            {isPickDraft && (
                <div className="mb-6 p-4 rounded-lg bg-emerald-900/60 border border-emerald-700">
                    <h5 className="text-lg font-bold mb-3 text-emerald-200 border-b border-emerald-600 pb-2">Pick Draft Options</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className="block">
                            <span className="text-emerald-200 font-medium text-sm">Rounds ({MIN_ROUNDS}-{MAX_ROUNDS})</span>
                            <input
                                type="number"
                                min={MIN_ROUNDS}
                                max={MAX_ROUNDS}
                                value={draftRounds}
                                onChange={(e) => setDraftRounds(Number(e.target.value))}
                                className={inputClassName}
                            />
                        </label>
                        <label className="block">
                            <span className="text-emerald-200 font-medium text-sm">Pick Timer</span>
                            <select
                                value={pickTimeLimit === null ? 'unlimited' : String(pickTimeLimit)}
                                onChange={(e) => setPickTimeLimit(
                                    e.target.value === 'unlimited' ? null : Number(e.target.value)
                                )}
                                className={inputClassName}
                            >
                                {PICK_TIME_OPTIONS.map((option) => (
                                    <option
                                        key={option.label}
                                        value={option.value === null ? 'unlimited' : String(option.value)}
                                    >
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                            <p className="text-xs text-emerald-400 mt-2">
                                Current: {formatPickTimeLabel(pickTimeLimit)}
                            </p>
                        </label>
                    </div>
                </div>
            )}

            <div className="mb-6 p-4 rounded-lg bg-emerald-900/60 border border-emerald-700">
                <h5 className="text-lg font-bold mb-3 text-emerald-200 border-b border-emerald-600 pb-2">Draft Order</h5>
                <p className="text-sm text-emerald-300 mb-4">
                    Set round-one order manually or randomize it. {draftType === 'snake' ? 'Snake drafts reverse order on even rounds.' : draftType === 'standard' ? 'Standard drafts repeat this order every round.' : 'Auction order controls nomination sequence.'}
                </p>

                <div className="flex flex-wrap gap-4 mb-4">
                    <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                            type="radio"
                            name="commissionerDraftOrderType"
                            value="random"
                            checked={draftOrderType === 'random'}
                            onChange={() => setDraftOrderType('random')}
                            className="form-radio h-4 w-4 text-purple-500 focus:ring-purple-500"
                        />
                        <span className="text-emerald-200 font-medium">Randomize</span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                            type="radio"
                            name="commissionerDraftOrderType"
                            value="manual"
                            checked={draftOrderType === 'manual'}
                            onChange={() => setDraftOrderType('manual')}
                            className="form-radio h-4 w-4 text-purple-500 focus:ring-purple-500"
                        />
                        <span className="text-emerald-200 font-medium">Set Manually</span>
                    </label>
                </div>

                <div className="flex flex-wrap gap-3 mb-4">
                    <button
                        type="button"
                        onClick={handleRandomizeDraftOrder}
                        disabled={isSaving || !teamsData.length}
                        className={`${buttonClassName} bg-green-600 hover:bg-green-700 text-white`}
                    >
                        Randomize Order
                    </button>
                    {draftOrderType === 'manual' && (
                        <button
                            type="button"
                            onClick={handleSetManualDraftOrder}
                            disabled={isSaving || !manualDraftOrder.length}
                            className={`${buttonClassName} bg-purple-600 hover:bg-purple-700 text-white`}
                        >
                            Save Manual Order
                        </button>
                    )}
                </div>

                {draftOrderType === 'manual' && (
                    <div className="mb-4 p-4 rounded-lg bg-emerald-950/50 border border-emerald-700">
                        <h6 className="text-md font-semibold mb-3 text-emerald-200">Manual Order Editor</h6>
                        <div className="space-y-2">
                            {manualDraftOrder.map((teamId, index) => (
                                <div key={teamId} className="flex items-center gap-3 bg-emerald-800 p-3 rounded-lg">
                                    <span className="text-emerald-300 font-bold min-w-[36px]">#{index + 1}</span>
                                    <span className="flex-1 text-white font-medium">{getTeamName(teamId)}</span>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => handleMoveTeamInDraftOrder(index, Math.max(0, index - 1))}
                                            disabled={index === 0}
                                            className="px-3 py-1 bg-purple-800 hover:bg-purple-900 text-white rounded disabled:opacity-50"
                                        >
                                            ↑
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleMoveTeamInDraftOrder(index, Math.min(manualDraftOrder.length - 1, index + 1))}
                                            disabled={index === manualDraftOrder.length - 1}
                                            className="px-3 py-1 bg-purple-800 hover:bg-purple-900 text-white rounded disabled:opacity-50"
                                        >
                                            ↓
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {manualDraftOrder.length > 0 && (
                    <div className="p-4 rounded-lg bg-emerald-950/50 border border-emerald-700">
                        <h6 className="text-md font-semibold mb-3 text-emerald-200">
                            Round 1 Order Preview
                        </h6>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                            {manualDraftOrder.map((teamId, index) => (
                                <div key={teamId} className="bg-emerald-800 p-2 rounded text-sm">
                                    <span className="text-emerald-300 font-bold">#{index + 1}</span>
                                    <span className="text-white ml-2">{getTeamName(teamId)}</span>
                                </div>
                            ))}
                        </div>
                        {isPickDraft && previewOrder.length > 0 && (
                            <p className="text-xs text-emerald-400 mt-3">
                                Full pick sequence: {previewOrder.length} total picks across {draftRounds} rounds.
                            </p>
                        )}
                    </div>
                )}
            </div>

            <div className="flex flex-wrap gap-3">
                <button
                    type="button"
                    onClick={handleSaveDraftSettings}
                    disabled={isSaving}
                    className={`${buttonClassName} bg-emerald-600 hover:bg-emerald-700 text-white`}
                >
                    {isSaving ? 'Saving...' : 'Save Draft Settings'}
                </button>
                {draftStatus !== 'live' && draftStatus !== 'completed' && (
                    <button
                        type="button"
                        onClick={handleStartDraft}
                        disabled={isSaving || (!manualDraftOrder.length && !teamsData.length)}
                        className={`${buttonClassName} bg-green-600 hover:bg-green-700 text-white`}
                    >
                        Start Draft
                    </button>
                )}
                {canResetDraft && (
                    <button
                        type="button"
                        onClick={() => setShowResetDraftModal(true)}
                        disabled={isSaving}
                        className={`${buttonClassName} bg-orange-700 hover:bg-orange-800 text-white`}
                    >
                        Reset Draft
                    </button>
                )}
            </div>

            <ConfirmationModal
                isOpen={showResetDraftModal}
                onClose={() => setShowResetDraftModal(false)}
                onConfirm={handleResetDraft}
                title="Reset Draft"
            >
                Reset the entire draft? All picks will be cleared, drafted players removed from benches, and the draft returned to order-set status. Draft settings and order are kept.
            </ConfirmationModal>
        </div>
    );
};
