const bcrypt = require('bcryptjs');
const { getFirestore } = require('./firestore');

const USERS_COLLECTION = 'users';

const defaultPreferences = () => ({
    theme: 'auto',
    notifications: { email: true, push: true, sms: false },
    timezone: 'America/New_York',
    language: 'en',
});

const defaultStats = () => ({
    totalLeagues: 0,
    championships: 0,
    totalWins: 0,
    totalLosses: 0,
    totalTies: 0,
});

const defaultSubscription = () => ({
    plan: 'free',
    expiresAt: null,
    stripeCustomerId: null,
});

const toUserObject = (doc) => {
    if (!doc || !doc.exists) {
        return null;
    }

    const data = doc.data();
    const id = doc.id;

    return {
        _id: id,
        id,
        ...data,
        get fullName() {
            return `${this.firstName || ''} ${this.lastName || ''}`.trim();
        },
        get displayName() {
            return this.username || this.fullName;
        },
        async comparePassword(candidatePassword) {
            return bcrypt.compare(candidatePassword, this.password);
        },
        getPublicProfile() {
            return {
                _id: id,
                email: data.email,
                firstName: data.firstName,
                lastName: data.lastName,
                username: data.username,
                avatar: data.avatar,
                fullName: this.fullName,
                displayName: this.displayName,
                stats: data.stats || defaultStats(),
                preferences: data.preferences || defaultPreferences(),
                subscription: {
                    plan: data.subscription?.plan || 'free',
                    expiresAt: data.subscription?.expiresAt || null,
                },
                createdAt: data.createdAt,
            };
        },
        async save() {
            const db = getFirestore();
            const { _id, id: docId, ...updateData } = this;
            updateData.updatedAt = new Date();
            await db.collection(USERS_COLLECTION).doc(id).set(updateData, { merge: true });
            return this;
        },
    };
};

const hashPassword = async (password) => {
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;
    return bcrypt.hash(password, saltRounds);
};

const findByEmail = async (email, includePassword = false) => {
    const db = getFirestore();
    const snapshot = await db.collection(USERS_COLLECTION)
        .where('email', '==', email.toLowerCase())
        .limit(1)
        .get();

    if (snapshot.empty) {
        return null;
    }

    const user = toUserObject(snapshot.docs[0]);
    if (!includePassword) {
        delete user.password;
    }
    return user;
};

const findByUsername = async (username) => {
    const db = getFirestore();
    const snapshot = await db.collection(USERS_COLLECTION)
        .where('username', '==', username.toLowerCase())
        .limit(1)
        .get();

    return snapshot.empty ? null : toUserObject(snapshot.docs[0]);
};

const findById = async (userId, includePassword = false) => {
    const db = getFirestore();
    const doc = await db.collection(USERS_COLLECTION).doc(userId).get();
    const user = toUserObject(doc);

    if (user && !includePassword) {
        delete user.password;
    }
    return user;
};

const findByVerificationToken = async (token) => {
    const db = getFirestore();
    const snapshot = await db.collection(USERS_COLLECTION)
        .where('verificationToken', '==', token)
        .limit(1)
        .get();

    return snapshot.empty ? null : toUserObject(snapshot.docs[0]);
};

const findByResetToken = async (hashedToken) => {
    const db = getFirestore();
    const snapshot = await db.collection(USERS_COLLECTION)
        .where('resetPasswordToken', '==', hashedToken)
        .limit(1)
        .get();

    if (snapshot.empty) {
        return null;
    }

    const user = toUserObject(snapshot.docs[0]);
    if (user.resetPasswordExpires && user.resetPasswordExpires.toDate) {
        user.resetPasswordExpires = user.resetPasswordExpires.toDate();
    } else if (user.resetPasswordExpires && typeof user.resetPasswordExpires === 'object' && user.resetPasswordExpires._seconds) {
        user.resetPasswordExpires = new Date(user.resetPasswordExpires._seconds * 1000);
    }

    if (!user.resetPasswordExpires || user.resetPasswordExpires <= new Date()) {
        return null;
    }

    return user;
};

const createUser = async ({ email, password, firstName, lastName, username, verificationToken }) => {
    const db = getFirestore();
    const now = new Date();
    const hashedPassword = await hashPassword(password);

    const userData = {
        email: email.toLowerCase(),
        password: hashedPassword,
        firstName,
        lastName,
        username: username ? username.toLowerCase() : null,
        avatar: null,
        isActive: true,
        isVerified: false,
        verificationToken: verificationToken || null,
        resetPasswordToken: null,
        resetPasswordExpires: null,
        lastLogin: null,
        preferences: defaultPreferences(),
        stats: defaultStats(),
        subscription: defaultSubscription(),
        createdAt: now,
        updatedAt: now,
    };

    const docRef = await db.collection(USERS_COLLECTION).add(userData);
    const doc = await docRef.get();
    return toUserObject(doc);
};

const updateUser = async (userId, updates) => {
    const db = getFirestore();
    const updateData = { ...updates, updatedAt: new Date() };

    if (updateData.password) {
        updateData.password = await hashPassword(updateData.password);
    }

    await db.collection(USERS_COLLECTION).doc(userId).set(updateData, { merge: true });
    return findById(userId);
};

module.exports = {
    USERS_COLLECTION,
    findByEmail,
    findByUsername,
    findById,
    findByVerificationToken,
    findByResetToken,
    createUser,
    updateUser,
    hashPassword,
    toUserObject,
};
