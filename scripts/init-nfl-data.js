// Script to initialize NFL player data in Firestore
const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('../serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Comprehensive NFL player data (2024 season)
const nflPlayers = [
    // Quarterbacks
    { id: 'qb1', name: 'Patrick Mahomes', position: 'QB', nflTeam: 'KC', salary: 50, rank: 1, jerseyNumber: '15', age: 28, status: 'Active', experience: 7, height: '6-3', weight: 225, college: 'Texas Tech', lastUpdated: new Date().toISOString() },
    { id: 'qb2', name: 'Josh Allen', position: 'QB', nflTeam: 'BUF', salary: 49, rank: 2, jerseyNumber: '17', age: 28, status: 'Active', experience: 6, height: '6-5', weight: 237, college: 'Wyoming', lastUpdated: new Date().toISOString() },
    { id: 'qb3', name: 'Jalen Hurts', position: 'QB', nflTeam: 'PHI', salary: 47, rank: 3, jerseyNumber: '1', age: 25, status: 'Active', experience: 4, height: '6-1', weight: 223, college: 'Oklahoma', lastUpdated: new Date().toISOString() },
    { id: 'qb4', name: 'Lamar Jackson', position: 'QB', nflTeam: 'BAL', salary: 48, rank: 4, jerseyNumber: '8', age: 27, status: 'Active', experience: 6, height: '6-2', weight: 212, college: 'Louisville', lastUpdated: new Date().toISOString() },
    { id: 'qb5', name: 'Joe Burrow', position: 'QB', nflTeam: 'CIN', salary: 48, rank: 5, jerseyNumber: '9', age: 27, status: 'Active', experience: 4, height: '6-4', weight: 215, college: 'LSU', lastUpdated: new Date().toISOString() },
    { id: 'qb6', name: 'Dak Prescott', position: 'QB', nflTeam: 'DAL', salary: 45, rank: 6, jerseyNumber: '4', age: 30, status: 'Active', experience: 8, height: '6-2', weight: 238, college: 'Mississippi State', lastUpdated: new Date().toISOString() },
    { id: 'qb7', name: 'C.J. Stroud', position: 'QB', nflTeam: 'HOU', salary: 40, rank: 7, jerseyNumber: '7', age: 22, status: 'Active', experience: 1, height: '6-3', weight: 218, college: 'Ohio State', lastUpdated: new Date().toISOString() },
    { id: 'qb8', name: 'Justin Herbert', position: 'QB', nflTeam: 'LAC', salary: 46, rank: 8, jerseyNumber: '10', age: 25, status: 'Active', experience: 4, height: '6-6', weight: 236, college: 'Oregon', lastUpdated: new Date().toISOString() },
    { id: 'qb9', name: 'Tua Tagovailoa', position: 'QB', nflTeam: 'MIA', salary: 44, rank: 9, jerseyNumber: '1', age: 26, status: 'Active', experience: 4, height: '6-1', weight: 217, college: 'Alabama', lastUpdated: new Date().toISOString() },
    { id: 'qb10', name: 'Brock Purdy', position: 'QB', nflTeam: 'SF', salary: 42, rank: 10, jerseyNumber: '13', age: 24, status: 'Active', experience: 2, height: '6-1', weight: 220, college: 'Iowa State', lastUpdated: new Date().toISOString() },
    
    // Running Backs
    { id: 'rb1', name: 'Christian McCaffrey', position: 'RB', nflTeam: 'SF', salary: 55, rank: 1, jerseyNumber: '23', age: 27, status: 'Active', experience: 7, height: '5-11', weight: 205, college: 'Stanford', lastUpdated: new Date().toISOString() },
    { id: 'rb2', name: 'Bijan Robinson', position: 'RB', nflTeam: 'ATL', salary: 45, rank: 2, jerseyNumber: '7', age: 22, status: 'Active', experience: 1, height: '6-0', weight: 215, college: 'Texas', lastUpdated: new Date().toISOString() },
    { id: 'rb3', name: 'Saquon Barkley', position: 'RB', nflTeam: 'PHI', salary: 40, rank: 3, jerseyNumber: '26', age: 27, status: 'Active', experience: 6, height: '6-0', weight: 233, college: 'Penn State', lastUpdated: new Date().toISOString() },
    { id: 'rb4', name: 'Austin Ekeler', position: 'RB', nflTeam: 'WAS', salary: 38, rank: 4, jerseyNumber: '30', age: 29, status: 'Active', experience: 7, height: '5-10', weight: 200, college: 'Western State', lastUpdated: new Date().toISOString() },
    { id: 'rb5', name: 'Derrick Henry', position: 'RB', nflTeam: 'BAL', salary: 39, rank: 5, jerseyNumber: '22', age: 30, status: 'Active', experience: 8, height: '6-3', weight: 247, college: 'Alabama', lastUpdated: new Date().toISOString() },
    { id: 'rb6', name: 'Jonathan Taylor', position: 'RB', nflTeam: 'IND', salary: 42, rank: 6, jerseyNumber: '28', age: 25, status: 'Active', experience: 4, height: '5-10', weight: 226, college: 'Wisconsin', lastUpdated: new Date().toISOString() },
    { id: 'rb7', name: 'Kyren Williams', position: 'RB', nflTeam: 'LAR', salary: 36, rank: 7, jerseyNumber: '23', age: 23, status: 'Active', experience: 2, height: '5-9', weight: 194, college: 'Notre Dame', lastUpdated: new Date().toISOString() },
    { id: 'rb8', name: 'Breece Hall', position: 'RB', nflTeam: 'NYJ', salary: 41, rank: 8, jerseyNumber: '20', age: 23, status: 'Active', experience: 2, height: '6-1', weight: 220, college: 'Iowa State', lastUpdated: new Date().toISOString() },
    { id: 'rb9', name: 'Alvin Kamara', position: 'RB', nflTeam: 'NO', salary: 37, rank: 9, jerseyNumber: '41', age: 28, status: 'Active', experience: 7, height: '5-10', weight: 215, college: 'Tennessee', lastUpdated: new Date().toISOString() },
    { id: 'rb10', name: 'Rachaad White', position: 'RB', nflTeam: 'TB', salary: 35, rank: 10, jerseyNumber: '1', age: 25, status: 'Active', experience: 2, height: '6-0', weight: 214, college: 'Arizona State', lastUpdated: new Date().toISOString() },
    
    // Wide Receivers
    { id: 'wr1', name: 'Justin Jefferson', position: 'WR', nflTeam: 'MIN', salary: 52, rank: 1, jerseyNumber: '18', age: 24, status: 'Active', experience: 4, height: '6-1', weight: 195, college: 'LSU', lastUpdated: new Date().toISOString() },
    { id: 'wr2', name: 'Ja\'Marr Chase', position: 'WR', nflTeam: 'CIN', salary: 51, rank: 2, jerseyNumber: '1', age: 24, status: 'Active', experience: 3, height: '6-0', weight: 201, college: 'LSU', lastUpdated: new Date().toISOString() },
    { id: 'wr3', name: 'CeeDee Lamb', position: 'WR', nflTeam: 'DAL', salary: 48, rank: 3, jerseyNumber: '88', age: 25, status: 'Active', experience: 4, height: '6-2', weight: 198, college: 'Oklahoma', lastUpdated: new Date().toISOString() },
    { id: 'wr4', name: 'Amon-Ra St. Brown', position: 'WR', nflTeam: 'DET', salary: 47, rank: 4, jerseyNumber: '14', age: 24, status: 'Active', experience: 3, height: '6-0', weight: 202, college: 'USC', lastUpdated: new Date().toISOString() },
    { id: 'wr5', name: 'Cooper Kupp', position: 'WR', nflTeam: 'LAR', salary: 44, rank: 5, jerseyNumber: '10', age: 31, status: 'Active', experience: 7, height: '6-2', weight: 208, college: 'Eastern Washington', lastUpdated: new Date().toISOString() },
    { id: 'wr6', name: 'Garrett Wilson', position: 'WR', nflTeam: 'NYJ', salary: 43, rank: 6, jerseyNumber: '17', age: 23, status: 'Active', experience: 2, height: '6-0', weight: 192, college: 'Ohio State', lastUpdated: new Date().toISOString() },
    { id: 'wr7', name: 'Puka Nacua', position: 'WR', nflTeam: 'LAR', salary: 30, rank: 7, jerseyNumber: '17', age: 23, status: 'Active', experience: 1, height: '6-2', weight: 205, college: 'BYU', lastUpdated: new Date().toISOString() },
    { id: 'wr8', name: 'A.J. Brown', position: 'WR', nflTeam: 'PHI', salary: 49, rank: 8, jerseyNumber: '11', age: 26, status: 'Active', experience: 5, height: '6-1', weight: 226, college: 'Ole Miss', lastUpdated: new Date().toISOString() },
    { id: 'wr9', name: 'Tyreek Hill', position: 'WR', nflTeam: 'MIA', salary: 50, rank: 9, jerseyNumber: '10', age: 30, status: 'Active', experience: 8, height: '5-10', weight: 185, college: 'West Alabama', lastUpdated: new Date().toISOString() },
    { id: 'wr10', name: 'Stefon Diggs', position: 'WR', nflTeam: 'HOU', salary: 46, rank: 10, jerseyNumber: '14', age: 30, status: 'Active', experience: 9, height: '6-0', weight: 191, college: 'Maryland', lastUpdated: new Date().toISOString() },
    { id: 'wr11', name: 'Davante Adams', position: 'WR', nflTeam: 'LV', salary: 45, rank: 11, jerseyNumber: '17', age: 31, status: 'Active', experience: 10, height: '6-1', weight: 215, college: 'Fresno State', lastUpdated: new Date().toISOString() },
    { id: 'wr12', name: 'DeVonta Smith', position: 'WR', nflTeam: 'PHI', salary: 42, rank: 12, jerseyNumber: '6', age: 25, status: 'Active', experience: 3, height: '6-0', weight: 170, college: 'Alabama', lastUpdated: new Date().toISOString() },
    
    // Tight Ends
    { id: 'te1', name: 'Travis Kelce', position: 'TE', nflTeam: 'KC', salary: 48, rank: 1, jerseyNumber: '87', age: 34, status: 'Active', experience: 11, height: '6-5', weight: 260, college: 'Cincinnati', lastUpdated: new Date().toISOString() },
    { id: 'te2', name: 'T.J. Hockenson', position: 'TE', nflTeam: 'MIN', salary: 35, rank: 2, jerseyNumber: '87', age: 26, status: 'Active', experience: 5, height: '6-5', weight: 248, college: 'Iowa', lastUpdated: new Date().toISOString() },
    { id: 'te3', name: 'Mark Andrews', position: 'TE', nflTeam: 'BAL', salary: 42, rank: 3, jerseyNumber: '89', age: 28, status: 'Active', experience: 6, height: '6-5', weight: 256, college: 'Oklahoma', lastUpdated: new Date().toISOString() },
    { id: 'te4', name: 'George Kittle', position: 'TE', nflTeam: 'SF', salary: 40, rank: 4, jerseyNumber: '85', age: 30, status: 'Active', experience: 7, height: '6-4', weight: 250, college: 'Iowa', lastUpdated: new Date().toISOString() },
    { id: 'te5', name: 'Darren Waller', position: 'TE', nflTeam: 'NYG', salary: 33, rank: 5, jerseyNumber: '83', age: 31, status: 'Active', experience: 8, height: '6-6', weight: 238, college: 'Georgia Tech', lastUpdated: new Date().toISOString() },
    { id: 'te6', name: 'Sam LaPorta', position: 'TE', nflTeam: 'DET', salary: 38, rank: 6, jerseyNumber: '87', age: 23, status: 'Active', experience: 1, height: '6-3', weight: 245, college: 'Iowa', lastUpdated: new Date().toISOString() },
    { id: 'te7', name: 'Evan Engram', position: 'TE', nflTeam: 'JAX', salary: 32, rank: 7, jerseyNumber: '17', age: 29, status: 'Active', experience: 7, height: '6-3', weight: 240, college: 'Ole Miss', lastUpdated: new Date().toISOString() },
    { id: 'te8', name: 'Dallas Goedert', position: 'TE', nflTeam: 'PHI', salary: 34, rank: 8, jerseyNumber: '88', age: 29, status: 'Active', experience: 6, height: '6-5', weight: 256, college: 'South Dakota State', lastUpdated: new Date().toISOString() },
    
    // Defensive Players
    { id: 'dl1', name: 'Myles Garrett', position: 'DL', nflTeam: 'CLE', salary: 30, rank: 1, jerseyNumber: '95', age: 28, status: 'Active', experience: 7, height: '6-4', weight: 272, college: 'Texas A&M', lastUpdated: new Date().toISOString() },
    { id: 'dl2', name: 'Nick Bosa', position: 'DL', nflTeam: 'SF', salary: 32, rank: 2, jerseyNumber: '97', age: 26, status: 'Active', experience: 5, height: '6-4', weight: 266, college: 'Ohio State', lastUpdated: new Date().toISOString() },
    { id: 'dl3', name: 'Aaron Donald', position: 'DL', nflTeam: 'LAR', salary: 35, rank: 3, jerseyNumber: '99', age: 32, status: 'Active', experience: 10, height: '6-1', weight: 280, college: 'Pittsburgh', lastUpdated: new Date().toISOString() },
    { id: 'dl4', name: 'Maxx Crosby', position: 'DL', nflTeam: 'LV', salary: 31, rank: 4, jerseyNumber: '98', age: 26, status: 'Active', experience: 5, height: '6-5', weight: 255, college: 'Eastern Michigan', lastUpdated: new Date().toISOString() },
    { id: 'dl5', name: 'T.J. Watt', position: 'DL', nflTeam: 'PIT', salary: 34, rank: 5, jerseyNumber: '90', age: 29, status: 'Active', experience: 7, height: '6-4', weight: 252, college: 'Wisconsin', lastUpdated: new Date().toISOString() },
    
    { id: 'lb1', name: 'Fred Warner', position: 'LB', nflTeam: 'SF', salary: 28, rank: 1, jerseyNumber: '54', age: 27, status: 'Active', experience: 6, height: '6-3', weight: 230, college: 'BYU', lastUpdated: new Date().toISOString() },
    { id: 'lb2', name: 'Roquan Smith', position: 'LB', nflTeam: 'BAL', salary: 29, rank: 2, jerseyNumber: '0', age: 26, status: 'Active', experience: 6, height: '6-1', weight: 236, college: 'Georgia', lastUpdated: new Date().toISOString() },
    { id: 'lb3', name: 'Micah Parsons', position: 'LB', nflTeam: 'DAL', salary: 33, rank: 3, jerseyNumber: '11', age: 24, status: 'Active', experience: 3, height: '6-3', weight: 245, college: 'Penn State', lastUpdated: new Date().toISOString() },
    { id: 'lb4', name: 'Bobby Wagner', position: 'LB', nflTeam: 'WAS', salary: 22, rank: 4, jerseyNumber: '54', age: 33, status: 'Active', experience: 12, height: '6-0', weight: 242, college: 'Utah State', lastUpdated: new Date().toISOString() },
    { id: 'lb5', name: 'Devin White', position: 'LB', nflTeam: 'TB', salary: 25, rank: 5, jerseyNumber: '45', age: 25, status: 'Active', experience: 5, height: '6-0', weight: 237, college: 'LSU', lastUpdated: new Date().toISOString() },
    
    { id: 'db1', name: 'Derwin James', position: 'DB', nflTeam: 'LAC', salary: 25, rank: 1, jerseyNumber: '33', age: 27, status: 'Active', experience: 6, height: '6-2', weight: 215, college: 'Florida State', lastUpdated: new Date().toISOString() },
    { id: 'db2', name: 'Patrick Surtain II', position: 'DB', nflTeam: 'DEN', salary: 26, rank: 2, jerseyNumber: '2', age: 23, status: 'Active', experience: 3, height: '6-2', weight: 202, college: 'Alabama', lastUpdated: new Date().toISOString() },
    { id: 'db3', name: 'Minkah Fitzpatrick', position: 'DB', nflTeam: 'PIT', salary: 27, rank: 3, jerseyNumber: '39', age: 27, status: 'Active', experience: 6, height: '6-1', weight: 207, college: 'Alabama', lastUpdated: new Date().toISOString() },
    { id: 'db4', name: 'Sauce Gardner', position: 'DB', nflTeam: 'NYJ', salary: 28, rank: 4, jerseyNumber: '1', age: 23, status: 'Active', experience: 2, height: '6-3', weight: 190, college: 'Cincinnati', lastUpdated: new Date().toISOString() },
    { id: 'db5', name: 'Jalen Ramsey', position: 'DB', nflTeam: 'MIA', salary: 24, rank: 5, jerseyNumber: '5', age: 29, status: 'Active', experience: 8, height: '6-1', weight: 208, college: 'Florida State', lastUpdated: new Date().toISOString() },
    
    // Kickers
    { id: 'k1', name: 'Justin Tucker', position: 'K', nflTeam: 'BAL', salary: 15, rank: 1, jerseyNumber: '9', age: 34, status: 'Active', experience: 12, height: '6-1', weight: 183, college: 'Texas', lastUpdated: new Date().toISOString() },
    { id: 'k2', name: 'Tyler Bass', position: 'K', nflTeam: 'BUF', salary: 12, rank: 2, jerseyNumber: '2', age: 26, status: 'Active', experience: 4, height: '5-10', weight: 185, college: 'Georgia Southern', lastUpdated: new Date().toISOString() },
    { id: 'k3', name: 'Daniel Carlson', position: 'K', nflTeam: 'LV', salary: 14, rank: 3, jerseyNumber: '2', age: 28, status: 'Active', experience: 6, height: '6-5', weight: 215, college: 'Auburn', lastUpdated: new Date().toISOString() },
    { id: 'k4', name: 'Harrison Butker', position: 'K', nflTeam: 'KC', salary: 13, rank: 4, jerseyNumber: '7', age: 28, status: 'Active', experience: 7, height: '6-4', weight: 205, college: 'Georgia Tech', lastUpdated: new Date().toISOString() },
    { id: 'k5', name: 'Evan McPherson', position: 'K', nflTeam: 'CIN', salary: 11, rank: 5, jerseyNumber: '2', age: 24, status: 'Active', experience: 3, height: '5-11', weight: 185, college: 'Florida', lastUpdated: new Date().toISOString() }
];

async function initializeNFLData() {
    try {
        console.log('Starting NFL player data initialization...');
        
        // Clear existing data
        const existingPlayers = await db.collection('nfl_players').get();
        const batch = db.batch();
        
        existingPlayers.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        
        await batch.commit();
        console.log('Cleared existing NFL player data');
        
        // Add new players
        const addBatch = db.batch();
        
        nflPlayers.forEach(player => {
            const playerRef = db.collection('nfl_players').doc(player.id);
            addBatch.set(playerRef, player);
        });
        
        await addBatch.commit();
        console.log(`Successfully initialized ${nflPlayers.length} NFL players`);
        
        process.exit(0);
    } catch (error) {
        console.error('Error initializing NFL data:', error);
        process.exit(1);
    }
}

initializeNFLData(); 