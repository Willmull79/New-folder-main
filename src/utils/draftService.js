import {
    buildTimerState,
    makeDraftPickLocal,
    pauseDraftLocal,
    resetDraftLocal,
    resumeDraftLocal,
    startDraftLocal,
    stopDraftLocal,
} from './localDraftEngine.js';
import { generatePickOrder, shuffleArray } from './draftOrderUtils.js';
import { isOnActiveNflRoster } from './helpers.js';

class DraftService {
    constructor() {
        this.baseUrl = 'https://us-central1-dynasty-420.cloudfunctions.net';
        this.db = null;
        this.playerPool = [];
    }

    setFirestore(db) {
        this.db = db;
    }

    setPlayerPool(players) {
        this.playerPool = (players || []).filter(isOnActiveNflRoster);
    }

    async getDraftStatus(leagueId, draftDoc, leagueTeams = []) {
        if (draftDoc) {
            return buildTimerState(draftDoc, leagueTeams);
        }

        if (this.db) {
            const snap = await this.db.doc(`leagues/${leagueId}`).get();
            if (snap.exists) {
                const data = snap.data();
                return buildTimerState(data.draft, data.teams);
            }
        }

        try {
            const response = await fetch(`${this.baseUrl}/getDraftTimerState?leagueId=${leagueId}`);
            if (!response.ok) {
                throw new Error('Failed to fetch draft status');
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching draft status:', error);
            throw error;
        }
    }

    async startDraft(leagueId) {
        if (this.db) {
            return startDraftLocal(this.db, leagueId, this.playerPool);
        }

        try {
            const response = await fetch(`${this.baseUrl}/startDraft`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ leagueId }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to start draft');
            }

            return await response.json();
        } catch (error) {
            console.error('Error starting draft:', error);
            throw error;
        }
    }

    async makeDraftPick(leagueId, teamId, playerId) {
        if (this.db) {
            return makeDraftPickLocal(this.db, leagueId, teamId, playerId, this.playerPool);
        }

        try {
            const response = await fetch(`${this.baseUrl}/makeDraftPick`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ leagueId, teamId, playerId }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to make draft pick');
            }

            return await response.json();
        } catch (error) {
            console.error('Error making draft pick:', error);
            throw error;
        }
    }

    async configureDraft(leagueId, settings) {
        try {
            const response = await fetch(`${this.baseUrl}/configureDraft`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ leagueId, ...settings }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to configure draft');
            }

            return await response.json();
        } catch (error) {
            console.error('Error configuring draft:', error);
            throw error;
        }
    }

    async setDraftOrder(leagueId, roundOneOrder, options = {}) {
        if (this.db) {
            const leagueRef = this.db.doc(`leagues/${leagueId}`);
            const snap = await leagueRef.get();
            const draft = snap.data()?.draft || {};
            const draftFormat = options.draftFormat || draft.settings?.draftFormat || 'standard';
            const rounds = options.rounds || draft.settings?.rounds || 20;

            await leagueRef.update({
                draft: {
                    ...draft,
                    roundOneOrder,
                    orderType: 'manual',
                    draftOrder: generatePickOrder(roundOneOrder, draftFormat, rounds),
                    status: 'order_set',
                },
            });

            return {
                success: true,
                roundOneOrder,
                draftOrder: generatePickOrder(roundOneOrder, draftFormat, rounds),
            };
        }

        try {
            const response = await fetch(`${this.baseUrl}/setCustomDraftOrder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    leagueId,
                    roundOneOrder,
                    ...options,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to set draft order');
            }

            return await response.json();
        } catch (error) {
            console.error('Error setting draft order:', error);
            throw error;
        }
    }

    async randomizeDraftOrder(leagueId, settings = {}) {
        if (this.db) {
            const leagueRef = this.db.doc(`leagues/${leagueId}`);
            const snap = await leagueRef.get();
            const league = snap.data();
            const draft = league?.draft || {};
            const roundOneOrder = [...(league?.teams || draft.roundOneOrder || [])];
            const randomizedOrder = shuffleArray(roundOneOrder);
            const draftFormat = settings.draftFormat || draft.settings?.draftFormat || 'standard';
            const rounds = settings.rounds || draft.settings?.rounds || 20;
            const draftOrder = generatePickOrder(randomizedOrder, draftFormat, rounds);

            await leagueRef.update({
                draft: {
                    ...draft,
                    roundOneOrder: randomizedOrder,
                    draftOrder,
                    orderType: 'random',
                    status: 'order_set',
                },
            });

            return { success: true, roundOneOrder: randomizedOrder, draftOrder };
        }

        try {
            const response = await fetch(`${this.baseUrl}/randomizeDraftOrder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ leagueId, ...settings }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to randomize draft order');
            }

            return await response.json();
        } catch (error) {
            console.error('Error randomizing draft order:', error);
            throw error;
        }
    }

    async pauseDraft(leagueId) {
        if (this.db) {
            return pauseDraftLocal(this.db, leagueId);
        }
        return { success: true, message: 'Pause draft not implemented' };
    }

    async resumeDraft(leagueId) {
        if (this.db) {
            return resumeDraftLocal(this.db, leagueId);
        }
        return { success: true, message: 'Resume draft not implemented' };
    }

    async stopDraft(leagueId) {
        if (this.db) {
            return stopDraftLocal(this.db, leagueId);
        }
        return this.endDraft(leagueId);
    }

    async resetDraft(leagueId) {
        if (this.db) {
            return resetDraftLocal(this.db, leagueId, this.playerPool);
        }
        throw new Error('Reset draft requires Firestore connection');
    }

    async endDraft(leagueId) {
        if (this.db) {
            await this.db.doc(`leagues/${leagueId}`).update({
                'draft.status': 'completed',
                'draft.completedAt': new Date().toISOString(),
            });
            return { success: true };
        }

        try {
            const response = await fetch(`${this.baseUrl}/completeDraft`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ leagueId }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to end draft');
            }

            return await response.json();
        } catch (error) {
            console.error('Error ending draft:', error);
            throw error;
        }
    }

    async getDraftHistory(leagueId) {
        try {
            const response = await fetch(`${this.baseUrl}/getDraftState?leagueId=${leagueId}`);
            if (!response.ok) {
                throw new Error('Failed to fetch draft history');
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching draft history:', error);
            throw error;
        }
    }

    async getDraftOrder(leagueId) {
        return this.getDraftStatus(leagueId);
    }

    async autoPickPlayer(leagueId, teamId) {
        return { success: true, message: 'Auto-pick handled locally in DraftCenter' };
    }

    async getDraftAnalysis(leagueId, teamId) {
        return { analysis: { strategy: 'balanced', riskTolerance: 'medium' } };
    }

    async getOptimalPick(availablePlayers, teamNeeds) {
        return { optimalPick: availablePlayers[0] || null };
    }

    async validateAuctionAction(leagueId, teamId, action, data) {
        return { valid: true };
    }

    async setDraftDateTime(leagueId, dateTime) {
        if (this.db) {
            await this.db.doc(`leagues/${leagueId}`).update({
                'draft.scheduledDateTime': dateTime,
                'draft.status': 'scheduled',
            });
            return { success: true };
        }

        try {
            const response = await fetch(`${this.baseUrl}/setDraftDateTime`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ leagueId, scheduledDateTime: dateTime }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to set draft date/time');
            }

            return await response.json();
        } catch (error) {
            console.error('Error setting draft date/time:', error);
            throw error;
        }
    }

    async getAvailablePlayers(leagueId) {
        if (this.db) {
            const snap = await this.db.doc(`leagues/${leagueId}`).get();
            return snap.data()?.draft?.availablePlayers || [];
        }

        try {
            const response = await fetch(`${this.baseUrl}/getAvailablePlayers?leagueId=${leagueId}`);
            if (!response.ok) {
                throw new Error('Failed to fetch available players');
            }
            const result = await response.json();
            return result.data || result;
        } catch (error) {
            console.error('Error fetching available players:', error);
            throw error;
        }
    }

    async updateDraftBoard(leagueId, teamId, draftBoard) {
        return { success: true, message: 'Draft board update not implemented' };
    }

    async getDraftBoard(leagueId, teamId) {
        return { draftBoard: [] };
    }

    subscribeToDraftStatus(leagueId, callback) {
        const interval = setInterval(async () => {
            try {
                const status = await this.getDraftStatus(leagueId);
                callback(status);
            } catch (error) {
                console.error('Error in draft status subscription:', error);
            }
        }, 1000);

        return () => clearInterval(interval);
    }

    isMyTurn(draftStatus, currentTeamId, userTeamId) {
        return draftStatus.currentTeamId === userTeamId;
    }

    getPicksUntilTurn(draftStatus, userTeamId) {
        if (!draftStatus.draftOrder || !userTeamId) return 0;

        const currentPick = draftStatus.currentPick || 0;
        for (let i = currentPick; i < draftStatus.draftOrder.length; i += 1) {
            if (draftStatus.draftOrder[i] === userTeamId) {
                return i - currentPick;
            }
        }

        return 0;
    }

    formatTimeRemaining(seconds) {
        if (seconds === null || seconds === undefined) return 'Unlimited';
        if (seconds <= 0) return 'Time Up!';
        return `${seconds}s`;
    }

    getDraftStatusColor(status) {
        switch (status) {
            case 'pending': return 'text-yellow-500';
            case 'scheduled': return 'text-blue-500';
            case 'order_set': return 'text-yellow-500';
            case 'live': return 'text-green-500';
            case 'paused': return 'text-orange-500';
            case 'completed':
            case 'complete': return 'text-gray-500';
            default: return 'text-gray-400';
        }
    }
}

const draftService = new DraftService();

export default draftService;
