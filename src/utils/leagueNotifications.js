import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';

export const NOTIFICATION_TYPES = {
    TRADE_PROPOSED: 'trade_proposed',
    LEAGUE_CHAT: 'league_chat',
    DIRECT_MESSAGE: 'direct_message',
};

const TAB_FOR_TYPE = {
    [NOTIFICATION_TYPES.TRADE_PROPOSED]: 'trade',
    [NOTIFICATION_TYPES.LEAGUE_CHAT]: 'league-chat',
    [NOTIFICATION_TYPES.DIRECT_MESSAGE]: 'direct-messages',
};

export const tabForNotificationType = (type) => TAB_FOR_TYPE[type] || null;

export const defaultNotificationToast = (notification) => {
    if (notification?.message) return notification.message;
    if (notification?.type === NOTIFICATION_TYPES.TRADE_PROPOSED) {
        return 'You received a new trade proposal.';
    }
    if (notification?.type === NOTIFICATION_TYPES.LEAGUE_CHAT) {
        return 'New league chat message.';
    }
    if (notification?.type === NOTIFICATION_TYPES.DIRECT_MESSAGE) {
        return 'You received a new direct message.';
    }
    return 'You have a new notification.';
};

/**
 * Create one notification per recipient under leagues/{leagueId}/notifications.
 * Skips empty recipient lists. Uses batched writes (max 500 ops).
 */
export const createLeagueNotifications = async (db, leagueId, {
    type,
    recipientUserIds = [],
    message,
    senderId = null,
    senderName = null,
    extra = {},
}) => {
    if (!db || !leagueId || !type) return;

    const uniqueRecipients = [...new Set(
        (recipientUserIds || []).filter((uid) => uid && uid !== senderId)
    )];
    if (!uniqueRecipients.length) return;

    const batch = writeBatch(db);
    const notificationsRef = collection(db, 'leagues', leagueId, 'notifications');

    uniqueRecipients.forEach((recipientUserId) => {
        const notificationRef = doc(notificationsRef);
        batch.set(notificationRef, {
            type,
            recipientUserId,
            message: message || defaultNotificationToast({ type }),
            senderId: senderId || null,
            senderName: senderName || null,
            read: false,
            createdAt: serverTimestamp(),
            ...extra,
        });
    });

    await batch.commit();
};
