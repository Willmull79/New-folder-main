# 🏈 API Integration Guide: Real-time Scores & Player Updates

## 📋 **Overview**

This guide explains how to use APIs to update fantasy football scores and keep player information current using ESPN's free API. The system provides real-time data synchronization, live scoring, and automated player updates.

## 🚀 **Key Features**

### **1. Live Score Updates**
- Real-time NFL game scores
- Automatic refresh every 30 seconds
- Live game status and timing
- Fantasy point calculations

### **2. Player Information Updates**
- Current NFL team assignments
- Injury status tracking
- Recent statistics and performance
- Jersey numbers and player details

### **3. Automated Data Synchronization**
- Caching system for performance
- Batch player updates
- Injury monitoring
- News and status updates

## 🔧 **How to Use the API Service**

### **Basic Setup**

```javascript
// The API service is automatically available globally
const apiService = window.fantasyAPIService;

// Or import it in your components
import FantasyAPIService from '../utils/apiService';
```

### **1. Getting Live Scores**

```javascript
// Get current live games
const liveGames = await apiService.getLiveGameData();

// Example response:
[
  {
    id: "gameId",
    homeTeam: { team: { name: "Kansas City Chiefs" }, score: "24" },
    awayTeam: { team: { name: "Buffalo Bills" }, score: "21" },
    status: { type: { description: "In Progress" } },
    time: "2024-01-15T20:00:00Z"
  }
]
```

### **2. Updating Player Information**

```javascript
// Update a single player
const updatedPlayer = await apiService.updatePlayerInfo("Patrick Mahomes", "QB");

// Example response:
{
  id: "playerId",
  name: "Patrick Mahomes",
  position: "QB",
  nflTeam: "KC",
  fantasyPoints: 28.5,
  stats: { /* detailed stats */ },
  status: "Active",
  lastUpdated: "2024-01-15T20:30:00Z"
}
```

### **3. Batch Player Updates**

```javascript
// Update multiple players at once
const players = [
  { name: "Patrick Mahomes", position: "QB" },
  { name: "Christian McCaffrey", position: "RB" },
  { name: "Justin Jefferson", position: "WR" }
];

const updates = await apiService.batchUpdatePlayers(players);
```

### **4. Injury Monitoring**

```javascript
// Get all injured players
const injuries = await apiService.getInjuryUpdates();

// Example response:
[
  {
    fullName: "Player Name",
    position: { abbreviation: "QB" },
    team: "Kansas City Chiefs",
    status: { description: "Questionable" }
  }
]
```

## 📊 **Fantasy Point Calculations**

The API service automatically calculates fantasy points based on player statistics:

### **Quarterback (QB)**
- Passing Yards: 1 point per 25 yards
- Passing Touchdowns: 4 points
- Rushing Yards: 1 point per 10 yards
- Rushing Touchdowns: 6 points
- Interceptions: -2 points

### **Running Back (RB) / Wide Receiver (WR) / Tight End (TE)**
- Rushing Yards: 1 point per 10 yards
- Rushing Touchdowns: 6 points
- Receiving Yards: 1 point per 10 yards
- Receiving Touchdowns: 6 points
- Receptions: 0.5 points

### **Kicker (K)**
- Field Goals: 3 points
- Extra Points: 1 point

### **Defensive Players (DL/LB/DB)**
- Tackles: 1 point
- Sacks: 2 points
- Interceptions: 3 points
- Fumble Recoveries: 2 points

## 🎯 **Integration Examples**

### **1. Enhanced Roster Component**

```javascript
import React, { useState, useEffect } from 'react';

const EnhancedRoster = ({ teamData, showMessage }) => {
    const [playerUpdates, setPlayerUpdates] = useState({});
    const [loading, setLoading] = useState(false);

    // Update player when component mounts
    useEffect(() => {
        const updatePlayer = async (playerName, position) => {
            try {
                const updated = await window.fantasyAPIService.updatePlayerInfo(playerName, position);
                if (updated) {
                    setPlayerUpdates(prev => ({
                        ...prev,
                        [playerName]: updated
                    }));
                }
            } catch (error) {
                console.error('Failed to update player:', error);
            }
        };

        // Update all players in roster
        teamData.roster.lineup.forEach(slot => {
            const player = getPlayerDetails(slot, allPlayers);
            if (player) {
                updatePlayer(player.name, player.position);
            }
        });
    }, [teamData]);

    return (
        <div>
            {teamData.roster.lineup.map(slot => {
                const player = getPlayerDetails(slot, allPlayers);
                const updated = playerUpdates[player?.name];
                
                return (
                    <div key={slot} className="player-card">
                        <div className="player-name">{player.name}</div>
                        <div className="player-info">
                            {updated ? (
                                <>
                                    <span>{updated.position} - {updated.nflTeam}</span>
                                    <span className="fantasy-points">{updated.fantasyPoints} pts</span>
                                    <span className="status">{updated.status}</span>
                                </>
                            ) : (
                                <span>{player.position} - {player.nflTeam}</span>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
```

### **2. Live Scoring Dashboard**

```javascript
const LiveScoringDashboard = () => {
    const [liveGames, setLiveGames] = useState([]);
    const [autoRefresh, setAutoRefresh] = useState(true);

    useEffect(() => {
        const loadScores = async () => {
            try {
                const games = await window.fantasyAPIService.getLiveGameData();
                setLiveGames(games);
            } catch (error) {
                console.error('Failed to load scores:', error);
            }
        };

        loadScores();

        if (autoRefresh) {
            const interval = setInterval(loadScores, 30000);
            return () => clearInterval(interval);
        }
    }, [autoRefresh]);

    return (
        <div className="live-scores">
            <h2>Live NFL Scores</h2>
            {liveGames.map(game => (
                <div key={game.id} className="game-card">
                    <div className="teams">
                        <span>{game.awayTeam.team.name} {game.score.away}</span>
                        <span>vs</span>
                        <span>{game.homeTeam.team.name} {game.score.home}</span>
                    </div>
                    <div className="status">{game.status.type.description}</div>
                </div>
            ))}
        </div>
    );
};
```

### **3. Injury Alert System**

```javascript
const InjuryAlerts = () => {
    const [injuries, setInjuries] = useState([]);

    useEffect(() => {
        const loadInjuries = async () => {
            try {
                const injuryData = await window.fantasyAPIService.getInjuryUpdates();
                setInjuries(injuryData);
            } catch (error) {
                console.error('Failed to load injuries:', error);
            }
        };

        loadInjuries();
        const interval = setInterval(loadInjuries, 60000); // Check every minute
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="injury-alerts">
            <h3>Injury Updates</h3>
            {injuries.map((player, index) => (
                <div key={index} className="injury-card">
                    <div className="player-name">{player.fullName}</div>
                    <div className="player-info">
                        {player.position.abbreviation} - {player.team}
                    </div>
                    <div className="status">{player.status.description}</div>
                </div>
            ))}
        </div>
    );
};
```

## 🔄 **Real-time Updates**

### **1. Automatic Refresh**

```javascript
// Start automatic updates
apiService.startLiveUpdates((liveData) => {
    console.log('Live data updated:', liveData);
    // Update your UI with new data
}, 30000); // Update every 30 seconds

// Stop updates
apiService.stopLiveUpdates();
```

### **2. Subscription System**

```javascript
// Subscribe to updates
const unsubscribe = apiService.subscribe((data) => {
    // Handle new data
    updateUI(data);
});

// Unsubscribe when component unmounts
useEffect(() => {
    return unsubscribe;
}, []);
```

## 📈 **Performance Optimization**

### **1. Caching**

The API service includes intelligent caching:
- 5-minute cache timeout for most requests
- Automatic cache invalidation
- Cache statistics monitoring

```javascript
// Check cache status
const cacheStats = apiService.getCacheStats();
console.log('Cache size:', cacheStats.size);

// Clear cache if needed
apiService.clearCache();
```

### **2. Batch Operations**

For better performance, use batch operations:

```javascript
// Update multiple players efficiently
const players = [
    { name: "Player 1", position: "QB" },
    { name: "Player 2", position: "RB" },
    // ... more players
];

const updates = await apiService.batchUpdatePlayers(players);
```

## 🛠 **Error Handling**

```javascript
try {
    const data = await apiService.getLiveGameData();
    // Handle successful data
} catch (error) {
    console.error('API Error:', error);
    
    // Fallback to cached data or show error message
    if (error.message.includes('429')) {
        showMessage('Rate limit exceeded. Please wait before trying again.', 'error');
    } else {
        showMessage('Failed to load data. Please try again.', 'error');
    }
}
```

## 🎮 **Integration with Your Fantasy App**

### **1. Add to Your Main App**

```javascript
// In your main App.js or similar
import LiveScores from './components/LiveScores';

// Add to your navigation
{activeTab === 'live-scores' && <LiveScores showMessage={showMessage} />}
```

### **2. Update Player Database**

```javascript
// Sync your player database with API data
const syncPlayerDatabase = async (players) => {
    const updates = await apiService.batchUpdatePlayers(players);
    
    // Update your local database
    updates.forEach(player => {
        // Update player in your database
        updatePlayerInDatabase(player);
    });
};
```

### **3. Real-time Fantasy Scoring**

```javascript
// Calculate fantasy points for your league
const calculateFantasyPoints = (player, leagueSettings) => {
    const basePoints = apiService.calculateFantasyPoints(player.stats, player.position);
    
    // Apply league-specific scoring rules
    return applyLeagueScoring(basePoints, leagueSettings);
};
```

## 📱 **Mobile Considerations**

### **1. Reduced Update Frequency**

```javascript
// Use less frequent updates on mobile
const isMobile = window.innerWidth < 768;
const updateInterval = isMobile ? 60000 : 30000; // 1 min vs 30 sec

apiService.startLiveUpdates(callback, updateInterval);
```

### **2. Offline Support**

```javascript
// Check for cached data when offline
const getCachedData = () => {
    const cacheStats = apiService.getCacheStats();
    if (cacheStats.size > 0) {
        // Use cached data
        return getCachedPlayerData();
    }
    return null;
};
```

## 🚀 **Next Steps**

1. **Test the API Integration** - Use the LiveScores component
2. **Customize Scoring Rules** - Modify the fantasy point calculations
3. **Add More Data Sources** - Integrate additional APIs for news, weather, etc.
4. **Implement Push Notifications** - Alert users to important updates
5. **Add Historical Data** - Track player performance over time

The API service is now ready to provide real-time updates for your fantasy football application! 🏈 