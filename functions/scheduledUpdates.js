const functions = require('firebase-functions');
const { ESPNDataService } = require('./espnDataService');

// Initialize the ESPN data service
const espnService = new ESPNDataService();

// Scheduled function to update teams daily at 6 AM EST
exports.updateTeamsDaily = functions.pubsub
    .schedule('0 6 * * *')
    .timeZone('America/New_York')
    .onRun(async (context) => {
        try {
            console.log('Running scheduled teams update...');
            await espnService.updateTeams();
            console.log('Teams update completed successfully');
            return null;
        } catch (error) {
            console.error('Error in scheduled teams update:', error);
            throw error;
        }
    });

// Scheduled function to update players daily at 7 AM EST
exports.updatePlayersDaily = functions.pubsub
    .schedule('0 7 * * *')
    .timeZone('America/New_York')
    .onRun(async (context) => {
        try {
            console.log('Running scheduled players update...');
            await espnService.updatePlayers();
            console.log('Players update completed successfully');
            return null;
        } catch (error) {
            console.error('Error in scheduled players update:', error);
            throw error;
        }
    });

// Scheduled function to update games every hour during NFL season
exports.updateGamesHourly = functions.pubsub
    .schedule('0 * * * *')
    .timeZone('America/New_York')
    .onRun(async (context) => {
        try {
            console.log('Running scheduled games update...');
            await espnService.updateGames();
            console.log('Games update completed successfully');
            return null;
        } catch (error) {
            console.error('Error in scheduled games update:', error);
            throw error;
        }
    });

// Scheduled function to update player stats every 15 minutes during game days
exports.updatePlayerStatsGameDay = functions.pubsub
    .schedule('*/15 * * * 0,4,5,6') // Every 15 minutes on Thursday, Friday, Saturday, Sunday
    .timeZone('America/New_York')
    .onRun(async (context) => {
        try {
            console.log('Running scheduled player stats update...');
            
            // Check if there are live games
            const hasLive = await espnService.hasLiveGames();
            
            if (hasLive) {
                console.log('Live games detected, updating player stats...');
                await espnService.updateAllPlayerStats();
                console.log('Player stats update completed successfully');
            } else {
                console.log('No live games, skipping player stats update');
            }
            
            return null;
        } catch (error) {
            console.error('Error in scheduled player stats update:', error);
            throw error;
        }
    });

// Scheduled function to update all data weekly (Sunday at 5 AM EST)
exports.updateAllDataWeekly = functions.pubsub
    .schedule('0 5 * * 0')
    .timeZone('America/New_York')
    .onRun(async (context) => {
        try {
            console.log('Running weekly full data update...');
            
            // Update teams
            await espnService.updateTeams();
            console.log('Teams updated');
            
            // Update players
            await espnService.updatePlayers();
            console.log('Players updated');
            
            // Update games for current week
            const currentWeek = await espnService.getCurrentWeek();
            await espnService.updateGames(currentWeek);
            console.log(`Games updated for week ${currentWeek}`);
            
            // Update all player stats
            await espnService.updateAllPlayerStats();
            console.log('All player stats updated');
            
            console.log('Weekly data update completed successfully');
            return null;
        } catch (error) {
            console.error('Error in weekly data update:', error);
            throw error;
        }
    });

// HTTP function to manually trigger data updates
exports.manualUpdate = functions.https.onRequest(async (req, res) => {
    try {
        const { type } = req.query;
        
        switch (type) {
            case 'teams':
                await espnService.updateTeams();
                res.json({ success: true, message: 'Teams updated successfully' });
                break;
                
            case 'players':
                await espnService.updatePlayers();
                res.json({ success: true, message: 'Players updated successfully' });
                break;
                
            case 'games':
                await espnService.updateGames();
                res.json({ success: true, message: 'Games updated successfully' });
                break;
                
            case 'stats':
                await espnService.updateAllPlayerStats();
                res.json({ success: true, message: 'Player stats updated successfully' });
                break;
                
            case 'all':
                await espnService.updateTeams();
                await espnService.updatePlayers();
                await espnService.updateGames();
                await espnService.updateAllPlayerStats();
                res.json({ success: true, message: 'All data updated successfully' });
                break;
                
            default:
                res.status(400).json({ 
                    success: false, 
                    message: 'Invalid type. Use: teams, players, games, stats, or all' 
                });
        }
    } catch (error) {
        console.error('Error in manual update:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error updating data',
            error: error.message 
        });
    }
});

// HTTP function to get data update status
exports.getUpdateStatus = functions.https.onRequest(async (req, res) => {
    try {
        const updatesRef = espnService.db.collection('data_updates');
        const snapshot = await updatesRef
            .orderBy('timestamp', 'desc')
            .limit(10)
            .get();
            
        const updates = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            timestamp: doc.data().timestamp?.toDate()
        }));
        
        res.json({ success: true, updates });
    } catch (error) {
        console.error('Error getting update status:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error getting update status',
            error: error.message 
        });
    }
}); 