// Backend API Service for Fantasy Dynasty Central
// This file handles all communication with the Express backend

class BackendAPIService {
    constructor() {
        // Backend API configuration
        this.baseURL = process.env.BACKEND_URL || 'http://localhost:3001';
        this.apiVersion = 'v1';
        
        // Get stored token from localStorage
        this.token = localStorage.getItem('authToken');
        
        // Set up default headers
        this.defaultHeaders = {
            'Content-Type': 'application/json',
        };
    }

    // Update token when user logs in/out
    setToken(token) {
        this.token = token;
        if (token) {
            localStorage.setItem('authToken', token);
        } else {
            localStorage.removeItem('authToken');
        }
    }

    // Get authorization header
    getAuthHeaders() {
        const headers = { ...this.defaultHeaders };
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        return headers;
    }

    // Generic API call method
    async makeRequest(endpoint, options = {}) {
        try {
            const url = `${this.baseURL}/api${endpoint}`;
            const config = {
                headers: this.getAuthHeaders(),
                ...options
            };

            console.log(`Making request to: ${url}`);
            const response = await fetch(url, config);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorData.message || ''}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Backend API Request failed:', error);
            throw error;
        }
    }

    // ===== AUTHENTICATION ENDPOINTS =====

    // Register new user
    async register(userData) {
        return this.makeRequest('/auth/register', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
    }

    // Login user
    async login(credentials) {
        const response = await this.makeRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify(credentials)
        });
        
        // Store token if login successful
        if (response.token) {
            this.setToken(response.token);
        }
        
        return response;
    }

    // Logout user
    async logout() {
        try {
            await this.makeRequest('/auth/logout', { method: 'POST' });
        } finally {
            this.setToken(null);
        }
    }

    // Get current user profile
    async getProfile() {
        return this.makeRequest('/auth/profile');
    }

    // Update user profile
    async updateProfile(profileData) {
        return this.makeRequest('/auth/profile', {
            method: 'PUT',
            body: JSON.stringify(profileData)
        });
    }

    // ===== LEAGUE ENDPOINTS =====

    // Get user's leagues
    async getLeagues() {
        return this.makeRequest('/leagues');
    }

    // Create new league
    async createLeague(leagueData) {
        return this.makeRequest('/leagues', {
            method: 'POST',
            body: JSON.stringify(leagueData)
        });
    }

    // Get specific league
    async getLeague(leagueId) {
        return this.makeRequest(`/leagues/${leagueId}`);
    }

    // Update league
    async updateLeague(leagueId, leagueData) {
        return this.makeRequest(`/leagues/${leagueId}`, {
            method: 'PUT',
            body: JSON.stringify(leagueData)
        });
    }

    // Delete league
    async deleteLeague(leagueId) {
        return this.makeRequest(`/leagues/${leagueId}`, {
            method: 'DELETE'
        });
    }

    // ===== TEAM ENDPOINTS =====

    // Get user's teams
    async getTeams() {
        return this.makeRequest('/teams');
    }

    // Create new team
    async createTeam(teamData) {
        return this.makeRequest('/teams', {
            method: 'POST',
            body: JSON.stringify(teamData)
        });
    }

    // Get specific team
    async getTeam(teamId) {
        return this.makeRequest(`/teams/${teamId}`);
    }

    // Update team
    async updateTeam(teamId, teamData) {
        return this.makeRequest(`/teams/${teamId}`, {
            method: 'PUT',
            body: JSON.stringify(teamData)
        });
    }

    // ===== PLAYER ENDPOINTS =====

    // Get players with filters
    async getPlayers(filters = {}) {
        const queryString = new URLSearchParams(filters).toString();
        const endpoint = queryString ? `/players?${queryString}` : '/players';
        return this.makeRequest(endpoint);
    }

    // Get specific player
    async getPlayer(playerId) {
        return this.makeRequest(`/players/${playerId}`);
    }

    // Search players
    async searchPlayers(query) {
        return this.makeRequest(`/players/search?q=${encodeURIComponent(query)}`);
    }

    // ===== DRAFT ENDPOINTS =====

    // Get draft status
    async getDraftStatus(leagueId) {
        return this.makeRequest(`/draft/${leagueId}`);
    }

    // Make draft pick
    async makeDraftPick(leagueId, pickData) {
        return this.makeRequest(`/draft/${leagueId}/pick`, {
            method: 'POST',
            body: JSON.stringify(pickData)
        });
    }

    // ===== AUCTION ENDPOINTS =====

    // Get auction status
    async getAuctionStatus(leagueId) {
        return this.makeRequest(`/auction/${leagueId}`);
    }

    // Place bid
    async placeBid(leagueId, bidData) {
        return this.makeRequest(`/auction/${leagueId}/bid`, {
            method: 'POST',
            body: JSON.stringify(bidData)
        });
    }

    // ===== WAIVER ENDPOINTS =====

    // Get waiver wire
    async getWaiverWire(leagueId) {
        return this.makeRequest(`/waivers/${leagueId}`);
    }

    // Submit waiver claim
    async submitWaiverClaim(leagueId, claimData) {
        return this.makeRequest(`/waivers/${leagueId}/claim`, {
            method: 'POST',
            body: JSON.stringify(claimData)
        });
    }

    // ===== TRADE ENDPOINTS =====

    // Get trades
    async getTrades(leagueId) {
        return this.makeRequest(`/trades/${leagueId}`);
    }

    // Propose trade
    async proposeTrade(leagueId, tradeData) {
        return this.makeRequest(`/trades/${leagueId}`, {
            method: 'POST',
            body: JSON.stringify(tradeData)
        });
    }

    // ===== SCORING ENDPOINTS =====

    // Get scoring rules
    async getScoringRules(leagueId) {
        return this.makeRequest(`/scoring/${leagueId}`);
    }

    // Update scoring rules
    async updateScoringRules(leagueId, scoringData) {
        return this.makeRequest(`/scoring/${leagueId}`, {
            method: 'PUT',
            body: JSON.stringify(scoringData)
        });
    }

    // ===== STATS ENDPOINTS =====

    // Get player stats
    async getPlayerStats(filters = {}) {
        const queryString = new URLSearchParams(filters).toString();
        const endpoint = queryString ? `/stats/players?${queryString}` : '/stats/players';
        return this.makeRequest(endpoint);
    }

    // Get team stats
    async getTeamStats(filters = {}) {
        const queryString = new URLSearchParams(filters).toString();
        const endpoint = queryString ? `/stats/teams?${queryString}` : '/stats/teams';
        return this.makeRequest(endpoint);
    }

    // ===== HEALTH CHECK =====

    // Check backend health
    async checkHealth() {
        try {
            const response = await fetch(`${this.baseURL}/health`);
            return await response.json();
        } catch (error) {
            console.error('Health check failed:', error);
            throw error;
        }
    }

    // ===== UTILITY METHODS =====

    // Check if user is authenticated
    isAuthenticated() {
        return !!this.token;
    }

    // Get stored token
    getToken() {
        return this.token;
    }

    // Clear all stored data
    clearData() {
        this.setToken(null);
        localStorage.removeItem('authToken');
    }
}

// Create global instance
window.backendAPI = new BackendAPIService();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BackendAPIService;
} 