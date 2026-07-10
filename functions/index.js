const functions = require('firebase-functions');
const admin = require('firebase-admin');
const PythonBridge = require('./pythonBridge.js');
const {
    generatePickOrder,
    generateDraftOrder,
    getRoundFromPickIndex,
    isDraftComplete,
    resolvePickTimeLimit,
    shuffleArray,
    clampRounds,
    MAX_ROUNDS
} = require('./draftOrderUtils.js');

// Initialize Firebase Admin
admin.initializeApp();

const { syncSleeperPlayersScheduled } = require('./sleeperPlayerSync.js');
const { runSleeperPlayerSync } = require('./sleeperSyncRunner.js');
const { runProjectionScrape } = require('./projectionScrapeRunner.js');
const { finalizeAllLeagueStandings } = require('./scoringEngine.js');
exports.syncSleeperPlayersScheduled = syncSleeperPlayersScheduled;

// CORS configuration
const cors = require('cors')({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    preflightContinue: false,
    optionsSuccessStatus: 200
});

// ESPN API base URL
const ESPN_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';

// Fantasy scoring rules (you can customize these)
const FANTASY_SCORING_RULES = {
    // Passing
    passTd: 4,
    passYard: 0.05,
    pass300YardBonus: 2,
    pass400YardBonus: 4,
    interception: -2,
    sack: -1,
    
    // Rushing/Receiving
    rushTd: 6,
    recTd: 6,
    rushRecYard: 0.2,
    rushRec100YardBonus: 2,
    rushRec200YardBonus: 4,
    reception: 1,
    
    // Kicking
    fg39Less: 3,
    fg40_49: 4,
    fg50Plus: 5,
    extraPoint: 1,
    
    // Defense
    tackle: 2,
    sack: 2,
    interceptionDef: 4,
    fumbleRecoveryDef: 4,
    forcedFumble: 3,
    passDefended: 0.5,
    defensiveStTd: 7,
    assistedTackle: 0.2,
    tackleForLoss: 1
};

// NFL Season and Game Day Logic
const NFL_SEASON = {
    startDate: new Date('2024-09-05'), // NFL season start
    endDate: new Date('2025-02-09'),   // Super Bowl date
    gameDays: ['Thursday', 'Sunday', 'Monday'], // Days games are played
    gameTimes: {
        start: '13:00', // 1 PM ET
        end: '23:00'    // 11 PM ET
    }
};

// Check if it's NFL season
function isNFLSeason() {
    const now = new Date();
    return now >= NFL_SEASON.startDate && now <= NFL_SEASON.endDate;
}

// Check if it's a game day
function isGameDay() {
    const now = new Date();
    const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
    return NFL_SEASON.gameDays.includes(dayOfWeek);
}

// Check if it's during game hours
function isGameTime() {
    const now = new Date();
    const currentTime = now.toLocaleTimeString('en-US', { 
        hour12: false, 
        timeZone: 'America/New_York' 
    });
    
    return currentTime >= NFL_SEASON.gameTimes.start && currentTime <= NFL_SEASON.gameTimes.end;
}

// Check if there are live games
async function hasLiveGames() {
    try {
        const response = await fetch(`${ESPN_BASE_URL}/scoreboard`);
        const data = await response.json();
        
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

// Calculate fantasy points based on stats and position
function calculateFantasyPoints(stats, position) {
    if (!stats || !stats.splits) return 0;

    let points = 0;
    const categories = stats.splits.categories || [];

    for (const category of categories) {
        const statsData = category.stats || [];
        
        switch (position) {
            case 'QB':
                points += calculateQBPoints(statsData);
                break;
            case 'RB':
            case 'WR':
            case 'TE':
                points += calculateSkillPlayerPoints(statsData);
                break;
            case 'K':
                points += calculateKickerPoints(statsData);
                break;
            case 'DL':
            case 'LB':
            case 'DB':
                points += calculateDefensivePoints(statsData);
                break;
        }
    }

    return Math.round(points * 100) / 100;
}

function calculateQBPoints(stats) {
    let points = 0;
    
    for (const stat of stats) {
        switch (stat.name) {
            case 'passingTouchdowns':
                points += stat.value * FANTASY_SCORING_RULES.passTd;
                break;
            case 'passingYards':
                points += stat.value * FANTASY_SCORING_RULES.passYard;
                if (stat.value >= 300) points += FANTASY_SCORING_RULES.pass300YardBonus;
                if (stat.value >= 400) points += FANTASY_SCORING_RULES.pass400YardBonus;
                break;
            case 'rushingTouchdowns':
                points += stat.value * FANTASY_SCORING_RULES.rushTd;
                break;
            case 'rushingYards':
                points += stat.value * FANTASY_SCORING_RULES.rushRecYard;
                if (stat.value >= 100) points += FANTASY_SCORING_RULES.rushRec100YardBonus;
                break;
            case 'interceptions':
                points += stat.value * FANTASY_SCORING_RULES.interception;
                break;
            case 'sacks':
                points += stat.value * FANTASY_SCORING_RULES.sack;
                break;
        }
    }
    
    return points;
}

function calculateSkillPlayerPoints(stats) {
    let points = 0;
    
    for (const stat of stats) {
        switch (stat.name) {
            case 'rushingTouchdowns':
                points += stat.value * FANTASY_SCORING_RULES.rushTd;
                break;
            case 'rushingYards':
                points += stat.value * FANTASY_SCORING_RULES.rushRecYard;
                if (stat.value >= 100) points += FANTASY_SCORING_RULES.rushRec100YardBonus;
                if (stat.value >= 200) points += FANTASY_SCORING_RULES.rushRec200YardBonus;
                break;
            case 'receivingTouchdowns':
                points += stat.value * FANTASY_SCORING_RULES.recTd;
                break;
            case 'receivingYards':
                points += stat.value * FANTASY_SCORING_RULES.rushRecYard;
                if (stat.value >= 100) points += FANTASY_SCORING_RULES.rushRec100YardBonus;
                if (stat.value >= 200) points += FANTASY_SCORING_RULES.rushRec200YardBonus;
                break;
            case 'receptions':
                points += stat.value * FANTASY_SCORING_RULES.reception;
                break;
        }
    }
    
    return points;
}

function calculateKickerPoints(stats) {
    let points = 0;
    
    for (const stat of stats) {
        switch (stat.name) {
            case 'fieldGoalsMade':
                // This would need to be broken down by distance in a real implementation
                points += stat.value * FANTASY_SCORING_RULES.fg39Less;
                break;
            case 'extraPointsMade':
                points += stat.value * FANTASY_SCORING_RULES.extraPoint;
                break;
        }
    }
    
    return points;
}

function calculateDefensivePoints(stats) {
    let points = 0;
    
    for (const stat of stats) {
        switch (stat.name) {
            case 'tackles':
                points += stat.value * FANTASY_SCORING_RULES.tackle;
                break;
            case 'sacks':
                points += stat.value * FANTASY_SCORING_RULES.sack;
                break;
            case 'interceptions':
                points += stat.value * FANTASY_SCORING_RULES.interceptionDef;
                break;
            case 'fumbleRecoveries':
                points += stat.value * FANTASY_SCORING_RULES.fumbleRecoveryDef;
                break;
            case 'forcedFumbles':
                points += stat.value * FANTASY_SCORING_RULES.forcedFumble;
                break;
            case 'passesDefended':
                points += stat.value * FANTASY_SCORING_RULES.passDefended;
                break;
        }
    }
    
    return points;
}

// Get player stats from ESPN API
async function getPlayerStats(playerName) {
    try {
        const response = await fetch(`${ESPN_BASE_URL}/athletes?search=${encodeURIComponent(playerName)}`);
        const data = await response.json();
        
        if (data.athletes && data.athletes.length > 0) {
            const player = data.athletes[0];
            const statsResponse = await fetch(`${ESPN_BASE_URL}/athletes/${player.id}/stats`);
            const statsData = await statsResponse.json();
            
            return {
                ...player,
                stats: statsData,
                lastUpdated: new Date().toISOString()
            };
        }
    } catch (error) {
        console.error(`Error getting stats for ${playerName}:`, error);
    }
    
    return null;
}

// Update team scores
async function updateTeamScores(leagueId, league) {
    try {
        console.log(`Updating scores for league: ${leagueId}`);
        
        // Get all teams in the league
        const teamsSnapshot = await admin.firestore()
            .collection(`artifacts/${league.appId}/public/data/teams`)
            .where('leagueId', '==', leagueId)
            .get();
        
        const teams = teamsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Get current week
        const currentWeek = getCurrentWeek();
        
        // Update each team's score
        for (const team of teams) {
            await updateTeamScore(leagueId, team, league.settings?.scoringRules, currentWeek);
        }
        
        // Update league standings
        await updateLeagueStandings(leagueId, teams, league);
        
        console.log(`Updated scores for ${teams.length} teams in league ${leagueId}`);
    } catch (error) {
        console.error(`Error updating scores for league ${leagueId}:`, error);
    }
}

// Update a single team's score
async function updateTeamScore(leagueId, team, scoringRules, week) {
    try {
        const teamScore = {
            totalPoints: 0,
            players: {},
            lastUpdated: new Date().toISOString(),
            week: week
        };

        // Calculate scores for each player in the lineup
        for (const [slot, playerId] of Object.entries(team.roster.lineup)) {
            if (playerId) {
                const player = await getPlayerDetails(playerId);
                if (player) {
                    const playerStats = await getPlayerStats(player.name);
                    if (playerStats) {
                        const playerScore = calculateFantasyPoints(playerStats.stats, player.position);
                        teamScore.players[slot] = {
                            playerId: playerId,
                            name: player.name,
                            position: player.position,
                            nflTeam: player.nflTeam,
                            points: playerScore,
                            stats: playerStats.stats
                        };
                        teamScore.totalPoints += playerScore;
                    }
                }
            }
        }

        // Update team score in database
        await admin.firestore()
            .doc(`artifacts/${leagueId}/public/data/teams/${team.id}`)
            .update({
                currentScore: teamScore,
                lastScoreUpdate: new Date().toISOString()
            });

        console.log(`Updated ${team.name}: ${teamScore.totalPoints} points`);
    } catch (error) {
        console.error(`Error updating score for team ${team.id}:`, error);
    }
}

// Get player details from your player database
async function getPlayerDetails(playerId) {
    // This would need to be implemented based on your player data structure
    // For now, we'll return a basic structure
    return {
        id: playerId,
        name: "Player Name", // This would come from your player database
        position: "QB",
        nflTeam: "KC"
    };
}

// Get current NFL week
function getCurrentWeek() {
    const now = new Date();
    const seasonStart = new Date('2024-09-05'); // NFL season start
    const week = Math.floor((now - seasonStart) / (7 * 24 * 60 * 60 * 1000)) + 1;
    return Math.max(1, Math.min(18, week));
}

// Update league standings
async function updateLeagueStandings(leagueId, teams, league) {
    try {
        // Sort teams by total points
        const sortedTeams = teams
            .filter(team => team.currentScore)
            .sort((a, b) => (b.currentScore.totalPoints || 0) - (a.currentScore.totalPoints || 0));

        // Update standings in database
        await admin.firestore()
            .doc(`leagues/${leagueId}`)
            .update({
                standings: sortedTeams.map((team, index) => ({
                    rank: index + 1,
                    teamId: team.id,
                    teamName: team.name,
                    totalPoints: team.currentScore?.totalPoints || 0,
                    wins: team.record?.wins || 0,
                    losses: team.record?.losses || 0
                })),
                lastStandingsUpdate: new Date().toISOString()
            });

        console.log(`Updated standings for league ${leagueId}`);
    } catch (error) {
        console.error(`Error updating standings for league ${leagueId}:`, error);
    }
}

// Smart Cloud Function: Only runs on game days during NFL season
exports.updateFantasyScores = functions.pubsub.schedule('every 5 minutes').onRun(async (context) => {
    console.log('Checking if fantasy score update should run...');
    
    // Check if it's NFL season
    if (!isNFLSeason()) {
        console.log('Not NFL season - skipping score update');
        return null;
    }
    
    // Check if it's a game day
    if (!isGameDay()) {
        console.log('Not a game day - skipping score update');
        return null;
    }
    
    // Check if it's during game hours
    if (!isGameTime()) {
        console.log('Not during game hours - skipping score update');
        return null;
    }
    
    // Check if there are live games
    const hasLive = await hasLiveGames();
    if (!hasLive) {
        console.log('No live games detected - skipping score update');
        return null;
    }
    
    console.log('All conditions met - starting fantasy score update...');
    
    try {
        // Get all active leagues
        const leaguesSnapshot = await admin.firestore()
            .collection('leagues')
            .where('status', '==', 'active')
            .get();
        
        const leagues = leaguesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        console.log(`Found ${leagues.length} active leagues`);
        
        // Update scores for each league
        for (const league of leagues) {
            await updateTeamScores(league.id, league);
        }
        
        console.log('Fantasy score update completed successfully');
        return null;
    } catch (error) {
        console.error('Error in fantasy score update:', error);
        throw error;
    }
});

// Cloud Function: Update player stats (runs less frequently)
exports.updatePlayerStats = functions.pubsub.schedule('every 1 hours').onRun(async (context) => {
    console.log('Starting player stats update...');
    
    // Only run during NFL season
    if (!isNFLSeason()) {
        console.log('Not NFL season - skipping player stats update');
        return null;
    }
    
    try {
        // This function would update player statistics
        // Implementation depends on your specific needs
        console.log('Player stats update completed');
        return null;
    } catch (error) {
        console.error('Error in player stats update:', error);
        throw error;
    }
});

// Cloud Function: Monitor injuries (runs daily)
exports.monitorInjuries = functions.pubsub.schedule('every 24 hours').onRun(async (context) => {
    console.log('Starting injury monitoring...');
    
    // Only run during NFL season
    if (!isNFLSeason()) {
        console.log('Not NFL season - skipping injury monitoring');
        return null;
    }
    
    try {
        // This function would check for injury updates
        // Implementation depends on your specific needs
        console.log('Injury monitoring completed');
        return null;
    } catch (error) {
        console.error('Error in injury monitoring:', error);
        throw error;
    }
});

// HTTP function to manually trigger score updates (always available)
exports.manualScoreUpdate = functions.https.onRequest(async (req, res) => {
    try {
        const { leagueId } = req.query;
        
        if (!leagueId) {
            return res.status(400).json({ error: 'League ID is required' });
        }
        
        const leagueDoc = await admin.firestore().doc(`leagues/${leagueId}`).get();
        if (!leagueDoc.exists) {
            return res.status(404).json({ error: 'League not found' });
        }
        
        const league = { id: leagueId, ...leagueDoc.data() };
        await updateTeamScores(leagueId, league);
        
        res.json({ 
            success: true, 
            message: 'Scores updated successfully',
            conditions: {
                isNFLSeason: isNFLSeason(),
                isGameDay: isGameDay(),
                isGameTime: isGameTime(),
                hasLiveGames: await hasLiveGames()
            }
        });
    } catch (error) {
        console.error('Error in manual score update:', error);
        res.status(500).json({ error: 'Failed to update scores' });
    }
});

// HTTP function to check current conditions
exports.checkConditions = functions.https.onRequest(async (req, res) => {
    try {
        const conditions = {
            isNFLSeason: isNFLSeason(),
            isGameDay: isGameDay(),
            isGameTime: isGameTime(),
            hasLiveGames: await hasLiveGames(),
            currentWeek: getCurrentWeek(),
            currentTime: new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York' }),
            currentDay: new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' })
        };
        
        res.json(conditions);
    } catch (error) {
        console.error('Error checking conditions:', error);
        res.status(500).json({ error: 'Failed to check conditions' });
    }
}); 

// =====================================================================================
// === AUCTION FUNCTIONS ==============================================================
// =====================================================================================

// Mock player data for salary calculations (you can replace this with your actual player data)
const MOCK_PLAYERS = {
    'p1': { salary: 50 },
    'p2': { salary: 55 },
    'p3': { salary: 52 },
    'p4': { salary: 48 },
    'p5': { salary: 30 },
    'p6': { salary: 28 },
    'p7': { salary: 25 },
    'p8': { salary: 15 },
    'p9': { salary: 49 },
    'p10': { salary: 45 },
    'p11': { salary: 51 },
    'p12': { salary: 35 },
    'p13': { salary: 32 },
    'p14': { salary: 29 },
    'p15': { salary: 26 },
    'p16': { salary: 12 },
    'p17': { salary: 40 },
    'p18': { salary: 48 },
    'p19': { salary: 47 },
    'p20': { salary: 42 },
    'p21': { salary: 33 },
    'p22': { salary: 47 },
    'p23': { salary: 38 },
    'p24': { salary: 44 },
    'p25': { salary: 40 },
    'p26': { salary: 35 },
    'p27': { salary: 22 },
    'p28': { salary: 27 },
    'p29': { salary: 14 },
    'p30': { salary: 39 },
    'p31': { salary: 46 },
    'p32': { salary: 45 },
    'p33': { salary: 33 },
    'p34': { salary: 34 },
    'p35': { salary: 28 },
    'p36': { salary: 45 },
    'p37': { salary: 42 },
    'p38': { salary: 43 },
    'p39': { salary: 30 },
    'p40': { salary: 38 },
    'p41': { salary: 31 },
    'p42': { salary: 40 },
    'p43': { salary: 36 },
    'p44': { salary: 49 },
    'p46': { salary: 48 },
    'p47': { salary: 41 },
    'p48': { salary: 50 },
    'p49': { salary: 48 }
};

// Calculate team salary from roster
function calculateTeamSalary(roster) {
    let totalSalary = 0;
    
    // Calculate salary from lineup players
    Object.values(roster.lineup || {}).forEach(playerId => {
        if (playerId && MOCK_PLAYERS[playerId]) {
            totalSalary += MOCK_PLAYERS[playerId].salary;
        }
    });
    
    // Calculate salary from bench players
    (roster.bench || []).forEach(playerId => {
        if (MOCK_PLAYERS[playerId]) {
            totalSalary += MOCK_PLAYERS[playerId].salary;
        }
    });
    
    // Calculate salary from IR players
    (roster.ir || []).forEach(playerId => {
        if (MOCK_PLAYERS[playerId]) {
            totalSalary += MOCK_PLAYERS[playerId].salary;
        }
    });
    
    return totalSalary;
}

// Award player to winning team
async function awardPlayerToTeam(leagueId, auctionState) {
    const batch = admin.firestore().batch();
    
    // Add player to winning team's bench
    const teamRef = admin.firestore().doc(`artifacts/default-fantasy-football-app/public/data/teams/${auctionState.currentBidder}`);
    const teamDoc = await teamRef.get();
    
    if (teamDoc.exists) {
        const teamData = teamDoc.data();
        const updatedRoster = { ...teamData.roster };
        updatedRoster.bench.push(auctionState.currentPlayer.id);
        
        batch.update(teamRef, { roster: updatedRoster });
    }
    
    // Update league's rostered players
    const leagueRef = admin.firestore().doc(`leagues/${leagueId}`);
    batch.update(leagueRef, {
        allRosteredPlayerIds: admin.firestore.FieldValue.arrayUnion(auctionState.currentPlayer.id)
    });
    
    // Reset auction state
    batch.set(admin.firestore().doc(`leagues/${leagueId}/auctionState`), {
        currentPlayer: null,
        currentBid: 0,
        currentBidder: null,
        timeLeft: 0,
        isActive: false,
        nominatedPlayers: auctionState.nominatedPlayers
    });
    
    await batch.commit();
    console.log(`Player ${auctionState.currentPlayer.name} awarded to team ${auctionState.currentBidder} for $${auctionState.currentBid}`);
}

// Auction timer management
exports.manageAuctionTimer = functions.https.onRequest(async (req, res) => {
    try {
        const { leagueId, action } = req.body;
        
        if (!leagueId || !action) {
            return res.status(400).json({ error: 'League ID and action required' });
        }
        
        const auctionStateRef = admin.firestore().doc(`leagues/${leagueId}/auctionState`);
        
        switch (action) {
            case 'start_timer':
                await auctionStateRef.update({
                    timeLeft: 30,
                    isActive: true,
                    lastUpdate: admin.firestore.FieldValue.serverTimestamp()
                });
                console.log(`Started auction timer for league ${leagueId}`);
                break;
                
            case 'update_timer':
                const doc = await auctionStateRef.get();
                if (doc.exists) {
                    const data = doc.data();
                    if (data.timeLeft > 0) {
                        await auctionStateRef.update({
                            timeLeft: data.timeLeft - 1,
                            lastUpdate: admin.firestore.FieldValue.serverTimestamp()
                        });
                    }
                }
                break;
                
            case 'award_player':
                const auctionDoc = await auctionStateRef.get();
                if (auctionDoc.exists) {
                    const auctionData = auctionDoc.data();
                    if (auctionData.currentPlayer && auctionData.currentBidder) {
                        await awardPlayerToTeam(leagueId, auctionData);
                    }
                }
                break;
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Auction timer error:', error);
        res.status(500).json({ error: 'Timer management failed' });
    }
});

// Clean up expired auctions (runs every minute during auction hours)
exports.cleanupExpiredAuctions = functions.pubsub.schedule('every 1 minutes').onRun(async (context) => {
    try {
        const now = admin.firestore.Timestamp.now();
        const leaguesRef = admin.firestore().collection('leagues');
        
        const leaguesSnapshot = await leaguesRef
            .where('auction.status', '==', 'live')
            .get();
            
        console.log(`Checking ${leaguesSnapshot.docs.length} live auctions for cleanup`);
        
        for (const leagueDoc of leaguesSnapshot.docs) {
            const auctionStateRef = admin.firestore().doc(`leagues/${leagueDoc.id}/auctionState`);
            const auctionState = await auctionStateRef.get();
            
            if (auctionState.exists) {
                const data = auctionState.data();
                
                // Award player if timer expired
                if (data.isActive && data.timeLeft <= 0 && data.currentPlayer) {
                    console.log(`Awarding player in league ${leagueDoc.id} - timer expired`);
                    await awardPlayerToTeam(leagueDoc.id, data);
                }
            }
        }
        
        return null;
    } catch (error) {
        console.error('Auction cleanup error:', error);
        throw error;
    }
});

// Validate auction actions
exports.validateAuctionAction = functions.https.onRequest(async (req, res) => {
    try {
        const { leagueId, teamId, action, bidAmount } = req.body;
        
        // Check if auction is live
        const leagueDoc = await admin.firestore().doc(`leagues/${leagueId}`).get();
        if (!leagueDoc.exists || leagueDoc.data().auction?.status !== 'live') {
            return res.status(400).json({ error: 'Auction is not live' });
        }
        
        // Check salary cap for bids
        if (action === 'bid' && bidAmount) {
            const teamDoc = await admin.firestore().doc(`artifacts/default-fantasy-football-app/public/data/teams/${teamId}`).get();
            if (teamDoc.exists) {
                const teamData = teamDoc.data();
                const currentSalary = calculateTeamSalary(teamData.roster);
                const newSalary = currentSalary + bidAmount;
                const salaryCap = leagueDoc.data().settings.teamSalary;
                
                if (newSalary > salaryCap) {
                    return res.status(400).json({ 
                        error: 'Bid would exceed salary cap',
                        details: {
                            currentSalary,
                            bidAmount,
                            newSalary,
                            salaryCap,
                            remaining: salaryCap - currentSalary
                        }
                    });
                }
            }
        }
        
        res.json({ valid: true });
    } catch (error) {
        console.error('Auction validation error:', error);
        res.status(500).json({ error: 'Validation failed' });
    }
});

// Get auction state for a league
exports.getAuctionState = functions.https.onRequest(async (req, res) => {
    try {
        const { leagueId } = req.query;
        
        if (!leagueId) {
            return res.status(400).json({ error: 'League ID is required' });
        }
        
        const auctionStateRef = admin.firestore().doc(`leagues/${leagueId}/auctionState`);
        const auctionState = await auctionStateRef.get();
        
        if (auctionState.exists) {
            res.json(auctionState.data());
        } else {
            res.json({
                currentPlayer: null,
                currentBid: 0,
                currentBidder: null,
                timeLeft: 0,
                isActive: false,
                nominatedPlayers: []
            });
        }
    } catch (error) {
        console.error('Get auction state error:', error);
        res.status(500).json({ error: 'Failed to get auction state' });
    }
});

// Start auction for a league
exports.startAuction = functions.https.onRequest(async (req, res) => {
    try {
        const { leagueId } = req.body;
        
        if (!leagueId) {
            return res.status(400).json({ error: 'League ID is required' });
        }
        
        const leagueRef = admin.firestore().doc(`leagues/${leagueId}`);
        const auctionStateRef = admin.firestore().doc(`leagues/${leagueId}/auctionState`);
        
        // Update league auction status
        await leagueRef.update({ 
            'auction.status': 'live',
            'auction.currentNominationIndex': 0
        });
        
        // Initialize auction state
        await auctionStateRef.set({
            currentPlayer: null,
            currentBid: 0,
            currentBidder: null,
            timeLeft: 0,
            isActive: false,
            nominatedPlayers: [],
            availablePlayers: Object.keys(MOCK_PLAYERS)
        });
        
        console.log(`Auction started for league ${leagueId}`);
        res.json({ success: true, message: 'Auction started successfully' });
    } catch (error) {
        console.error('Start auction error:', error);
        res.status(500).json({ error: 'Failed to start auction' });
    }
});

// Complete auction for a league
exports.completeAuction = functions.https.onRequest(async (req, res) => {
    try {
        const { leagueId } = req.body;
        
        if (!leagueId) {
            return res.status(400).json({ error: 'League ID is required' });
        }
        
        const leagueRef = admin.firestore().doc(`leagues/${leagueId}`);
        const auctionStateRef = admin.firestore().doc(`leagues/${leagueId}/auctionState`);
        
        // Award current player if there's an active auction
        const auctionState = await auctionStateRef.get();
        if (auctionState.exists) {
            const data = auctionState.data();
            if (data.isActive && data.currentPlayer && data.currentBidder) {
                await awardPlayerToTeam(leagueId, data);
            }
        }
        
        // Update league auction status
        await leagueRef.update({ 'auction.status': 'complete' });
        
        // Clear auction state
        await auctionStateRef.delete();
        
        console.log(`Auction completed for league ${leagueId}`);
        res.json({ success: true, message: 'Auction completed successfully' });
    } catch (error) {
        console.error('Complete auction error:', error);
        res.status(500).json({ error: 'Failed to complete auction' });
    }
}); 

// =====================================================================================
// === DRAFT FUNCTIONS ===============================================================
// =====================================================================================

// Mock player data for draft (same as auction)
const DRAFT_PLAYERS = {
    'p1': { name: 'Patrick Mahomes', position: 'QB', nflTeam: 'KC', salary: 50 },
    'p2': { name: 'Christian McCaffrey', position: 'RB', nflTeam: 'SF', salary: 55 },
    'p3': { name: 'Justin Jefferson', position: 'WR', nflTeam: 'MIN', salary: 52 },
    'p4': { name: 'Travis Kelce', position: 'TE', nflTeam: 'KC', salary: 48 },
    'p5': { name: 'Myles Garrett', position: 'DL', nflTeam: 'CLE', salary: 30 },
    'p6': { name: 'Fred Warner', position: 'LB', nflTeam: 'SF', salary: 28 },
    'p7': { name: 'Derwin James', position: 'DB', nflTeam: 'LAC', salary: 25 },
    'p8': { name: 'Justin Tucker', position: 'K', nflTeam: 'BAL', salary: 15 },
    'p9': { name: 'Josh Allen', position: 'QB', nflTeam: 'BUF', salary: 49 },
    'p10': { name: 'Bijan Robinson', position: 'RB', nflTeam: 'ATL', salary: 45 },
    'p11': { name: 'Ja\'Marr Chase', position: 'WR', nflTeam: 'CIN', salary: 51 },
    'p12': { name: 'T.J. Hockenson', position: 'TE', nflTeam: 'MIN', salary: 35 },
    'p13': { name: 'Nick Bosa', position: 'DL', nflTeam: 'SF', salary: 32 },
    'p14': { name: 'Roquan Smith', position: 'LB', nflTeam: 'BAL', salary: 29 },
    'p15': { name: 'Patrick Surtain II', position: 'DB', nflTeam: 'DEN', salary: 26 },
    'p16': { name: 'Tyler Bass', position: 'K', nflTeam: 'BUF', salary: 12 },
    'p17': { name: 'Saquon Barkley', position: 'RB', nflTeam: 'PHI', salary: 40 },
    'p18': { name: 'CeeDee Lamb', position: 'WR', nflTeam: 'DAL', salary: 48 },
    'p19': { name: 'Amon-Ra St. Brown', position: 'WR', nflTeam: 'DET', salary: 47 },
    'p20': { name: 'Mark Andrews', position: 'TE', nflTeam: 'BAL', salary: 42 },
    'p21': { name: 'Micah Parsons', position: 'LB', nflTeam: 'DAL', salary: 33 },
    'p22': { name: 'Jalen Hurts', position: 'QB', nflTeam: 'PHI', salary: 47 },
    'p23': { name: 'Austin Ekeler', position: 'RB', nflTeam: 'WAS', salary: 38 },
    'p24': { name: 'Cooper Kupp', position: 'WR', nflTeam: 'LAR', salary: 44 },
    'p25': { name: 'George Kittle', position: 'TE', nflTeam: 'SF', salary: 40 },
    'p26': { name: 'Aaron Donald', position: 'DL', nflTeam: 'LAR', salary: 35 },
    'p27': { name: 'Bobby Wagner', position: 'LB', nflTeam: 'WAS', salary: 22 },
    'p28': { name: 'Minkah Fitzpatrick', position: 'DB', nflTeam: 'PIT', salary: 27 },
    'p29': { name: 'Daniel Carlson', position: 'K', nflTeam: 'LV', salary: 14 },
    'p30': { name: 'Derrick Henry', position: 'RB', nflTeam: 'BAL', salary: 39 },
    'p31': { name: 'Stefon Diggs', position: 'WR', nflTeam: 'HOU', salary: 46 },
    'p32': { name: 'Davante Adams', position: 'WR', nflTeam: 'LV', salary: 45 },
    'p33': { name: 'Darren Waller', position: 'TE', nflTeam: 'NYG', salary: 33 },
    'p34': { name: 'T.J. Watt', position: 'LB', nflTeam: 'PIT', salary: 34 },
    'p35': { name: 'Sauce Gardner', position: 'DB', nflTeam: 'NYJ', salary: 28 },
    'p36': { name: 'Dak Prescott', position: 'QB', nflTeam: 'DAL', salary: 45 },
    'p37': { name: 'Jonathan Taylor', position: 'RB', nflTeam: 'IND', salary: 42 },
    'p38': { name: 'Garrett Wilson', position: 'WR', nflTeam: 'NYJ', salary: 43 },
    'p39': { name: 'Puka Nacua', position: 'WR', nflTeam: 'LAR', salary: 30 },
    'p40': { name: 'Sam LaPorta', position: 'TE', nflTeam: 'DET', salary: 38 },
    'p41': { name: 'Maxx Crosby', position: 'DL', nflTeam: 'LV', salary: 31 },
    'p42': { name: 'C.J. Stroud', position: 'QB', nflTeam: 'HOU', salary: 40 },
    'p43': { name: 'Kyren Williams', position: 'RB', nflTeam: 'LAR', salary: 36 },
    'p44': { name: 'A.J. Brown', position: 'WR', nflTeam: 'PHI', salary: 49 },
    'p46': { name: 'Lamar Jackson', position: 'QB', nflTeam: 'BAL', salary: 48 },
    'p47': { name: 'Breece Hall', position: 'RB', nflTeam: 'NYJ', salary: 41 },
    'p48': { name: 'Tyreek Hill', position: 'WR', nflTeam: 'MIA', salary: 50 },
    'p49': { name: 'Joe Burrow', position: 'QB', nflTeam: 'CIN', salary: 48 }
};

function getDraftSettings(league) {
    const settings = league.draft?.settings || {};
    return {
        draftFormat: settings.draftFormat || league.settings?.draftType || 'standard',
        rounds: clampRounds(settings.rounds ?? MAX_ROUNDS),
        pickTimeLimit: resolvePickTimeLimit(settings),
        orderType: settings.orderType || 'random'
    };
}

function getNumTeams(league, pickOrder) {
    const roundOneOrder = league.draft?.roundOneOrder || league.draft?.customOrder;
    if (roundOneOrder?.length) return roundOneOrder.length;
    if (league.teams?.length) return league.teams.length;
    if (pickOrder?.length) return Math.max(1, Math.floor(pickOrder.length / getDraftSettings(league).rounds));
    return 1;
}

function getInitialPickTime(pickTimeLimit) {
    return pickTimeLimit === null ? null : pickTimeLimit;
}

// Get all players (internal function for other functions to use)
async function getAllPlayersInternal() {
    try {
        const response = await fetch('https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/athletes?limit=500&active=true');
        const data = await response.json();
        
        if (data.athletes) {
            return data.athletes.map(athlete => ({
                id: athlete.id,
                name: athlete.fullName,
                position: athlete.position?.abbreviation || 'N/A',
                nflTeam: athlete.team?.abbreviation || 'FA',
                rank: Math.floor(Math.random() * 500) + 1 // Mock rank for now
            }));
        }
        
        return [];
    } catch (error) {
        console.error('Error fetching players internally:', error);
        return [];
    }
}

// Start draft for a league
exports.startDraft = functions.https.onRequest(async (req, res) => {
    // Handle CORS preflight
    handleCORS(req, res, async () => {
        return cors(req, res, async () => {
            try {
                const { leagueId } = req.body;
                
                if (!leagueId) {
                    return res.status(400).json({ error: 'League ID is required' });
                }
                
                const leagueRef = admin.firestore().doc(`leagues/${leagueId}`);
                const leagueDoc = await leagueRef.get();
                
                if (!leagueDoc.exists) {
                    return res.status(404).json({ error: 'League not found' });
                }
                
                const league = leagueDoc.data();
                const draftSettings = getDraftSettings(league);
                
                // Get teams from the correct path
                const teamsSnapshot = await admin.firestore()
                    .collection(`leagues/${leagueId}/teams`)
                    .get();
                
                const teams = teamsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                const roundOneOrder = league.draft?.roundOneOrder || league.draft?.customOrder;
                const existingPickOrder = league.draft?.draftOrder || [];

                let pickOrder = existingPickOrder;
                let firstRoundOrder = roundOneOrder;

                if (!pickOrder.length || pickOrder.length < teams.length) {
                    const generated = generateDraftOrder(
                        teams,
                        draftSettings.draftFormat,
                        roundOneOrder,
                        draftSettings.rounds
                    );
                    firstRoundOrder = generated.roundOneOrder;
                    pickOrder = generated.pickOrder;
                }

                const pickTimeLimit = draftSettings.pickTimeLimit;
                const initialTime = getInitialPickTime(pickTimeLimit);
                
                // Get available players from the getAllPlayers function
                const availablePlayers = await getAllPlayersInternal();
                
                // Initialize draft state
                const draftState = {
                    status: 'live',
                    currentPick: 0,
                    currentRound: 1,
                    draftOrder: pickOrder,
                    availablePlayers: availablePlayers,
                    draftedPlayers: [],
                    picks: [],
                    draftType: draftSettings.draftFormat,
                    startedAt: admin.firestore.FieldValue.serverTimestamp()
                };
                
                // Update league draft status with timer
                await leagueRef.update({
                    'draft.status': 'live',
                    'draft.currentPick': 0,
                    'draft.currentRound': 1,
                    'draft.draftOrder': pickOrder,
                    'draft.roundOneOrder': firstRoundOrder,
                    'draft.timeRemaining': initialTime,
                    'draft.availablePlayers': availablePlayers,
                    'draft.draftedPlayers': [],
                    'draft.settings': {
                        ...draftSettings,
                        pickTimeLimit
                    },
                    'draft.lastUpdate': admin.firestore.FieldValue.serverTimestamp()
                });
                
                console.log(`Draft started for league ${leagueId} with ${teams.length} teams - Updated`);
                res.json({ 
                    success: true, 
                    message: 'Draft started successfully',
                    draftState: draftState
                });
            } catch (error) {
                console.error('Start draft error:', error);
                res.status(500).json({ error: 'Failed to start draft' });
            }
        });
    });
});

// Make a draft pick
exports.makeDraftPick = functions.https.onRequest(async (req, res) => {
    return cors(req, res, async () => {
        try {
            const { leagueId, teamId, playerId } = req.body;
        
            if (!leagueId || !teamId || !playerId) {
                return res.status(400).json({ error: 'League ID, team ID, and player ID are required' });
            }
            
            const leagueRefForPick = admin.firestore().doc(`leagues/${leagueId}`);
            const leagueDocForPick = await leagueRefForPick.get();
            
            if (!leagueDocForPick.exists) {
                return res.status(404).json({ error: 'League not found' });
            }
            
            const leagueDataForPick = leagueDocForPick.data();
            const draftState = leagueDataForPick.draft || {};
            
            if (draftState.status !== 'live') {
                return res.status(400).json({ error: 'Draft is not live' });
            }
            
            // Check if it's the team's turn
            const currentPick = draftState.draftOrder[draftState.currentPick];
            if (currentPick !== teamId) {
                return res.status(400).json({ error: 'Not your turn to pick' });
            }
            
            // Check if player is available (availablePlayers now contains player objects)
            const playerExists = draftState.availablePlayers.some(p => p.id === playerId);
            if (!playerExists) {
                return res.status(400).json({ error: 'Player is not available' });
            }
            
            // Get team data
            const teamRef = admin.firestore().doc(`leagues/${leagueId}/teams/${teamId}`);
            const teamDoc = await teamRef.get();
            
            if (!teamDoc.exists) {
                return res.status(404).json({ error: 'Team not found' });
            }
            
            const teamData = teamDoc.data();
            
            // Get player data from available players
            const player = draftState.availablePlayers.find(p => p.id === playerId);
            
            if (!player) {
                return res.status(404).json({ error: 'Player not found or not available' });
            }
            
            // Add player to team's roster
            const updatedRoster = { ...teamData.roster };
            if (!updatedRoster.bench) updatedRoster.bench = [];
            updatedRoster.bench.push(playerId);
            
            // Update team roster
            await teamRef.update({ roster: updatedRoster });
            
            // Update draft state
            const pick = {
                round: draftState.currentRound,
                pick: draftState.currentPick + 1,
                teamId: teamId,
                teamName: teamData.teamName,
                playerId: playerId,
                player: player,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            };
            
            const newDraftState = {
                ...draftState,
                currentPick: draftState.currentPick + 1,
                availablePlayers: draftState.availablePlayers.filter(p => p.id !== playerId),
                picks: [...draftState.picks, pick]
            };
            
            // Update league document with drafted player
            const leagueRefForUpdate = admin.firestore().doc(`leagues/${leagueId}`);
            const leagueDocForUpdate = await leagueRefForUpdate.get();
            const leagueDataForUpdate = leagueDocForUpdate.data();
            
            // Initialize draftedPlayers array if it doesn't exist
            if (!leagueDataForUpdate.draft) leagueDataForUpdate.draft = {};
            if (!leagueDataForUpdate.draft.draftedPlayers) leagueDataForUpdate.draft.draftedPlayers = [];
            
            // Add player to drafted players array
            const draftedPlayerData = {
                ...player,
                teamId: teamId,
                teamName: teamData.teamName,
                pickNumber: draftState.currentPick + 1,
                round: draftState.currentRound,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            };
            
            leagueDataForUpdate.draft.draftedPlayers.push(draftedPlayerData);
            
            const draftSettings = getDraftSettings(leagueDataForUpdate);
            const numTeams = getNumTeams(leagueDataForUpdate, draftState.draftOrder);
            const newCurrentRound = getRoundFromPickIndex(newDraftState.currentPick, numTeams);
            const nextPickTime = getInitialPickTime(draftSettings.pickTimeLimit);
            const draftFinished = isDraftComplete(newDraftState.currentPick, draftState.draftOrder);
            
            // Update league document
            await leagueRefForUpdate.update({
                'draft.draftedPlayers': leagueDataForUpdate.draft.draftedPlayers,
                'draft.currentPick': newDraftState.currentPick,
                'draft.currentRound': newCurrentRound,
                'draft.availablePlayers': newDraftState.availablePlayers,
                'draft.timeRemaining': draftFinished ? 0 : nextPickTime,
                'draft.lastUpdate': admin.firestore.FieldValue.serverTimestamp()
            });
            
            // Check if draft is complete
            if (draftFinished) {
                // Update league draft status
                await admin.firestore().doc(`leagues/${leagueId}`).update({
                    'draft.status': 'complete',
                    allRosteredPlayerIds: admin.firestore.FieldValue.arrayUnion(...leagueDataForUpdate.draft.draftedPlayers.map(p => p.id))
                });
            }
            
            console.log(`Draft pick made: ${player.name} to ${teamData.teamName}`);
            res.json({ 
                success: true, 
                message: 'Pick made successfully',
                pick: pick,
                nextPick: newDraftState.draftOrder[newDraftState.currentPick]
            });
        } catch (error) {
            console.error('Make draft pick error:', error);
            res.status(500).json({ error: 'Failed to make draft pick' });
        }
    });
});

// Get draft state
exports.getDraftState = functions.https.onRequest(async (req, res) => {
    try {
        const { leagueId } = req.query;
        
        if (!leagueId) {
            return res.status(400).json({ error: 'League ID is required' });
        }
        
        const draftStateRef = admin.firestore().doc(`leagues/${leagueId}/draftState`);
        const draftState = await draftStateRef.get();
        
        if (draftState.exists) {
            res.json(draftState.data());
        } else {
            res.json({
                status: 'not_started',
                currentPick: 0,
                currentRound: 1,
                draftOrder: [],
                availablePlayers: Object.keys(DRAFT_PLAYERS),
                draftedPlayers: [],
                picks: [],
                draftType: 'standard'
            });
        }
    } catch (error) {
        console.error('Get draft state error:', error);
        res.status(500).json({ error: 'Failed to get draft state' });
    }
});

// Set draft date/time
exports.setDraftDateTime = functions.https.onRequest(async (req, res) => {
    try {
        const { leagueId, scheduledDateTime } = req.body;
        
        if (!leagueId || !scheduledDateTime) {
            return res.status(400).json({ error: 'League ID and scheduled date/time are required' });
        }
        
        await admin.firestore().doc(`leagues/${leagueId}`).update({
            'draft.scheduledDateTime': scheduledDateTime
        });
        
        console.log(`Draft date/time set for league ${leagueId}: ${scheduledDateTime}`);
        res.json({ success: true, message: 'Draft date/time set successfully' });
    } catch (error) {
        console.error('Set draft date/time error:', error);
        res.status(500).json({ error: 'Failed to set draft date/time' });
    }
});

// Set custom draft order (round one lineup)
exports.setCustomDraftOrder = functions.https.onRequest(async (req, res) => {
    return cors(req, res, async () => {
        try {
            const { leagueId, customOrder, roundOneOrder, draftOrder } = req.body;
            const order = roundOneOrder || customOrder || draftOrder;
            
            if (!leagueId || !order) {
                return res.status(400).json({ error: 'League ID and draft order are required' });
            }
            
            const leagueRef = admin.firestore().doc(`leagues/${leagueId}`);
            const leagueDoc = await leagueRef.get();
            if (!leagueDoc.exists) {
                return res.status(404).json({ error: 'League not found' });
            }

            const league = leagueDoc.data();
            const draftSettings = getDraftSettings(league);
            const pickOrder = generatePickOrder(order, draftSettings.draftFormat, draftSettings.rounds);
            
            await leagueRef.update({
                'draft.customOrder': order,
                'draft.roundOneOrder': order,
                'draft.draftOrder': pickOrder,
                'draft.status': 'order_set'
            });
            
            console.log(`Custom draft order set for league ${leagueId}`);
            res.json({
                success: true,
                message: 'Custom draft order set successfully',
                roundOneOrder: order,
                draftOrder: pickOrder
            });
        } catch (error) {
            console.error('Set custom draft order error:', error);
            res.status(500).json({ error: 'Failed to set custom draft order' });
        }
    });
});

// Configure draft settings (format, rounds, pick timer)
exports.configureDraft = functions.https.onRequest(async (req, res) => {
    return cors(req, res, async () => {
        try {
            const {
                leagueId,
                draftFormat,
                rounds,
                pickTimeLimit,
                orderType,
                roundOneOrder
            } = req.body;

            if (!leagueId) {
                return res.status(400).json({ error: 'League ID is required' });
            }

            const leagueRef = admin.firestore().doc(`leagues/${leagueId}`);
            const leagueDoc = await leagueRef.get();
            if (!leagueDoc.exists) {
                return res.status(404).json({ error: 'League not found' });
            }

            const league = leagueDoc.data();
            const existingSettings = getDraftSettings(league);
            const nextSettings = {
                draftFormat: draftFormat || existingSettings.draftFormat,
                rounds: rounds !== undefined ? clampRounds(rounds) : existingSettings.rounds,
                pickTimeLimit: pickTimeLimit !== undefined
                    ? (pickTimeLimit === 0 ? null : pickTimeLimit)
                    : existingSettings.pickTimeLimit,
                orderType: orderType || existingSettings.orderType
            };

            const firstRoundOrder = roundOneOrder
                || league.draft?.roundOneOrder
                || league.draft?.customOrder
                || [];

            const updateData = {
                'draft.settings': nextSettings,
                'settings.draftType': nextSettings.draftFormat
            };

            if (firstRoundOrder.length) {
                const pickOrder = generatePickOrder(
                    firstRoundOrder,
                    nextSettings.draftFormat,
                    nextSettings.rounds
                );
                updateData['draft.roundOneOrder'] = firstRoundOrder;
                updateData['draft.customOrder'] = firstRoundOrder;
                updateData['draft.draftOrder'] = pickOrder;
                updateData['draft.status'] = 'order_set';
            }

            await leagueRef.update(updateData);

            res.json({
                success: true,
                message: 'Draft settings saved successfully',
                settings: nextSettings,
                roundOneOrder: firstRoundOrder,
                draftOrder: updateData['draft.draftOrder'] || league.draft?.draftOrder || []
            });
        } catch (error) {
            console.error('Configure draft error:', error);
            res.status(500).json({ error: 'Failed to configure draft' });
        }
    });
});

// Randomize round-one draft order and build full pick order
exports.randomizeDraftOrder = functions.https.onRequest(async (req, res) => {
    return cors(req, res, async () => {
        try {
            const { leagueId, draftFormat, rounds } = req.body;

            if (!leagueId) {
                return res.status(400).json({ error: 'League ID is required' });
            }

            const leagueRef = admin.firestore().doc(`leagues/${leagueId}`);
            const leagueDoc = await leagueRef.get();
            if (!leagueDoc.exists) {
                return res.status(404).json({ error: 'League not found' });
            }

            const league = leagueDoc.data();
            const draftSettings = getDraftSettings(league);
            const nextFormat = draftFormat || draftSettings.draftFormat;
            const nextRounds = rounds !== undefined ? clampRounds(rounds) : draftSettings.rounds;

            const teamsSnapshot = await admin.firestore()
                .collection(`leagues/${leagueId}/teams`)
                .get();
            const teams = teamsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            if (!teams.length) {
                return res.status(400).json({ error: 'No teams found in league' });
            }

            const roundOneOrder = shuffleArray(teams.map(team => team.id));
            const pickOrder = generatePickOrder(roundOneOrder, nextFormat, nextRounds);

            await leagueRef.update({
                'draft.settings': {
                    ...draftSettings,
                    draftFormat: nextFormat,
                    rounds: nextRounds,
                    orderType: 'random'
                },
                'draft.roundOneOrder': roundOneOrder,
                'draft.customOrder': roundOneOrder,
                'draft.draftOrder': pickOrder,
                'draft.status': 'order_set',
                'settings.draftType': nextFormat
            });

            res.json({
                success: true,
                message: 'Draft order randomized successfully',
                roundOneOrder,
                draftOrder: pickOrder
            });
        } catch (error) {
            console.error('Randomize draft order error:', error);
            res.status(500).json({ error: 'Failed to randomize draft order' });
        }
    });
});

// Complete draft
exports.completeDraft = functions.https.onRequest(async (req, res) => {
    try {
        const { leagueId } = req.body;
        
        if (!leagueId) {
            return res.status(400).json({ error: 'League ID is required' });
        }
        
        const leagueRef = admin.firestore().doc(`leagues/${leagueId}`);
        const draftStateRef = admin.firestore().doc(`leagues/${leagueId}/draftState`);
        
        // Update league draft status
        await leagueRef.update({ 'draft.status': 'complete' });
        
        // Clear draft state
        await draftStateRef.delete();
        
        console.log(`Draft completed for league ${leagueId}`);
        res.json({ success: true, message: 'Draft completed successfully' });
    } catch (error) {
        console.error('Complete draft error:', error);
        res.status(500).json({ error: 'Failed to complete draft' });
    }
});

// Validate draft pick
exports.validateDraftPick = functions.https.onRequest(async (req, res) => {
    try {
        const { leagueId, teamId, playerId } = req.body;
        
        // Check if draft is live
        const leagueDoc = await admin.firestore().doc(`leagues/${leagueId}`).get();
        if (!leagueDoc.exists || leagueDoc.data().draft?.status !== 'live') {
            return res.status(400).json({ error: 'Draft is not live' });
        }
        
        // Check if it's the team's turn
        const draftStateDoc = await admin.firestore().doc(`leagues/${leagueId}/draftState`).get();
        if (draftStateDoc.exists) {
            const draftState = draftStateDoc.data();
            const currentPick = draftState.draftOrder[draftState.currentPick];
            
            if (currentPick !== teamId) {
                return res.status(400).json({ error: 'Not your turn to pick' });
            }
            
            if (!draftState.availablePlayers.includes(playerId)) {
                return res.status(400).json({ error: 'Player is not available' });
            }
        }
        
        res.json({ valid: true });
    } catch (error) {
        console.error('Validate draft pick error:', error);
        res.status(500).json({ error: 'Validation failed' });
    }
}); 

// =====================================================================================
// === WAIVER WIRE FUNCTIONS =========================================================
// =====================================================================================

// Process expired waiver claims (runs every 5 minutes)
exports.processExpiredWaivers = functions.pubsub.schedule('every 5 minutes').onRun(async (context) => {
    try {
        const now = admin.firestore.Timestamp.now();
        const leaguesRef = admin.firestore().collection('leagues');
        
        const leaguesSnapshot = await leaguesRef.get();
        
        for (const leagueDoc of leaguesSnapshot.docs) {
            const leagueId = leagueDoc.id;
            const waiversRef = admin.firestore().collection(`leagues/${leagueId}/waivers`);
            const waiversSnapshot = await waiversRef.get();
            
            for (const waiverDoc of waiversSnapshot.docs) {
                const waiverData = waiverDoc.data();
                
                // Check if waiver has expired
                if (waiverData.expiration && waiverData.expiration.toDate() < new Date()) {
                    console.log(`Processing expired waiver for player ${waiverData.playerId} in league ${leagueId}`);
                    
                    // Award player to highest bidder
                    if (waiverData.highestBidder && waiverData.highestBid > 0) {
                        await awardWaiverPlayer(leagueId, waiverData);
                    }
                    
                    // Delete the waiver claim
                    await waiverDoc.ref.delete();
                }
            }
        }
        
        return null;
    } catch (error) {
        console.error('Process expired waivers error:', error);
        throw error;
    }
});

// Award waiver player to winning team
async function awardWaiverPlayer(leagueId, waiverData) {
    const batch = admin.firestore().batch();
    
    // Add player to winning team's bench
    const teamRef = admin.firestore().doc(`artifacts/default-fantasy-football-app/public/data/teams/${waiverData.highestBidder}`);
    const teamDoc = await teamRef.get();
    
    if (teamDoc.exists) {
        const teamData = teamDoc.data();
        const updatedRoster = { ...teamData.roster };
        updatedRoster.bench.push(waiverData.playerId);
        
        batch.update(teamRef, { roster: updatedRoster });
    }
    
    // Update league's rostered players
    const leagueRef = admin.firestore().doc(`leagues/${leagueId}`);
    batch.update(leagueRef, {
        allRosteredPlayerIds: admin.firestore.FieldValue.arrayUnion(waiverData.playerId)
    });
    
    await batch.commit();
    console.log(`Waiver player ${waiverData.playerId} awarded to team ${waiverData.highestBidder} for $${waiverData.highestBid}`);
}

// Validate waiver bid
exports.validateWaiverBid = functions.https.onRequest(async (req, res) => {
    try {
        const { leagueId, teamId, bidAmount } = req.body;
        
        // Check if team has enough salary cap
        const teamDoc = await admin.firestore().doc(`artifacts/default-fantasy-football-app/public/data/teams/${teamId}`).get();
        if (teamDoc.exists) {
            const teamData = teamDoc.data();
            const currentSalary = calculateTeamSalary(teamData.roster);
            const leagueDoc = await admin.firestore().doc(`leagues/${leagueId}`).get();
            const salaryCap = leagueDoc.data().settings.teamSalary;
            
            if (currentSalary + bidAmount > salaryCap) {
                return res.status(400).json({ 
                    error: 'Bid would exceed salary cap',
                    details: {
                        currentSalary,
                        bidAmount,
                        newSalary: currentSalary + bidAmount,
                        salaryCap,
                        remaining: salaryCap - currentSalary
                    }
                });
            }
        }
        
        res.json({ valid: true });
    } catch (error) {
        console.error('Validate waiver bid error:', error);
        res.status(500).json({ error: 'Validation failed' });
    }
});

// =====================================================================================
// === TRADE SYSTEM FUNCTIONS =========================================================
// =====================================================================================

// Execute trade
exports.executeTrade = functions.https.onRequest(async (req, res) => {
    try {
        const { leagueId, tradeId } = req.body;
        
        if (!leagueId || !tradeId) {
            return res.status(400).json({ error: 'League ID and trade ID are required' });
        }
        
        const tradeRef = admin.firestore().doc(`leagues/${leagueId}/trades/${tradeId}`);
        const tradeDoc = await tradeRef.get();
        
        if (!tradeDoc.exists) {
            return res.status(404).json({ error: 'Trade not found' });
        }
        
        const trade = tradeDoc.data();
        
        // Validate that all teams have accepted
        const allAccepted = trade.teamIds.every(teamId => trade.acceptances[teamId]);
        if (!allAccepted) {
            return res.status(400).json({ error: 'Not all teams have accepted the trade' });
        }
        
        // Final salary cap validation
        for (const teamId of trade.teamIds) {
            const teamDoc = await admin.firestore().doc(`artifacts/default-fantasy-football-app/public/data/teams/${teamId}`).get();
            if (teamDoc.exists) {
                const teamData = teamDoc.data();
                const currentSalary = calculateTeamSalary(teamData.roster);
                
                const salaryOut = (trade.assets[teamId]?.players || []).reduce((sum, pId) => {
                    return sum + (MOCK_PLAYERS[pId]?.salary || 0);
                }, 0);
                
                const salaryIn = Object.entries(trade.assets)
                    .filter(([id, _]) => id !== teamId)
                    .flatMap(([_, assets]) => assets.players)
                    .reduce((sum, pId) => {
                        return sum + (MOCK_PLAYERS[pId]?.salary || 0);
                    }, 0);
                
                const newSalary = currentSalary - salaryOut + salaryIn;
                const salaryCap = trade.salaryCap || 1000;
                
                if (newSalary > salaryCap) {
                    return res.status(400).json({ 
                        error: `Trade would cause ${teamData.teamName} to exceed salary cap`,
                        details: {
                            currentSalary,
                            salaryOut,
                            salaryIn,
                            newSalary,
                            salaryCap
                        }
                    });
                }
            }
        }
        
        // Execute the trade
        const batch = admin.firestore().batch();
        
        for (const teamId of trade.teamIds) {
            const teamRef = admin.firestore().doc(`artifacts/default-fantasy-football-app/public/data/teams/${teamId}`);
            const teamDoc = await teamRef.get();
            
            if (teamDoc.exists) {
                const teamData = teamDoc.data();
                const updatedRoster = { ...teamData.roster };
                
                // Remove players being traded away
                const playersOut = trade.assets[teamId]?.players || [];
                Object.keys(updatedRoster.lineup).forEach(slot => {
                    if (playersOut.includes(updatedRoster.lineup[slot])) {
                        updatedRoster.lineup[slot] = null;
                    }
                });
                updatedRoster.bench = updatedRoster.bench.filter(pId => !playersOut.includes(pId));
                updatedRoster.ir = updatedRoster.ir.filter(pId => !playersOut.includes(pId));
                
                // Add players being received
                const playersIn = Object.entries(trade.assets)
                    .filter(([id, _]) => id !== teamId)
                    .flatMap(([_, assets]) => assets.players);
                
                updatedRoster.bench = [...updatedRoster.bench, ...playersIn];
                
                batch.update(teamRef, { roster: updatedRoster });
            }
        }
        
        // Mark trade as completed
        batch.update(tradeRef, { status: 'completed' });
        
        await batch.commit();
        
        console.log(`Trade ${tradeId} executed successfully in league ${leagueId}`);
        res.json({ success: true, message: 'Trade executed successfully' });
    } catch (error) {
        console.error('Execute trade error:', error);
        res.status(500).json({ error: 'Failed to execute trade' });
    }
});

// Validate trade
exports.validateTrade = functions.https.onRequest(async (req, res) => {
    try {
        const { leagueId, tradeAssets, teamIds } = req.body;
        
        // Check salary cap for all teams
        for (const teamId of teamIds) {
            const teamDoc = await admin.firestore().doc(`artifacts/default-fantasy-football-app/public/data/teams/${teamId}`).get();
            if (teamDoc.exists) {
                const teamData = teamDoc.data();
                const currentSalary = calculateTeamSalary(teamData.roster);
                
                const salaryOut = (tradeAssets[teamId]?.players || []).reduce((sum, pId) => {
                    return sum + (MOCK_PLAYERS[pId]?.salary || 0);
                }, 0);
                
                const salaryIn = Object.entries(tradeAssets)
                    .filter(([id, _]) => id !== teamId)
                    .flatMap(([_, assets]) => assets.players)
                    .reduce((sum, pId) => {
                        return sum + (MOCK_PLAYERS[pId]?.salary || 0);
                    }, 0);
                
                const newSalary = currentSalary - salaryOut + salaryIn;
                const leagueDoc = await admin.firestore().doc(`leagues/${leagueId}`).get();
                const salaryCap = leagueDoc.data().settings.teamSalary;
                
                if (newSalary > salaryCap) {
                    return res.status(400).json({ 
                        error: `Trade would cause team to exceed salary cap`,
                        details: {
                            teamId,
                            currentSalary,
                            salaryOut,
                            salaryIn,
                            newSalary,
                            salaryCap
                        }
                    });
                }
            }
        }
        
        res.json({ valid: true });
    } catch (error) {
        console.error('Validate trade error:', error);
        res.status(500).json({ error: 'Validation failed' });
    }
});

// =====================================================================================
// === LEAGUE MANAGEMENT FUNCTIONS ====================================================
// =====================================================================================

// Update league settings
exports.updateLeagueSettings = functions.https.onRequest(async (req, res) => {
    try {
        const { leagueId, settings } = req.body;
        
        if (!leagueId || !settings) {
            return res.status(400).json({ error: 'League ID and settings are required' });
        }
        
        await admin.firestore().doc(`leagues/${leagueId}`).update({
            settings: settings
        });
        
        console.log(`League settings updated for league ${leagueId}`);
        res.json({ success: true, message: 'League settings updated successfully' });
    } catch (error) {
        console.error('Update league settings error:', error);
        res.status(500).json({ error: 'Failed to update league settings' });
    }
});

// Get league statistics
exports.getLeagueStats = functions.https.onRequest(async (req, res) => {
    try {
        const { leagueId } = req.query;
        
        if (!leagueId) {
            return res.status(400).json({ error: 'League ID is required' });
        }
        
        const leagueDoc = await admin.firestore().doc(`leagues/${leagueId}`).get();
        if (!leagueDoc.exists) {
            return res.status(404).json({ error: 'League not found' });
        }
        
        const league = leagueDoc.data();
        
        // Get teams
        const teamsSnapshot = await admin.firestore()
            .collection(`artifacts/default-fantasy-football-app/public/data/teams`)
            .where('leagueId', '==', leagueId)
            .get();
        
        const teams = teamsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Calculate statistics
        const stats = {
            totalTeams: teams.length,
            totalPlayers: league.allRosteredPlayerIds?.length || 0,
            averageSalary: 0,
            totalSalary: 0,
            teamsOverCap: 0,
            teamsUnderCap: 0
        };
        
        let totalSalary = 0;
        const salaryCap = league.settings?.teamSalary || 1000;
        
        teams.forEach(team => {
            const teamSalary = calculateTeamSalary(team.roster);
            totalSalary += teamSalary;
            
            if (teamSalary > salaryCap) {
                stats.teamsOverCap++;
            } else {
                stats.teamsUnderCap++;
            }
        });
        
        stats.totalSalary = totalSalary;
        stats.averageSalary = teams.length > 0 ? totalSalary / teams.length : 0;
        
        res.json(stats);
    } catch (error) {
        console.error('Get league stats error:', error);
        res.status(500).json({ error: 'Failed to get league statistics' });
    }
});

// Process player transaction (add/drop)
exports.processPlayerTransaction = functions.https.onRequest(async (req, res) => {
    try {
        const { leagueId, teamId, action, playerId } = req.body;
        
        if (!leagueId || !teamId || !action || !playerId) {
            return res.status(400).json({ error: 'League ID, team ID, action, and player ID are required' });
        }
        
        const teamRef = admin.firestore().doc(`artifacts/default-fantasy-football-app/public/data/teams/${teamId}`);
        const leagueRef = admin.firestore().doc(`leagues/${leagueId}`);
        
        if (action === 'add') {
            // Add player to team's bench
            const teamDoc = await teamRef.get();
            if (teamDoc.exists) {
                const teamData = teamDoc.data();
                const updatedRoster = { ...teamData.roster };
                updatedRoster.bench.push(playerId);
                
                await teamRef.update({ roster: updatedRoster });
                await leagueRef.update({
                    allRosteredPlayerIds: admin.firestore.FieldValue.arrayUnion(playerId)
                });
            }
        } else if (action === 'drop') {
            // Remove player from team
            const teamDoc = await teamRef.get();
            if (teamDoc.exists) {
                const teamData = teamDoc.data();
                const updatedRoster = { ...teamData.roster };
                
                // Remove from lineup
                Object.keys(updatedRoster.lineup).forEach(slot => {
                    if (updatedRoster.lineup[slot] === playerId) {
                        updatedRoster.lineup[slot] = null;
                    }
                });
                
                // Remove from bench and IR
                updatedRoster.bench = updatedRoster.bench.filter(pId => pId !== playerId);
                updatedRoster.ir = updatedRoster.ir.filter(pId => pId !== playerId);
                
                await teamRef.update({ roster: updatedRoster });
                await leagueRef.update({
                    allRosteredPlayerIds: admin.firestore.FieldValue.arrayRemove(playerId)
                });
            }
        }
        
        console.log(`Player transaction processed: ${action} ${playerId} for team ${teamId}`);
        res.json({ success: true, message: `Player ${action}ed successfully` });
    } catch (error) {
        console.error('Process player transaction error:', error);
        res.status(500).json({ error: 'Failed to process player transaction' });
    }
});

// Get available players for a league
exports.getAvailablePlayers = functions.https.onRequest(async (req, res) => {
    try {
        const { leagueId } = req.query;
        
        if (!leagueId) {
            return res.status(400).json({ error: 'League ID is required' });
        }
        
        const leagueDoc = await admin.firestore().doc(`leagues/${leagueId}`).get();
        if (!leagueDoc.exists) {
            return res.status(404).json({ error: 'League not found' });
        }
        
        const league = leagueDoc.data();
        const rosteredPlayers = league.allRosteredPlayerIds || [];
        
        // Filter out rostered players
        const availablePlayers = Object.entries(DRAFT_PLAYERS)
            .filter(([playerId, _]) => !rosteredPlayers.includes(playerId))
            .map(([playerId, player]) => ({
                id: playerId,
                ...player
            }));
        
        res.json(availablePlayers);
    } catch (error) {
        console.error('Get available players error:', error);
        res.status(500).json({ error: 'Failed to get available players' });
    }
});

// Import ESPN data service functions
const { updateTeamsDaily, updatePlayersDaily, updateGamesHourly, updatePlayerStatsGameDay, updateAllDataWeekly, manualUpdate, getUpdateStatus } = require('./scheduledUpdates');

// Import player search service
const { PlayerSearchService } = require('./playerSearchService');

// Export ESPN data service functions
exports.updateTeamsDaily = updateTeamsDaily;
exports.updatePlayersDaily = updatePlayersDaily;
exports.updateGamesHourly = updateGamesHourly;
exports.updatePlayerStatsGameDay = updatePlayerStatsGameDay;
exports.updateAllDataWeekly = updateAllDataWeekly;
exports.manualUpdate = manualUpdate;
exports.getUpdateStatus = getUpdateStatus;

// Player search functions
const playerSearchService = new PlayerSearchService();

exports.searchPlayers = functions.https.onRequest(async (req, res) => {
    try {
        const { query, limit = 50 } = req.query;
        
        if (!query) {
            return res.status(400).json({ error: 'Query parameter is required' });
        }

        const players = await playerSearchService.searchPlayers(query, parseInt(limit));
        res.json({ players, count: players.length });
    } catch (error) {
        console.error('Error in searchPlayers function:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

exports.getAllPlayers = functions.https.onRequest(async (req, res) => {
    handleCORS(req, res, async () => {
        return cors(req, res, async () => {
            try {
                const { limit = 100 } = req.query;
                const players = await playerSearchService.getAllPlayers(parseInt(limit));
                res.json({ players, count: players.length });
            } catch (error) {
                console.error('Error in getAllPlayers function:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    });
}); 

// =====================================================================================
// === ENHANCED DRAFT TIMER FUNCTIONS WITH PYTHON INTEGRATION ========================
// =====================================================================================

// Initialize Python bridge for advanced draft analysis
const pythonBridge = new PythonBridge();

// Check if draft should auto-start based on scheduled time
exports.checkDraftAutoStart = functions.pubsub.schedule('every 1 minutes').onRun(async (context) => {
    try {
        const now = new Date();
        const leaguesRef = admin.firestore().collection('leagues');
        
        const leaguesSnapshot = await leaguesRef
            .where('draft.status', '==', 'scheduled')
            .get();
            
        console.log(`Checking ${leaguesSnapshot.docs.length} scheduled drafts for auto-start`);
        
        for (const leagueDoc of leaguesSnapshot.docs) {
            const league = leagueDoc.data();
            const scheduledTime = league.draft?.scheduledDateTime;
            
            if (scheduledTime) {
                const scheduledDate = new Date(scheduledTime);
                const timeDiff = scheduledDate.getTime() - now.getTime();
                
                // Auto-start if scheduled time has passed (within 1 minute tolerance)
                if (timeDiff <= 60000 && timeDiff > -60000) {
                    console.log(`Auto-starting draft for league ${leagueDoc.id}`);
                    await autoStartDraft(leagueDoc.id, league);
                }
            }
        }
        
        return null;
    } catch (error) {
        console.error('Draft auto-start error:', error);
        throw error;
    }
});

// Auto-start draft function
async function autoStartDraft(leagueId, league) {
    try {
        const draftSettings = getDraftSettings(league);
        
        // Get teams
        const teamsSnapshot = await admin.firestore()
            .collection(`leagues/${leagueId}/teams`)
            .get();
        
        const teams = teamsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const roundOneOrder = league.draft?.roundOneOrder || league.draft?.customOrder;
        const existingPickOrder = league.draft?.draftOrder || [];

        let pickOrder = existingPickOrder;
        let firstRoundOrder = roundOneOrder;

        if (!pickOrder.length || pickOrder.length < teams.length) {
            const generated = generateDraftOrder(
                teams,
                draftSettings.draftFormat,
                roundOneOrder,
                draftSettings.rounds
            );
            firstRoundOrder = generated.roundOneOrder;
            pickOrder = generated.pickOrder;
        }

        const initialTime = getInitialPickTime(draftSettings.pickTimeLimit);
        
        // Initialize draft state
        const draftState = {
            status: 'live',
            currentPick: 0,
            currentRound: 1,
            draftOrder: pickOrder,
            availablePlayers: Object.keys(DRAFT_PLAYERS),
            draftedPlayers: [],
            picks: [],
            draftType: draftSettings.draftFormat,
            startedAt: admin.firestore.FieldValue.serverTimestamp(),
            timerActive: initialTime !== null,
            timeRemaining: initialTime,
            currentTeamId: pickOrder[0],
            isFirstPick: true
        };
        
        // Update league draft status
        await admin.firestore().doc(`leagues/${leagueId}`).update({
            'draft.status': 'live',
            'draft.currentPick': 0,
            'draft.currentRound': 1,
            'draft.draftOrder': pickOrder,
            'draft.roundOneOrder': firstRoundOrder,
            'draft.timeRemaining': initialTime,
            'draft.startedAt': admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Set draft state
        await admin.firestore().doc(`leagues/${leagueId}/draftState`).set(draftState);
        
        console.log(`Draft auto-started for league ${leagueId} with ${teams.length} teams`);
    } catch (error) {
        console.error(`Error auto-starting draft for league ${leagueId}:`, error);
    }
}

// Manage draft timer
exports.manageDraftTimer = functions.https.onRequest(async (req, res) => {
    try {
        const { leagueId, action, teamId } = req.body;
        
        if (!leagueId || !action) {
            return res.status(400).json({ error: 'League ID and action required' });
        }
        
        const draftStateRef = admin.firestore().doc(`leagues/${leagueId}/draftState`);
        
        switch (action) {
            case 'start_timer':
                const doc = await draftStateRef.get();
                if (doc.exists) {
                    const data = doc.data();
                    const isFirstPick = data.currentPick === 0;
                    const timeLimit = isFirstPick ? 30 : 20; // 30s for first pick, 20s for others
                    
                    await draftStateRef.update({
                        timerActive: true,
                        timeRemaining: timeLimit,
                        isFirstPick: isFirstPick,
                        lastUpdate: admin.firestore.FieldValue.serverTimestamp()
                    });
                    console.log(`Started draft timer for league ${leagueId} with ${timeLimit}s`);
                }
                break;
                
            case 'update_timer':
                const timerDoc = await draftStateRef.get();
                if (timerDoc.exists) {
                    const timerData = timerDoc.data();
                    if (timerData.timerActive && timerData.timeRemaining > 0) {
                        await draftStateRef.update({
                            timeRemaining: timerData.timeRemaining - 1,
                            lastUpdate: admin.firestore.FieldValue.serverTimestamp()
                        });
                        
                        // Auto-pick if time runs out
                        if (timerData.timeRemaining <= 1) {
                            await handleTimeUp(leagueId, timerData);
                        }
                    }
                }
                break;
                
            case 'reset_timer':
                const resetDoc = await draftStateRef.get();
                if (resetDoc.exists) {
                    const resetData = resetDoc.data();
                    const isFirstPick = resetData.currentPick === 0;
                    const timeLimit = isFirstPick ? 30 : 20;
                    
                    await draftStateRef.update({
                        timeRemaining: timeLimit,
                        isFirstPick: isFirstPick,
                        lastUpdate: admin.firestore.FieldValue.serverTimestamp()
                    });
                }
                break;
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Draft timer error:', error);
        res.status(500).json({ error: 'Timer management failed' });
    }
});

// Handle time up for draft pick
async function handleTimeUp(leagueId, draftData) {
    try {
        const currentTeamId = draftData.draftOrder[draftData.currentPick];
        const availablePlayers = draftData.availablePlayers || [];
        
        // Auto-pick best available player
        if (availablePlayers.length > 0) {
            const bestPlayer = availablePlayers[0]; // Pick the first available player
            
            // Make the auto-pick
            await makeDraftPickInternal(leagueId, currentTeamId, bestPlayer.id, bestPlayer);
            console.log(`Auto-picked ${bestPlayer.name} for team ${currentTeamId} in league ${leagueId}`);
        }
    } catch (error) {
        console.error(`Error handling time up for league ${leagueId}:`, error);
    }
}

// Internal function to make draft pick (used by auto-pick)
async function makeDraftPickInternal(leagueId, teamId, playerId, player) {
    try {
        const leagueRef = admin.firestore().doc(`leagues/${leagueId}`);
        const leagueDoc = await leagueRef.get();
        
        if (!leagueDoc.exists) {
            throw new Error('League not found');
        }
        
        const leagueData = leagueDoc.data();
        const draftData = leagueData.draft || {};
        
        // Get team data
        const teamRef = admin.firestore().doc(`leagues/${leagueId}/teams/${teamId}`);
        const teamDoc = await teamRef.get();
        
        if (!teamDoc.exists) {
            throw new Error('Team not found');
        }
        
        const teamData = teamDoc.data();
        
        // Add player to team's bench
        const updatedRoster = { ...teamData.roster };
        if (!updatedRoster.bench) updatedRoster.bench = [];
        updatedRoster.bench.push(playerId);
        
        // Update team roster
        await teamRef.update({ roster: updatedRoster });
        
        // Update draft state in league document
        const pick = {
            round: draftData.currentRound || 1,
            pick: draftData.currentPick + 1,
            teamId: teamId,
            teamName: teamData.teamName,
            playerId: playerId,
            player: player,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            autoPicked: true
        };
        
        const newCurrentPick = draftData.currentPick + 1;
        const newAvailablePlayers = draftData.availablePlayers.filter(p => p.id !== playerId);
        
        // Initialize arrays if they don't exist
        if (!leagueData.draft) leagueData.draft = {};
        if (!leagueData.draft.draftedPlayers) leagueData.draft.draftedPlayers = [];
        if (!leagueData.draft.picks) leagueData.draft.picks = [];
        
        // Add player to drafted players array
        const draftedPlayerData = {
            ...player,
            teamId: teamId,
            teamName: teamData.teamName,
            pickNumber: draftData.currentPick + 1,
            round: draftData.currentRound || 1,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            autoPicked: true
        };
        
        leagueData.draft.draftedPlayers.push(draftedPlayerData);
        leagueData.draft.picks.push(pick);
        
        const draftSettings = getDraftSettings(leagueData);
        const numTeams = getNumTeams(leagueData, draftData.draftOrder);
        const newCurrentRound = getRoundFromPickIndex(newCurrentPick, numTeams);
        const nextPickTime = getInitialPickTime(draftSettings.pickTimeLimit);
        const draftFinished = isDraftComplete(newCurrentPick, draftData.draftOrder);
        
        if (draftFinished) {
            // Update league document for completed draft
            await leagueRef.update({
                'draft.status': 'complete',
                'draft.currentPick': newCurrentPick,
                'draft.currentRound': newCurrentRound,
                'draft.availablePlayers': newAvailablePlayers,
                'draft.draftedPlayers': leagueData.draft.draftedPlayers,
                'draft.picks': leagueData.draft.picks,
                'draft.timeRemaining': 0,
                allRosteredPlayerIds: admin.firestore.FieldValue.arrayUnion(...leagueData.draft.draftedPlayers.map(p => p.id))
            });
        } else {
            // Update league document for next pick
            await leagueRef.update({
                'draft.currentPick': newCurrentPick,
                'draft.currentRound': newCurrentRound,
                'draft.availablePlayers': newAvailablePlayers,
                'draft.draftedPlayers': leagueData.draft.draftedPlayers,
                'draft.picks': leagueData.draft.picks,
                'draft.timeRemaining': nextPickTime,
                'draft.lastUpdate': admin.firestore.FieldValue.serverTimestamp()
            });
        }
        
    } catch (error) {
        console.error('Make draft pick internal error:', error);
        throw error;
    }
}

// Enhanced draft analysis using Python
exports.analyzeDraftStrategy = functions.https.onRequest(async (req, res) => {
    try {
        const { leagueId, teamId } = req.body;
        
        if (!leagueId || !teamId) {
            return res.status(400).json({ error: 'League ID and Team ID required' });
        }
        
        // Get league and team data
        const leagueDoc = await admin.firestore().doc(`leagues/${leagueId}`).get();
        const teamDoc = await admin.firestore().doc(`artifacts/default-fantasy-football-app/public/data/teams/${teamId}`).get();
        
        if (!leagueDoc.exists || !teamDoc.exists) {
            return res.status(404).json({ error: 'League or team not found' });
        }
        
        const league = leagueDoc.data();
        const team = teamDoc.data();
        
        // Use Python engine for advanced analysis
        const analysis = await pythonBridge.analyzeDraftStrategy(league.settings, team);
        
        res.json({
            success: true,
            analysis: analysis,
            recommendations: {
                strategy: analysis.draft_strategy,
                riskTolerance: analysis.risk_tolerance,
                projectedFinish: analysis.projected_finish,
                recommendedPositions: analysis.recommended_positions,
                avoidPositions: analysis.avoid_positions
            }
        });
        
    } catch (error) {
        console.error('Draft analysis error:', error);
        res.status(500).json({ error: 'Draft analysis failed' });
    }
});

// Get optimal pick recommendation
exports.getOptimalPick = functions.https.onRequest(async (req, res) => {
    try {
        const { availablePlayers, teamNeeds } = req.body;
        
        if (!availablePlayers || !teamNeeds) {
            return res.status(400).json({ error: 'Available players and team needs required' });
        }
        
        // Use Python engine for optimal pick calculation
        const optimalPick = await pythonBridge.calculateOptimalPick(availablePlayers, teamNeeds);
        
        res.json({
            success: true,
            optimalPick: optimalPick,
            reasoning: {
                valueScore: optimalPick?.draftValue || 0,
                riskFactor: optimalPick?.riskFactor || 0,
                projectedPoints: optimalPick?.projectedPoints || 0
            }
        });
        
    } catch (error) {
        console.error('Optimal pick calculation error:', error);
        res.status(500).json({ error: 'Optimal pick calculation failed' });
    }
});

// Get draft timer state
exports.getDraftTimerState = functions.https.onRequest(async (req, res) => {
    return cors(req, res, async () => {
        try {
            const { leagueId } = req.query;
            
            if (!leagueId) {
                return res.status(400).json({ error: 'League ID is required' });
            }
            
            const leagueRef = admin.firestore().doc(`leagues/${leagueId}`);
            const leagueDoc = await leagueRef.get();
            
            if (leagueDoc.exists) {
                const leagueData = leagueDoc.data();
                const draftData = leagueData.draft || {};
                
                // Calculate current team ID from draft order and current pick
                const currentTeamId = draftData.draftOrder && draftData.currentPick !== undefined 
                    ? draftData.draftOrder[draftData.currentPick] 
                    : null;
                
                const draftSettings = getDraftSettings(leagueData);
                const isFirstPick = draftData.currentPick === 0;
                const configuredTime = resolvePickTimeLimit(draftSettings);
                const timeRemaining = draftData.timeRemaining ?? configuredTime;
                
                res.json({
                    timerActive: draftData.status === 'live' && configuredTime !== null,
                    timeRemaining: timeRemaining,
                    currentTeamId: currentTeamId,
                    isFirstPick: isFirstPick,
                    currentPick: draftData.currentPick || 0,
                    draftOrder: draftData.draftOrder || [],
                    roundOneOrder: draftData.roundOneOrder || draftData.customOrder || [],
                    settings: draftSettings,
                    status: draftData.status || 'not_started'
                });
            } else {
                res.json({
                    timerActive: false,
                    timeRemaining: 0,
                    currentTeamId: null,
                    isFirstPick: false,
                    currentPick: 0,
                    draftOrder: [],
                    status: 'not_started'
                });
            }
        } catch (error) {
            console.error('Get draft timer state error:', error);
            res.status(500).json({ error: 'Failed to get draft timer state' });
        }
    });
});

// Update draft timer (runs every minute during active drafts)
exports.updateDraftTimer = functions.pubsub.schedule('every 1 minutes').onRun(async (context) => {
    try {
        const leaguesRef = admin.firestore().collection('leagues');
        
        const leaguesSnapshot = await leaguesRef
            .where('draft.status', '==', 'live')
            .get();
            
        for (const leagueDoc of leaguesSnapshot.docs) {
            const leagueId = leagueDoc.id;
            const leagueData = leagueDoc.data();
            const draftData = leagueData.draft || {};
            
            const draftSettings = getDraftSettings(leagueData);
            const pickTimeLimit = resolvePickTimeLimit(draftSettings);

            if (draftData.status === 'live' && pickTimeLimit !== null && draftData.timeRemaining > 0) {
                const newTimeRemaining = draftData.timeRemaining - 1;
                
                // Update the league document directly
                await admin.firestore().doc(`leagues/${leagueId}`).update({
                    'draft.timeRemaining': newTimeRemaining,
                    'draft.lastUpdate': admin.firestore.FieldValue.serverTimestamp()
                });
                
                // Auto-pick if time runs out
                if (newTimeRemaining <= 0) {
                    await handleTimeUp(leagueId, draftData);
                }
            }
        }
        
        return null;
    } catch (error) {
        console.error('Update draft timer error:', error);
        throw error;
    }
}); 

// Helper function to handle CORS preflight
const handleCORS = (req, res, next) => {
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
        res.set('Access-Control-Max-Age', '3600');
        res.status(200).send('');
        return;
    }
    
    // Handle actual requests
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
    
    next();
};

// =====================================================================================
// === PYTHON HEAVY OPERATIONS (NON-BLOCKING CHILD PROCESSES) ==========================
// =====================================================================================

/**
 * HTTP endpoint to run draftEngine.py operations without blocking the event loop.
 * Body: { "function": "analyze_draft_strategy", "args": { ... } }
 */
exports.runDraftEngine = functions.https.onRequest(async (req, res) => {
    return cors(req, res, async () => {
        try {
            if (req.method !== 'POST') {
                return res.status(405).json({ error: 'Method not allowed' });
            }

            const { function: operation, args } = req.body || {};
            if (!operation) {
                return res.status(400).json({ error: 'function name is required' });
            }

            const result = await pythonBridge.runDraftEngineOperation(operation, args || {});
            return res.json({ success: true, result });
        } catch (error) {
            console.error('runDraftEngine error:', error);
            return res.status(500).json({ error: error.message || 'Draft engine execution failed' });
        }
    });
});

/**
 * Pub/Sub worker for async draft engine jobs.
 * Publish JSON: { "function": "calculate_optimal_pick", "args": { ... } }
 */
exports.runDraftEngineJob = functions.pubsub.topic('draft-engine-jobs').onPublish(async (message) => {
    const payload = message.json || {};
    const operation = payload.function;
    const args = payload.args || {};

    if (!operation) {
        throw new Error('Pub/Sub message must include a function name');
    }

    console.log(`Running draft engine job: ${operation}`);
    return pythonBridge.runDraftEngineOperation(operation, args);
});

/**
 * HTTP endpoint to trigger the full Sleeper sync (players + weekly stats).
 */
exports.syncSleeperPlayersFull = functions
    .runWith({ timeoutSeconds: 540, memory: '1GB' })
    .https.onRequest(async (req, res) => {
        return cors(req, res, async () => {
            try {
                const body = req.method === 'POST' ? (req.body || {}) : {};
                const query = req.query || {};

                const result = await runSleeperPlayerSync({
                    skipPlayers: body.skipPlayers === true || query.skipPlayers === 'true',
                    skipWeeklyStats: body.skipWeeklyStats === true || query.skipWeeklyStats === 'true',
                    seasonType: body.seasonType || query.seasonType,
                    season: body.season || query.season,
                    week: body.week !== undefined ? body.week : query.week,
                    weeklyStatsForAllPlayers: body.weeklyStatsForAllPlayers === true
                        || query.weeklyStatsForAllPlayers === 'true',
                });

                return res.json(result);
            } catch (error) {
                console.error('syncSleeperPlayersFull error:', error);
                return res.status(500).json({ success: false, error: error.message });
            }
        });
    });

/**
 * Scheduled full Sleeper sync (players + weekly stats) — runs after the lightweight sync.
 */
exports.syncSleeperPlayersFullScheduled = functions
    .runWith({ timeoutSeconds: 540, memory: '1GB' })
    .pubsub.schedule('0 4 * * *')
    .timeZone('America/New_York')
    .onRun(async () => {
        console.log('Starting scheduled full Sleeper player sync');
        const result = await runSleeperPlayerSync();
        console.log('Scheduled full Sleeper player sync completed', result);
        return result;
    });

/**
 * Scheduled FantasyPros consensus projection scrape — every Tuesday at 6:00 AM ET.
 * Runs in a child process with strict timeout and non-fatal error handling.
 */
exports.scrapeProjectionsScheduled = functions
    .runWith({ timeoutSeconds: 300, memory: '512MB' })
    .pubsub.schedule('0 6 * * 2')
    .timeZone('America/New_York')
    .onRun(async () => {
        console.log('Starting scheduled FantasyPros projection scrape');

        try {
            const result = await runProjectionScrape({ timeoutMs: 240000 });

            if (result?.scrape_errors?.length) {
                console.warn(
                    'Projection scrape completed with partial errors',
                    result.scrape_errors,
                );
            }

            console.log('Scheduled FantasyPros projection scrape completed', {
                totalScraped: result?.total_scraped,
                totalMatched: result?.total_matched,
                totalWritten: result?.total_written,
                totalUnmatched: result?.total_unmatched,
            });

            return result;
        } catch (error) {
            console.error(
                'Scheduled FantasyPros projection scrape failed (non-fatal):',
                error.message,
                error.stack,
            );

            return {
                success: false,
                error: error.message,
                failedAt: new Date().toISOString(),
            };
        }
    });

/**
 * Finalize official weekly standings every Tuesday at 7:00 AM ET
 * (after the prior week's games are complete).
 * Live Scores remain mid-week; Standings only use these finalized values.
 */
exports.finalizeWeeklyStandingsScheduled = functions
    .runWith({ timeoutSeconds: 540, memory: '1GB' })
    .pubsub.schedule('0 7 * * 2')
    .timeZone('America/New_York')
    .onRun(async () => {
        console.log('Starting Tuesday weekly standings finalization');
        try {
            const summary = await finalizeAllLeagueStandings(admin.firestore());
            console.log('Weekly standings finalization completed', summary);
            return summary;
        } catch (error) {
            console.error('Weekly standings finalization failed:', error);
            throw error;
        }
    });

/**
 * Manual HTTP trigger to finalize standings (commissioner/admin use).
 * Optional query: ?week=5
 */
exports.finalizeWeeklyStandings = functions
    .runWith({ timeoutSeconds: 540, memory: '1GB' })
    .https.onRequest(async (req, res) => {
        return cors(req, res, async () => {
            try {
                const week = req.query.week || req.body?.week || null;
                const summary = await finalizeAllLeagueStandings(admin.firestore(), {
                    week: week != null ? Number(week) : null,
                });
                return res.json({ success: true, ...summary });
            } catch (error) {
                console.error('finalizeWeeklyStandings error:', error);
                return res.status(500).json({ success: false, error: error.message });
            }
        });
    });
