# ESPN API Integration with Google Cloud Functions

This guide explains how the Fantasy Dynasty Central app uses Google Cloud Functions to retrieve and store ESPN API data for NFL players, teams, games, and scoring updates.

## 🏗️ Architecture Overview

### **Data Flow**
```
ESPN API → Google Cloud Functions → Firebase Firestore → React Frontend
```

### **Components**
- **ESPN API**: Source of NFL data (teams, players, games, stats)
- **Google Cloud Functions**: Serverless functions that fetch and process data
- **Firebase Firestore**: Database for storing processed data
- **React Frontend**: Displays data to users

## 📊 Data Collections

### **Firestore Collections**
- `players` - NFL player information
- `teams` - NFL team information  
- `games` - Game schedules and scores
- `player_stats` - Individual player statistics
- `scores` - Fantasy scoring data
- `data_updates` - Update logs and status

## ⏰ Scheduled Updates

### **Daily Updates**
- **Teams**: 6:00 AM EST - Updates all NFL team information
- **Players**: 7:00 AM EST - Updates all NFL player information

### **Hourly Updates**
- **Games**: Every hour - Updates game schedules and scores

### **Game Day Updates**
- **Player Stats**: Every 15 minutes (Thu-Sun) - Updates player statistics during live games

### **Weekly Updates**
- **Full Data**: Sunday 5:00 AM EST - Complete data refresh

## 🚀 Deployment

### **1. Deploy Functions**
```bash
# Deploy all functions
deploy-functions.bat

# Or manually
cd functions
npm install
firebase deploy --only functions
```

### **2. Verify Deployment**
```bash
# Check function status
firebase functions:list

# View logs
firebase functions:log
```

## 🔧 Manual Updates

### **HTTP Endpoints**
All functions provide HTTP endpoints for manual updates:

```
https://your-project.cloudfunctions.net/manualUpdate?type=teams
https://your-project.cloudfunctions.net/manualUpdate?type=players
https://your-project.cloudfunctions.net/manualUpdate?type=games
https://your-project.cloudfunctions.net/manualUpdate?type=stats
https://your-project.cloudfunctions.net/manualUpdate?type=all
```

### **Check Update Status**
```
https://your-project.cloudfunctions.net/getUpdateStatus
```

## 📈 Data Structure

### **Player Data**
```javascript
{
  id: "player_id",
  name: "Player Name",
  firstName: "First",
  lastName: "Last",
  position: "QB",
  positionName: "Quarterback",
  teamId: "team_id",
  teamName: "Team Name",
  jersey: "12",
  height: "6-2",
  weight: "220",
  age: 25,
  college: "University Name",
  headshot: "image_url",
  status: "Active",
  lastUpdated: timestamp
}
```

### **Team Data**
```javascript
{
  id: "team_id",
  name: "Team Name",
  abbreviation: "TM",
  location: "City",
  nickname: "Nickname",
  color: "#000000",
  alternateColor: "#FFFFFF",
  logo: "logo_url",
  conference: "Conference",
  division: "Division",
  lastUpdated: timestamp
}
```

### **Game Data**
```javascript
{
  id: "game_id",
  name: "Game Name",
  date: "2024-01-01T20:00:00Z",
  status: { type: { description: "Final" } },
  homeTeam: {
    id: "home_team_id",
    name: "Home Team",
    score: "24"
  },
  awayTeam: {
    id: "away_team_id", 
    name: "Away Team",
    score: "21"
  },
  week: 1,
  season: 2024,
  lastUpdated: timestamp
}
```

## 🔄 Update Process

### **1. Data Retrieval**
- Functions fetch data from ESPN API endpoints
- Handle rate limiting and error responses
- Parse and validate data structure

### **2. Data Processing**
- Transform ESPN data to internal format
- Calculate fantasy points based on scoring rules
- Add metadata (timestamps, update status)

### **3. Data Storage**
- Store in Firebase Firestore collections
- Use batch operations for efficiency
- Maintain data consistency

### **4. Logging**
- Log all update operations
- Track success/failure rates
- Monitor data freshness

## 🛠️ Configuration

### **Environment Variables**
```bash
# Firebase project configuration
FIREBASE_PROJECT_ID=your-project-id

# ESPN API configuration
ESPN_BASE_URL=https://site.api.espn.com/apis/site/v2/sports/football/nfl

# Update schedules
TEAMS_UPDATE_SCHEDULE="0 6 * * *"
PLAYERS_UPDATE_SCHEDULE="0 7 * * *"
GAMES_UPDATE_SCHEDULE="0 * * * *"
STATS_UPDATE_SCHEDULE="*/15 * * * 0,4,5,6"
```

### **Scoring Rules**
```javascript
const FANTASY_SCORING_RULES = {
    // Passing
    passTd: 4,
    passYard: 0.05,
    pass300YardBonus: 2,
    pass400YardBonus: 4,
    interception: -2,
    
    // Rushing/Receiving
    rushTd: 6,
    recTd: 6,
    rushRecYard: 0.2,
    rushRec100YardBonus: 2,
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
    fumbleRecoveryDef: 4
};
```

## 📊 Monitoring

### **Function Logs**
```bash
# View real-time logs
firebase functions:log

# View specific function logs
firebase functions:log --only updateTeamsDaily
```

### **Data Quality Checks**
- Verify data completeness
- Check for missing players/teams
- Validate scoring calculations
- Monitor update frequency

### **Performance Metrics**
- Function execution time
- API response times
- Data storage efficiency
- Error rates

## 🔧 Troubleshooting

### **Common Issues**

1. **Rate Limiting**
   - Add delays between API calls
   - Implement exponential backoff
   - Use batch operations

2. **Data Inconsistencies**
   - Validate data before storage
   - Implement data versioning
   - Use transaction operations

3. **Function Timeouts**
   - Optimize data processing
   - Use streaming for large datasets
   - Implement pagination

### **Debug Commands**
```bash
# Test functions locally
firebase emulators:start --only functions

# Deploy specific function
firebase deploy --only functions:updateTeamsDaily

# View function configuration
firebase functions:config:get
```

## 🚀 Next Steps

### **Enhancements**
- Add more ESPN API endpoints
- Implement data caching
- Add real-time notifications
- Create data analytics dashboard

### **Optimizations**
- Parallel data processing
- Incremental updates
- Data compression
- Advanced error handling

## 📚 Resources

- [ESPN API Documentation](https://site.api.espn.com/apis/site/v2/sports/football/nfl)
- [Firebase Functions Documentation](https://firebase.google.com/docs/functions)
- [Google Cloud Functions Documentation](https://cloud.google.com/functions/docs)
- [Firestore Documentation](https://firebase.google.com/docs/firestore) 