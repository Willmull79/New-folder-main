const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({
    origin: true,
    credentials: true,
    methods: ['POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    preflightContinue: false,
    optionsSuccessStatus: 200,
});

const verifyFirebaseUser = async (req) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
        const err = new Error('Access token required');
        err.status = 401;
        throw err;
    }
    const decoded = await admin.auth().verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email || null };
};

/**
 * Authoritative league delete (Admin SDK).
 * Recursively removes the league doc and all subcollections so memberIds
 * membership queries stop returning the league for every member.
 *
 * POST /api/leagues/delete  { "leagueId": "..." }
 * Authorization: Bearer <Firebase ID token>
 */
const deleteLeagueHandler = async (req, res) => {
    if (req.method === 'OPTIONS') {
        return res.status(204).send('');
    }
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const user = await verifyFirebaseUser(req);
        const leagueId = String(req.body?.leagueId || '').trim();
        if (!leagueId) {
            return res.status(400).json({ error: 'leagueId is required' });
        }

        const db = admin.firestore();
        const leagueRef = db.doc(`leagues/${leagueId}`);
        const leagueSnap = await leagueRef.get();

        if (!leagueSnap.exists) {
            // Idempotent: already gone (or only orphaned subcollections remain).
            try {
                await db.recursiveDelete(leagueRef);
            } catch (cleanupErr) {
                console.warn('Orphan recursive cleanup:', cleanupErr?.message || cleanupErr);
            }
            return res.status(200).json({ ok: true, alreadyDeleted: true, leagueId });
        }

        const data = leagueSnap.data() || {};
        if (data.commissionerId !== user.uid) {
            return res.status(403).json({
                error: 'Only the primary commissioner can delete this league.',
            });
        }

        await db.recursiveDelete(leagueRef);
        return res.status(200).json({ ok: true, leagueId });
    } catch (error) {
        console.error('deleteLeague failed:', error);
        const status = error.status || 500;
        return res.status(status).json({
            error: error.message || 'Failed to delete league',
        });
    }
};

exports.deleteLeagueApi = functions.https.onRequest((req, res) => {
    cors(req, res, () => deleteLeagueHandler(req, res));
});
