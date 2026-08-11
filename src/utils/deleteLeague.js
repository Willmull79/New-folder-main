import {
    collection,
    doc,
    getDocs,
    limit,
    query,
    startAfter,
    writeBatch,
} from 'firebase/firestore';
import { getModularAuth, getModularFirestore } from '../config/firebaseModular.js';

/** Firestore batch write cap is 500; leave headroom. */
const BATCH_LIMIT = 400;
/** Security rules require list queries to declare limit <= 50. */
const PAGE_SIZE = 50;

async function getSignedInIdToken() {
    const modularUser = getModularAuth().currentUser;
    if (modularUser) {
        return modularUser.getIdToken();
    }
    // App sign-in lives on the compat SDK; modular Auth is a separate app instance.
    const compatUser = typeof window !== 'undefined'
        ? window.firebase?.auth?.()?.currentUser
        : null;
    if (compatUser) {
        return compatUser.getIdToken();
    }
    throw new Error('Not signed in.');
}

/**
 * Collect document refs from a subcollection (paginated).
 * Membership for this app lives on leagues/{id}.memberIds — deleting the
 * league doc is what removes users from the "Your Leagues" query.
 */
async function collectSubcollectionRefs(db, leagueId, subcollection) {
    const refs = [];
    const colRef = collection(db, 'leagues', leagueId, subcollection);
    let lastDoc = null;

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const pageQuery = lastDoc
            ? query(colRef, startAfter(lastDoc), limit(PAGE_SIZE))
            : query(colRef, limit(PAGE_SIZE));
        const snap = await getDocs(pageQuery);
        if (snap.empty) break;

        snap.docs.forEach((d) => refs.push(d.ref));
        lastDoc = snap.docs[snap.docs.length - 1];
        if (snap.size < PAGE_SIZE) break;
    }

    return refs;
}

async function commitDeletes(db, refs) {
    for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db);
        refs.slice(i, i + BATCH_LIMIT).forEach((ref) => batch.delete(ref));
        await batch.commit();
    }
}

async function deleteLeagueViaCloudFunction(leagueId) {
    const token = await getSignedInIdToken();
    const response = await fetch('/api/leagues/delete', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ leagueId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const err = new Error(data.error || `Delete failed (${response.status})`);
        err.status = response.status;
        throw err;
    }
    return data;
}

/**
 * Client fallback when the Cloud Function is unavailable.
 * Uses the compat Firestore (same Auth session as the rest of the app).
 */
async function deleteLeagueClientFallback(leagueId) {
    const compatDb = typeof window !== 'undefined'
        ? window.firebase?.firestore?.()
        : null;

    if (compatDb) {
        const teamSnap = await compatDb.collection(`leagues/${leagueId}/teams`).limit(50).get();
        const tradeSnap = await compatDb.collection(`leagues/${leagueId}/trades`).limit(50).get();
        const waiverSnap = await compatDb.collection(`leagues/${leagueId}/waivers`).limit(50).get();

        const batch = compatDb.batch();
        let ops = 0;
        const enqueue = (ref) => {
            batch.delete(ref);
            ops += 1;
        };
        teamSnap.docs.forEach((d) => enqueue(d.ref));
        tradeSnap.docs.forEach((d) => enqueue(d.ref));
        waiverSnap.docs.forEach((d) => enqueue(d.ref));
        enqueue(compatDb.doc(`leagues/${leagueId}`));

        if (ops > 0) {
            await batch.commit();
        }

        // Paginate remaining teams if >50 (rare).
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const more = await compatDb.collection(`leagues/${leagueId}/teams`).limit(50).get();
            if (more.empty) break;
            const b = compatDb.batch();
            more.docs.forEach((d) => b.delete(d.ref));
            await b.commit();
        }

        // Ensure parent is gone even if first batch partially applied.
        const parent = await compatDb.doc(`leagues/${leagueId}`).get();
        if (parent.exists) {
            await compatDb.doc(`leagues/${leagueId}`).delete();
        }
        return;
    }

    // Last resort: modular SDK (may lack Auth if never signed in on modular app).
    const db = getModularFirestore();
    const leagueRef = doc(db, 'leagues', leagueId);
    const teamRefs = await collectSubcollectionRefs(db, leagueId, 'teams');
    const tradeRefs = await collectSubcollectionRefs(db, leagueId, 'trades');
    const waiverRefs = await collectSubcollectionRefs(db, leagueId, 'waivers');
    await commitDeletes(db, [...teamRefs, ...tradeRefs, ...waiverRefs]);
    await commitDeletes(db, [leagueRef]);
}

/**
 * Permanently delete a league for all members.
 * Prefers Admin recursiveDelete via Cloud Function; falls back to client deletes.
 *
 * @param {string} leagueId
 */
export async function deleteLeagueCompletely(leagueId) {
    if (!leagueId) {
        throw new Error('Missing league id.');
    }

    try {
        return await deleteLeagueViaCloudFunction(leagueId);
    } catch (cfError) {
        console.warn('Cloud Function league delete failed, trying client fallback:', cfError);
        await deleteLeagueClientFallback(leagueId);
        return { ok: true, fallback: true, leagueId };
    }
}
