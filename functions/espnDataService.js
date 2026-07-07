const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');

// ESPN API Configuration
const ESPN_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const ESPN_ENDPOINTS = {
    PLAYERS: '/athletes',
    TEAMS: '/teams',
    SCOREBOARD: '/scoreboard',
    GAME_SUMMARY: '/summary',
    PLAYER_STATS: '/athletes/{playerId}/stats',
    TEAM_ROSTER: '/teams/{teamId}/roster'
};

// Firebase Firestore collections
const COLLECTIONS = {
    PLAYERS: 'players',
    TEAMS: 'teams',
    GAMES: 'games',
    SCORES: 'scores',
    STATS: 'player_stats',
    UPDATES: 'data_updates'
};

class ESPNDataService {
    constructor() {
        this.db = admin.firestore();
        this.batch = this.db.batch();
    }

    // Fetch and store all NFL teams
    async updateTeams() {
        try {
            console.log('Fetching NFL teams from ESPN API...');
            const response = await axios.get(`${ESPN_BASE_URL}${ESPN_ENDPOINTS.TEAMS}`);
            const data = response.data;

            if (data.sports && data.sports[0] && data.sports[0].leagues) {
                const nflLeague = data.sports[0].leagues.find(league => league.name === 'NFL');
                
                if (nflLeague && nflLeague.teams) {
                    const teamsData = nflLeague.teams.map(team => ({
                        id: team.team.id,
                        name: team.team.name,
                        abbreviation: team.team.abbreviation,
                        location: team.team.location,
                        nickname: team.team.nickname,
                        color: team.team.color,
                        alternateColor: team.team.alternateColor,
                        logo: team.team.logos?.[0]?.href,
                        conference: team.team.conference,
                        division: team.team.division,
                        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                    }));

                    // Store teams in Firestore
                    for (const team of teamsData) {
                        const teamRef = this.db.collection(COLLECTIONS.TEAMS).doc(team.id);
                        this.batch.set(teamRef, team, { merge: true });
                    }

                    await this.batch.commit();
                    console.log(`Updated ${teamsData.length} teams`);
                    
                    // Log update
                    await this.logDataUpdate('teams', teamsData.length);
                    
                    return teamsData;
                }
            }
        } catch (error) {
            console.error('Error updating teams:', error);
            throw error;
        }
    }

    // Fetch and store all NFL players
    async updatePlayers() {
        try {
            console.log('Fetching NFL players from ESPN API...');
            const response = await axios.get(`${ESPN_BASE_URL}${ESPN_ENDPOINTS.PLAYERS}`);
            const data = response.data;

            if (data.athletes) {
                const playersData = data.athletes.map(player => ({
                    id: player.id,
                    name: player.fullName,
                    firstName: player.firstName,
                    lastName: player.lastName,
                    displayName: player.displayName,
                    shortName: player.shortName,
                    position: player.position?.abbreviation,
                    positionName: player.position?.name,
                    teamId: player.team?.id,
                    teamName: player.team?.name,
                    jersey: player.jersey,
                    height: player.height,
                    weight: player.weight,
                    age: player.age,
                    college: player.college?.name,
                    headshot: player.headshot?.href,
                    photo: player.photo?.href,
                    status: player.status?.name,
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                }));

                // Store players in Firestore
                for (const player of playersData) {
                    const playerRef = this.db.collection(COLLECTIONS.PLAYERS).doc(player.id);
                    this.batch.set(playerRef, player, { merge: true });
                }

                await this.batch.commit();
                console.log(`Updated ${playersData.length} players`);
                
                // Log update
                await this.logDataUpdate('players', playersData.length);
                
                return playersData;
            }
        } catch (error) {
            console.error('Error updating players:', error);
            throw error;
        }
    }

    // Fetch and store current week's games
    async updateGames(week = null) {
        try {
            console.log('Fetching NFL games from ESPN API...');
            const url = week ? `${ESPN_BASE_URL}${ESPN_ENDPOINTS.SCOREBOARD}?week=${week}` : `${ESPN_BASE_URL}${ESPN_ENDPOINTS.SCOREBOARD}`;
            const response = await axios.get(url);
            const data = response.data;

            if (data.events) {
                const gamesData = data.events.map(game => ({
                    id: game.id,
                    name: game.name,
                    shortName: game.shortName,
                    date: game.date,
                    status: game.status,
                    homeTeam: {
                        id: game.competitions[0]?.competitors?.find(c => c.homeAway === 'home')?.team?.id,
                        name: game.competitions[0]?.competitors?.find(c => c.homeAway === 'home')?.team?.name,
                        score: game.competitions[0]?.competitors?.find(c => c.homeAway === 'home')?.score,
                        record: game.competitions[0]?.competitors?.find(c => c.homeAway === 'home')?.records?.[0]?.summary
                    },
                    awayTeam: {
                        id: game.competitions[0]?.competitors?.find(c => c.homeAway === 'away')?.team?.id,
                        name: game.competitions[0]?.competitors?.find(c => c.homeAway === 'away')?.team?.name,
                        score: game.competitions[0]?.competitors?.find(c => c.homeAway === 'away')?.score,
                        record: game.competitions[0]?.competitors?.find(c => c.homeAway === 'away')?.records?.[0]?.summary
                    },
                    week: game.week?.number,
                    season: game.season?.year,
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                }));

                // Store games in Firestore
                for (const game of gamesData) {
                    const gameRef = this.db.collection(COLLECTIONS.GAMES).doc(game.id);
                    this.batch.set(gameRef, game, { merge: true });
                }

                await this.batch.commit();
                console.log(`Updated ${gamesData.length} games`);
                
                // Log update
                await this.logDataUpdate('games', gamesData.length);
                
                return gamesData;
            }
        } catch (error) {
            console.error('Error updating games:', error);
            throw error;
        }
    }

    // Fetch and store player statistics
    async updatePlayerStats(playerId) {
        try {
            console.log(`Fetching stats for player ${playerId}...`);
            const response = await axios.get(`${ESPN_BASE_URL}${ESPN_ENDPOINTS.PLAYER_STATS.replace('{playerId}', playerId)}`);
            const data = response.data;

            if (data.stats) {
                const statsData = {
                    playerId: playerId,
                    stats: data.stats,
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                };

                const statsRef = this.db.collection(COLLECTIONS.STATS).doc(playerId);
                await statsRef.set(statsData, { merge: true });
                
                console.log(`Updated stats for player ${playerId}`);
                return statsData;
            }
        } catch (error) {
            console.error(`Error updating stats for player ${playerId}:`, error);
            throw error;
        }
    }

    // Update all player stats (batch operation)
    async updateAllPlayerStats() {
        try {
            console.log('Fetching all player stats...');
            const playersSnapshot = await this.db.collection(COLLECTIONS.PLAYERS).get();
            const playerIds = playersSnapshot.docs.map(doc => doc.id);
            
            let updatedCount = 0;
            for (const playerId of playerIds) {
                try {
                    await this.updatePlayerStats(playerId);
                    updatedCount++;
                    
                    // Add delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (error) {
                    console.error(`Failed to update stats for player ${playerId}:`, error);
                }
            }
            
            console.log(`Updated stats for ${updatedCount} players`);
            await this.logDataUpdate('player_stats', updatedCount);
            
            return updatedCount;
        } catch (error) {
            console.error('Error updating all player stats:', error);
            throw error;
        }
    }

    // Log data updates
    async logDataUpdate(type, count) {
        try {
            const updateRef = this.db.collection(COLLECTIONS.UPDATES).doc();
            await updateRef.set({
                type: type,
                count: count,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                success: true
            });
        } catch (error) {
            console.error('Error logging data update:', error);
        }
    }

    // Get current NFL week
    async getCurrentWeek() {
        try {
            const response = await axios.get(`${ESPN_BASE_URL}${ESPN_ENDPOINTS.SCOREBOARD}`);
            const data = response.data;
            return data.week?.number || 1;
        } catch (error) {
            console.error('Error getting current week:', error);
            return 1;
        }
    }

    // Check if there are live games
    async hasLiveGames() {
        try {
            const response = await axios.get(`${ESPN_BASE_URL}${ESPN_ENDPOINTS.SCOREBOARD}`);
            const data = response.data;
            
            if (data.events) {
                const liveGames = data.events.filter(game => 
                    game.status?.type?.description === 'In Progress' ||
                    game.status?.type?.description === 'Halftime'
                );
                
                return liveGames.length > 0;
            }
        } catch (error) {
            console.error('Error checking for live games:', error);
        }
        
        return false;
    }
}

module.exports = { ESPNDataService, COLLECTIONS }; 