// API Service for Fantasy Dynasty Central
// This file handles all external API calls

class APIService {
    constructor() {
        // You can add your API keys here
        this.apiKeys = {
            // sportsData: 'YOUR_SPORTS_DATA_API_KEY',
            // weather: 'YOUR_WEATHER_API_KEY',
            // news: 'YOUR_NEWS_API_KEY'
        };
    }

    // Generic API call method
    async makeRequest(url, options = {}) {
        try {
            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('API Request failed:', error);
            throw error;
        }
    }

    // ESPN API - Free NFL data (no API key required)
    async getESPNTeams() {
        const url = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams';
        return this.makeRequest(url);
    }

    // Get ESPN team details with roster
    async getESPNTeamRoster(teamId) {
        const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamId}/roster`;
        return this.makeRequest(url);
    }

    // Get ESPN player stats
    async getESPNPlayerStats(playerId) {
        const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/athletes/${playerId}/stats`;
        return this.makeRequest(url);
    }

    // Get ESPN NFL standings
    async getESPNStandings() {
        const url = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/standings';
        return this.makeRequest(url);
    }

    // Get ESPN NFL scores/schedule
    async getESPNScores(week = null) {
        let url = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
        if (week) {
            url += `?week=${week}`;
        }
        return this.makeRequest(url);
    }

    // Get ESPN player search
    async getESPNPlayerSearch(query) {
        const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/athletes?search=${encodeURIComponent(query)}`;
        return this.makeRequest(url);
    }

    // Get ESPN team stats
    async getESPNTeamStats(teamId) {
        const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamId}/stats`;
        return this.makeRequest(url);
    }

    // Example: Get weather for game location
    async getWeather(city) {
        const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${this.apiKeys.weather}&units=imperial`;
        return this.makeRequest(url);
    }

    // Example: Get news about a player
    async getPlayerNews(playerName) {
        // You could integrate with a news API here
        const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(playerName + ' NFL')}&apiKey=${this.apiKeys.news}`;
        return this.makeRequest(url);
    }

    // Mock data for development (when APIs aren't available)
    getMockPlayerData() {
        return {
            players: [
                { id: 'p1', name: 'Patrick Mahomes', position: 'QB', team: 'KC', stats: { passingYards: 4183, touchdowns: 31 } },
                { id: 'p2', name: 'Christian McCaffrey', position: 'RB', team: 'SF', stats: { rushingYards: 1459, touchdowns: 14 } },
                { id: 'p3', name: 'Justin Jefferson', position: 'WR', team: 'MIN', stats: { receivingYards: 1809, touchdowns: 8 } }
            ]
        };
    }
}

// Create global instance
window.apiService = new APIService(); 