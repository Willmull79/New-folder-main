# 🏈 ESPN API Integration Guide

## 🚀 **ESPN API - Free NFL Data**

The ESPN API provides comprehensive NFL data **completely free** with no API key required! This makes it perfect for your fantasy football app.

## 📊 **Available ESPN API Endpoints:**

### **1. Teams & Rosters**
```javascript
// Get all NFL teams
const teams = await window.apiService.getESPNTeams();

// Get team roster
const roster = await window.apiService.getESPNTeamRoster('teamId');
```

### **2. Player Data**
```javascript
// Search for players
const players = await window.apiService.getESPNPlayerSearch('Patrick Mahomes');

// Get player stats
const stats = await window.apiService.getESPNPlayerStats('playerId');
```

### **3. Standings & Scores**
```javascript
// Get current standings
const standings = await window.apiService.getESPNStandings();

// Get live scores
const scores = await window.apiService.getESPNScores();

// Get scores for specific week
const weekScores = await window.apiService.getESPNScores(5);
```

### **4. Team Statistics**
```javascript
// Get team stats
const teamStats = await window.apiService.getESPNTeamStats('teamId');
```

## 🎯 **How to Use in Your Fantasy App:**

### **Example 1: Enhance Player Data**
```javascript
// Add real ESPN data to your existing players
const enhancePlayerWithESPN = async (playerName) => {
    try {
        const searchResults = await window.apiService.getESPNPlayerSearch(playerName);
        const player = searchResults.athletes?.find(p => 
            p.fullName.toLowerCase().includes(playerName.toLowerCase())
        );
        
        if (player) {
            const stats = await window.apiService.getESPNPlayerStats(player.id);
            return {
                ...player,
                stats: stats,
                lastUpdated: new Date().toISOString()
            };
        }
    } catch (error) {
        console.error('Failed to get ESPN data:', error);
    }
};
```

### **Example 2: Live Game Integration**
```javascript
// Add live game data to your fantasy app
const getLiveGames = async () => {
    try {
        const scores = await window.apiService.getESPNScores();
        return scores.events?.filter(game => 
            game.status?.type?.description === 'In Progress'
        ) || [];
    } catch (error) {
        console.error('Failed to get live games:', error);
    }
};
```

### **Example 3: Team Roster Integration**
```javascript
// Get real NFL rosters for your fantasy app
const getNFLRoster = async (teamName) => {
    try {
        const teams = await window.apiService.getESPNTeams();
        const team = teams.sports[0].leagues[0].teams.find(t => 
            t.team.name.toLowerCase().includes(teamName.toLowerCase())
        );
        
        if (team) {
            const roster = await window.apiService.getESPNTeamRoster(team.team.id);
            return roster.athletes || [];
        }
    } catch (error) {
        console.error('Failed to get roster:', error);
    }
};
```

## 📱 **Integration Examples:**

### **1. Add to Your Roster Component:**
```javascript
const Roster = ({ teamData, allPlayers, showMessage }) => {
    const [espnData, setEspnData] = useState({});

    const loadESPNData = async (playerName) => {
        try {
            const searchResults = await window.apiService.getESPNPlayerSearch(playerName);
            const player = searchResults.athletes?.[0];
            if (player) {
                setEspnData(prev => ({
                    ...prev,
                    [playerName]: player
                }));
            }
        } catch (error) {
            console.error('ESPN data load failed:', error);
        }
    };

    // Use in your existing roster display
    return (
        <div>
            {teamData.roster.lineup.map(slot => {
                const player = getPlayerDetails(slot, allPlayers);
                const espnPlayer = espnData[player?.name];
                
                return (
                    <div key={slot}>
                        <span>{player.name}</span>
                        {espnPlayer && (
                            <span className="text-sm text-gray-400">
                                {espnPlayer.position?.abbreviation} - {espnPlayer.team?.name}
                            </span>
                        )}
                    </div>
                );
            })}
        </div>
    );
};
```

### **2. Add Live Scores Widget:**
```javascript
const LiveScoresWidget = () => {
    const [scores, setScores] = useState([]);
    const [loading, setLoading] = useState(false);

    const loadScores = async () => {
        setLoading(true);
        try {
            const data = await window.apiService.getESPNScores();
            setScores(data.events || []);
        } catch (error) {
            console.error('Failed to load scores:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadScores();
        // Refresh every 30 seconds
        const interval = setInterval(loadScores, 30000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="bg-gray-700 p-4 rounded-lg">
            <h3 className="text-lg font-semibold mb-3">Live NFL Scores</h3>
            {loading ? (
                <p>Loading scores...</p>
            ) : (
                <div className="space-y-2">
                    {scores.slice(0, 5).map(game => (
                        <div key={game.id} className="flex justify-between text-sm">
                            <span>{game.competitions[0]?.competitors[0]?.team?.name}</span>
                            <span>{game.competitions[0]?.competitors[0]?.score}</span>
                            <span>vs</span>
                            <span>{game.competitions[0]?.competitors[1]?.score}</span>
                            <span>{game.competitions[0]?.competitors[1]?.team?.name}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
```

## 🔧 **Advanced Features:**

### **1. Player Injury Tracking:**
```javascript
const getPlayerInjuries = async () => {
    // ESPN provides injury data in player stats
    const players = await window.apiService.getESPNPlayerSearch('injured');
    return players.athletes?.filter(p => 
        p.status?.description?.toLowerCase().includes('injured')
    ) || [];
};
```

### **2. Team Performance Analytics:**
```javascript
const getTeamPerformance = async (teamId) => {
    const stats = await window.apiService.getESPNTeamStats(teamId);
    const standings = await window.apiService.getESPNStandings();
    
    return {
        stats: stats,
        standings: standings.find(s => s.id === teamId)
    };
};
```

### **3. Real-time Updates:**
```javascript
// Set up real-time updates for live games
const setupLiveUpdates = () => {
    setInterval(async () => {
        const scores = await window.apiService.getESPNScores();
        const liveGames = scores.events?.filter(game => 
            game.status?.type?.description === 'In Progress'
        );
        
        if (liveGames.length > 0) {
            // Update your fantasy app with live data
            updateFantasyScores(liveGames);
        }
    }, 30000); // Check every 30 seconds
};
```

## 🎮 **Fantasy App Integration Ideas:**

### **1. Enhanced Player Cards:**
- Real NFL team logos
- Current team and position
- Jersey numbers
- Injury status

### **2. Live Scoring:**
- Real-time game scores
- Player performance updates
- Fantasy point calculations

### **3. Team Analytics:**
- NFL standings integration
- Team performance trends
- Player team changes

### **4. News Integration:**
- Player injury updates
- Team news and updates
- Trade deadline information

## 🚀 **Next Steps:**

1. **Test the ESPN API** - Use the demo component
2. **Choose features** to integrate into your app
3. **Add real-time updates** for live games
4. **Enhance player data** with ESPN information
5. **Create live scoring** integration

The ESPN API is now fully integrated and ready to enhance your fantasy football app with real NFL data! 🏈 