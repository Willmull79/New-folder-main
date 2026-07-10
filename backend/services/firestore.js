const admin = require('firebase-admin');

let db = null;

const initializeFirebase = () => {
    if (db) {
        return db;
    }

    if (!admin.apps.length) {
        if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                }),
            });
        } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            admin.initializeApp({
                credential: admin.credential.applicationDefault(),
            });
        } else {
            admin.initializeApp();
        }
    }

    db = admin.firestore();
    return db;
};

const getFirestore = () => {
    if (!db) {
        return initializeFirebase();
    }
    return db;
};

const getAdmin = () => admin;

module.exports = {
    initializeFirebase,
    getFirestore,
    getAdmin,
};
