# 🏈 Background Scoring System Guide

## 📋 **Overview**

The Background Scoring System automatically updates fantasy team scores using live player stats from ESPN's API and your league's custom scoring rules. It runs silently in the background, updating scores every 30 seconds.

## 🚀 **How It Works**

### **1. Automatic Score Updates**
- Runs every 30 seconds in the background
- Fetches live player stats from ESPN API
- Applies your league's scoring rules
- Updates team scores and standings automatically
- No user interaction required

### **2. Scoring Rules Integration**
Uses your league's custom scoring rules:
```javascript
// Example scoring rules from your league
{
    passTd: 4,           // Passing touchdowns
    rushTd: 6,           // Rushing touchdowns
    recTd: 6,            // Receiving touchdowns
    passYard: 0.05,      // Passing yards per point
    rushRecYard: 0.2,    // Rushing/receiving yards per point
    reception: 1,         // Points per reception
    tackle: 2,           // Defensive tackles
    sack: -1,            // QB sacks (negative)
    interception: -2,     // QB interceptions (negative)
    // ... and many more
}
```

### **3. Real-time Player Stats**
Gets live stats for each player:
- **QB**: Passing yards, touchdowns, interceptions, rushing stats
- **RB/WR/TE**: Rushing yards, receiving yards, touchdowns, receptions
- **K**: Field goals, extra points
- **Defense**: Tackles, sacks, interceptions, fumble recoveries

## 🔧 **Integration**

### **1. Add to Your App**

The background scoring system is automatically available:
```javascript
// Access the background scoring system
const backgroundScoring = window.backgroundScoring;
```

### **2. Start Background Scoring**

```javascript
// Start with your league
backgroundScoring.start(db, [currentLeague]);

// Add more leagues
backgroundScoring.addLeague(anotherLeague);

// Remove a league
backgroundScoring.removeLeague(leagueId);
```

### **3. Monitor Status**

```javascript
// Get system status
const status = backgroundScoring.getStatus();
console.log('Status:', status);
// Returns: { isRunning, activeLeagues, lastUpdate, currentWeek, playerStatsCache }
```

## 📊 **Score Calculation Examples**

### **Quarterback Example**
```javascript
// Patrick Mahomes stats
{
    passingYards: 350,
    passingTouchdowns: 3,
    interceptions: 1,
    rushingYards: 25,
    rushingTouchdowns: 1
}

// Score calculation with your rules
const score = (350 * 0.05) + (3 * 4) + (1 * -2) + (25 * 0.2) + (1 * 6);
// = 17.5 + 12 - 2 + 5 + 6 = 38.5 points
```

### **Running Back Example**
```javascript
// Christian McCaffrey stats
{
    rushingYards: 120,
    rushingTouchdowns: 2,
    receivingYards: 45,
    receptions: 6
}

// Score calculation
const score = (120 * 0.2) + (2 * 6) + (45 * 0.2) + (6 * 1);
// = 24 + 12 + 9 + 6 = 51 points
```

## 🎯 **Features**

### **1. Automatic Updates**
- Updates every 30 seconds during games
- Caches player stats for 5 minutes
- Handles API rate limits gracefully
- Continues running even if some updates fail

### **2. League Integration**
- Uses your league's exact scoring rules
- Updates all teams in the league
- Maintains standings automatically
- Tracks weekly performance

### **3. Performance Optimization**
- Intelligent caching system
- Batch updates for efficiency
- Error handling and recovery
- Memory management

## 🛠 **Usage Examples**

### **1. Start Background Scoring**
```javascript
// In your main app component
useEffect(() => {
    if (db && currentLeague) {
        window.backgroundScoring.start(db, [currentLeague]);
    }
}, [db, currentLeague]);
```

### **2. Monitor Scores**
```javascript
// Check if scores are being updated
const checkScores = () => {
    const status = window.backgroundScoring.getStatus();
    if (status.isRunning) {
        console.log('Scores updated at:', status.lastUpdate);
    }
};
```

### **3. Force Manual Update**
```javascript
// Force immediate score update
const forceUpdate = async () => {
    await window.backgroundScoring.updateAllLeagueScores();
    console.log('Scores updated manually');
};
```

## 📱 **Component Integration**

### **1. Add Background Scoring Manager**
```javascript
// In your commissioner tools or settings
import BackgroundScoringManager from './components/BackgroundScoringManager';

// Add to your component
<BackgroundScoringManager 
    db={db} 
    currentLeague={currentLeague} 
    showMessage={showMessage} 
/>
```

### **2. Display Live Scores**
```javascript
// Show current team scores
const TeamScores = ({ team }) => {
    const [score, setScore] = useState(team.currentScore);

    useEffect(() => {
        // Update when background scoring updates
        const interval = setInterval(() => {
            if (team.currentScore?.lastUpdated !== score?.lastUpdated) {
                setScore(team.currentScore);
            }
        }, 5000);
        return () => clearInterval(interval);
    }, [team.currentScore]);

    return (
        <div>
            <h3>{team.name}</h3>
            <p>Total Points: {score?.totalPoints || 0}</p>
            <p>Last Updated: {score?.lastUpdated ? new Date(score.lastUpdated).toLocaleTimeString() : 'Never'}</p>
        </div>
    );
};
```

## 🔄 **Background Process**

### **1. Data Flow**
```
ESPN API → Player Stats → Scoring Rules → Team Scores → Database
```

### **2. Update Cycle**
1. **Every 30 seconds**: Check for new player stats
2. **For each player**: Calculate fantasy points using league rules
3. **For each team**: Sum up all player scores
4. **Update database**: Save new scores and standings
5. **Cache results**: Store for 5 minutes to reduce API calls

### **3. Error Handling**
- If ESPN API fails: Use cached data
- If database fails: Retry on next cycle
- If player not found: Skip and continue
- If scoring rules missing: Use defaults

## 📈 **Performance Monitoring**

### **1. Status Dashboard**
```javascript
const ScoringStatus = () => {
    const [status, setStatus] = useState(null);

    useEffect(() => {
        const interval = setInterval(() => {
            setStatus(window.backgroundScoring.getStatus());
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div>
            <p>Status: {status?.isRunning ? 'Running' : 'Stopped'}</p>
            <p>Active Leagues: {status?.activeLeagues}</p>
            <p>Cache Size: {status?.playerStatsCache} players</p>
            <p>Last Update: {status?.lastUpdate ? new Date(status.lastUpdate).toLocaleString() : 'Never'}</p>
        </div>
    );
};
```

### **2. Cache Management**
```javascript
// Clear cache if needed
window.backgroundScoring.clearCache();

// Check cache size
const status = window.backgroundScoring.getStatus();
console.log('Cached players:', status.playerStatsCache);
```

## 🎮 **Commissioner Controls**

### **1. Start/Stop Scoring**
```javascript
// Start background scoring
window.backgroundScoring.start(db, [league]);

// Stop background scoring
window.backgroundScoring.stop();
```

### **2. Add/Remove Leagues**
```javascript
// Add a league to background scoring
window.backgroundScoring.addLeague(newLeague);

// Remove a league from background scoring
window.backgroundScoring.removeLeague(leagueId);
```

### **3. Force Updates**
```javascript
// Force immediate score update
await window.backgroundScoring.updateAllLeagueScores();
```

## 🚀 **Benefits**

### **1. Real-time Updates**
- No manual score entry required
- Live updates during games
- Accurate fantasy point calculations

### **2. League Customization**
- Uses your exact scoring rules
- Supports all position types
- Handles complex scoring scenarios

### **3. Performance**
- Efficient caching system
- Minimal API usage
- Background operation

### **4. Reliability**
- Error handling and recovery
- Graceful degradation
- Continuous operation

The background scoring system is now ready to automatically update your fantasy team scores using live player stats and your league's scoring rules! 🏈 