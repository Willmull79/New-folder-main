import { buildStartingSlots } from '../constants/leagueDefaults.js';

const firebase = typeof window !== 'undefined' ? window.firebase : null;

export const PENDING_INVITE_STORAGE_KEY = 'pendingInviteLeagueId';
/** When set, the app must show AuthScreen before joining (even if a session exists). */
export const PENDING_INVITE_GATE_KEY = 'pendingInviteRequiresLogin';

const safeSessionGet = (key) => {
    try {
        return sessionStorage.getItem(key);
    } catch (_) {
        return null;
    }
};

const safeSessionSet = (key, value) => {
    try {
        sessionStorage.setItem(key, value);
    } catch (_) {
        // ignore
    }
};

const safeSessionRemove = (key) => {
    try {
        sessionStorage.removeItem(key);
    } catch (_) {
        // ignore
    }
};

/** Capture ?joinLeague= from the URL into sessionStorage and clear the query param. */
export const capturePendingInviteFromUrl = () => {
    if (typeof window === 'undefined') return null;

    try {
        const params = new URLSearchParams(window.location.search);
        const joinId = (params.get('joinLeague') || '').trim();
        if (!joinId) return null;

        safeSessionSet(PENDING_INVITE_STORAGE_KEY, joinId);
        // Logged-out invitees must hit AuthScreen; already-logged-in members skip re-join.
        safeSessionSet(PENDING_INVITE_GATE_KEY, '1');

        params.delete('joinLeague');
        const search = params.toString();
        const next = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
        window.history.replaceState({}, '', next);
        return joinId;
    } catch (error) {
        console.warn('Failed to capture join invite from URL:', error);
        return null;
    }
};

export const getPendingInviteLeagueId = () => (safeSessionGet(PENDING_INVITE_STORAGE_KEY) || '').trim() || null;

export const clearPendingInviteLeagueId = () => {
    safeSessionRemove(PENDING_INVITE_STORAGE_KEY);
};

export const hasPendingInvite = () => Boolean(getPendingInviteLeagueId());

export const inviteRequiresLogin = () => safeSessionGet(PENDING_INVITE_GATE_KEY) === '1';

export const clearInviteLoginGate = () => {
    safeSessionRemove(PENDING_INVITE_GATE_KEY);
};

export const clearAllInviteState = () => {
    clearPendingInviteLeagueId();
    clearInviteLoginGate();
};

/** True if this user is already commissioner, co-commissioner, listed in members, or owns a team. */
export const isUserAlreadyInLeague = (leagueData, userId, existingTeamId = null) => {
    if (!leagueData || !userId) return false;
    if (existingTeamId) return true;
    if (leagueData.commissionerId === userId) return true;
    if (Array.isArray(leagueData.coCommissioners) && leagueData.coCommissioners.includes(userId)) return true;
    if (Array.isArray(leagueData.members) && leagueData.members.includes(userId)) return true;
    return false;
};

/**
 * Join a league as the given user: create a team doc (if needed) and add team id to league.teams.
 * Existing members (commissioner / co-commissioner / members / team owner) are never re-joined.
 * Returns { leagueId, teamId, leagueName, alreadyMember }.
 */
export const joinLeagueAsUser = async ({ db, leagueId, userId, userDisplayName }) => {
    if (!db || !leagueId || !userId) {
        throw new Error('Missing league or user info for join.');
    }
    if (!firebase?.firestore) {
        throw new Error('Firebase is not ready.');
    }

    const leagueDocRef = db.doc(`leagues/${leagueId}`);
    const teamsCollectionRef = db.collection(`leagues/${leagueId}/teams`);
    const leagueDoc = await leagueDocRef.get();

    if (!leagueDoc.exists) {
        throw new Error('League not found.');
    }

    const leagueData = leagueDoc.data() || {};
    const existingTeamQuery = await teamsCollectionRef.where('ownerId', '==', userId).limit(1).get();
    const existingTeamId = existingTeamQuery.empty ? null : existingTeamQuery.docs[0].id;

    // Safety check: never re-add someone already in the league
    if (isUserAlreadyInLeague(leagueData, userId, existingTeamId)) {
        if (!existingTeamId) {
            throw new Error('You are already part of this league, but no team was found for your account.');
        }
        return {
            leagueId,
            teamId: existingTeamId,
            leagueName: leagueData.name || 'League',
            alreadyMember: true,
        };
    }

    const divisions = leagueData.settings?.divisions || [];
    let assignedDivision = null;
    if (divisions.length > 0) {
        const teamCount = Array.isArray(leagueData.teams) ? leagueData.teams.length : 0;
        assignedDivision = divisions[teamCount % divisions.length];
    }

    const initialLineup = {};
    const startingSlots = leagueData.settings?.startingSlots || buildStartingSlots();
    Object.entries(startingSlots).forEach(([pos, count]) => {
        const n = Number(count) || 0;
        for (let i = 1; i <= n; i += 1) {
            initialLineup[`${pos}${i}`] = null;
        }
    });

    const newTeamData = {
        teamName: `${userDisplayName || 'New User'}'s Team`,
        ownerId: userId,
        roster: {
            lineup: initialLineup,
            bench: [],
            ir: [],
        },
        wins: 0,
        losses: 0,
        ties: 0,
    };
    if (assignedDivision) {
        newTeamData.division = assignedDivision;
    }

    const newTeamRef = await teamsCollectionRef.add(newTeamData);
    await leagueDocRef.update({
        memberIds: firebase.firestore.FieldValue.arrayUnion(userId),
        members: firebase.firestore.FieldValue.arrayUnion(userId),
        teams: firebase.firestore.FieldValue.arrayUnion(newTeamRef.id),
    });

    return {
        leagueId,
        teamId: newTeamRef.id,
        leagueName: leagueData.name || 'League',
        alreadyMember: false,
    };
};

// Capture invite ASAP on module load (before auth / routing)
capturePendingInviteFromUrl();
