# 🏈 API Usage Summary: Real-time Fantasy Football Data

## 📋 **What You Can Do With APIs**

### **1. Live Score Updates**
- Get real-time NFL game scores
- Track game status (In Progress, Halftime, Final)
- Monitor game timing and schedules
- Calculate fantasy points automatically

### **2. Player Information Updates**
- Update player NFL team assignments
- Track injury status and availability
- Get current statistics and performance
- Monitor player news and updates

### **3. Automated Data Synchronization**
- Cache API responses for performance
- Batch update multiple players
- Real-time injury monitoring
- Automatic refresh every 30 seconds

## 🚀 **How to Use the API Service**

### **Basic Setup**
The API service is automatically available in your app:
```javascript
// Access the API service
const apiService = window.fantasyAPIService;
```

### **Key Functions**

#### **1. Get Live Scores**
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

#### **2. Update Player Information**
```javascript
// Update a single player
const updatedPlayer = await apiService.updatePlayerInfo("Patrick Mahomes", "QB");

// Returns:
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

#### **3. Batch Update Players**
```javascript
// Update multiple players efficiently
const players = [
  { name: "Patrick Mahomes", position: "QB" },
  { name: "Christian McCaffrey", position: "RB" },
  { name: "Justin Jefferson", position: "WR" }
];

const updates = await apiService.batchUpdatePlayers(players);
```

#### **4. Get Injury Updates**
```javascript
// Get all injured players
const injuries = await apiService.getInjuryUpdates();

// Returns array of injured players with status
```

## 📊 **Fantasy Point Calculations**

The API automatically calculates fantasy points:

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

### **1. Enhanced Roster Display**
```javascript
// In your roster component
const [playerUpdates, setPlayerUpdates] = useState({});

useEffect(() => {
    // Update players when component mounts
    teamData.roster.lineup.forEach(slot => {
        const player = getPlayerDetails(slot, allPlayers);
        if (player) {
            apiService.updatePlayerInfo(player.name, player.position)
                .then(updated => {
                    if (updated) {
                        setPlayerUpdates(prev => ({
                            ...prev,
                            [player.name]: updated
                        }));
                    }
                });
        }
    });
}, [teamData]);
```

### **2. Live Scoring Dashboard**
```javascript
const [liveGames, setLiveGames] = useState([]);

useEffect(() => {
    const loadScores = async () => {
        const games = await apiService.getLiveGameData();
        setLiveGames(games);
    };

    loadScores();
    const interval = setInterval(loadScores, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
}, []);
```

### **3. Injury Monitoring**
```javascript
const [injuries, setInjuries] = useState([]);

useEffect(() => {
    const loadInjuries = async () => {
        const injuryData = await apiService.getInjuryUpdates();
        setInjuries(injuryData);
    };

    loadInjuries();
    const interval = setInterval(loadInjuries, 60000); // Check every minute
    return () => clearInterval(interval);
}, []);
```

## 🔄 **Real-time Updates**

### **Automatic Refresh**
```javascript
// Start automatic updates
apiService.startLiveUpdates((liveData) => {
    console.log('Live data updated:', liveData);
    // Update your UI with new data
}, 30000); // Update every 30 seconds

// Stop updates
apiService.stopLiveUpdates();
```

### **Subscription System**
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

### **Caching**
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

### **Batch Operations**
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

## 🎮 **Integration with Your App**

### **1. Add Live Scores Tab**
```javascript
// In your navigation
{['Roster', 'Draft Center', 'Waiver Wire', 'Trade', 'Standings', 'Live Scores'].map(tab => (
    <li key={tab.toLowerCase().replace(' ', '-')}>
        <button onClick={() => setActiveTab(tab.toLowerCase().replace(' ', '-'))}>
            {tab}
        </button>
    </li>
))}
```

### **2. Add Live Scores Component**
```javascript
// In your main content area
{activeTab === 'live-scores' && <LiveScores showMessage={showMessage} />}
```

### **3. Update Player Database**
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

## 📱 **Mobile Considerations**

### **Reduced Update Frequency**
```javascript
// Use less frequent updates on mobile
const isMobile = window.innerWidth < 768;
const updateInterval = isMobile ? 60000 : 30000; // 1 min vs 30 sec

apiService.startLiveUpdates(callback, updateInterval);
```

### **Offline Support**
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

## 🚀 **Available Components**

### **1. LiveScores Component**
- Real-time NFL scores
- Player updates with fantasy points
- Injury monitoring
- API status and cache management

### **2. APIDemo Component**
- Interactive demo of API functionality
- Code examples
- Usage instructions

### **3. Enhanced Roster Component**
- Real-time player updates
- Fantasy point calculations
- Injury status tracking

## 📚 **Documentation Files**

### **1. API_INTEGRATION_GUIDE.md**
- Comprehensive guide with examples
- Integration patterns
- Best practices

### **2. ESPN_API_GUIDE.md**
- ESPN API endpoint documentation
- Free API usage
- Data structure examples

### **3. API_USAGE_SUMMARY.md** (this file)
- Quick reference guide
- Key functions and examples
- Integration tips

## 🎯 **Next Steps**

1. **Test the API Integration** - Use the LiveScores component
2. **Customize Scoring Rules** - Modify fantasy point calculations
3. **Add More Data Sources** - Integrate additional APIs
4. **Implement Push Notifications** - Alert users to updates
5. **Add Historical Data** - Track performance over time

The API service is now ready to provide real-time updates for your fantasy football application! 🏈 