# 🧪 Cloud Function Testing Guide

## 🎯 How to Test Your Smart Cloud Functions

Your fantasy football app now has **intelligent Cloud Functions** that only run when there are actual NFL games happening! Here's how to test everything:

---

## 🚀 **Quick Start Testing**

### **1. Visit Your App**
🌐 **URL**: https://dynasty-420.web.app

### **2. Navigate to Cloud Test Tab**
- Click on the **"Cloud Test"** tab in the navigation
- This opens the **Cloud Function Tester** interface

### **3. Check Current Conditions**
The tester will automatically show you:
- ✅ **NFL Season**: Is it currently NFL season?
- ✅ **Game Day**: Is it Thursday, Sunday, or Monday?
- ✅ **Game Hours**: Is it between 1 PM - 11 PM ET?
- ✅ **Live Games**: Are there currently live games?

---

## 🔍 **Testing Methods**

### **Method 1: Built-in Tester (Recommended)**
1. **Open Cloud Test Tab** in your app
2. **View Real-time Conditions** - updates every 30 seconds
3. **Test Manual Updates** - force score updates regardless of conditions
4. **Monitor Results** - see detailed JSON responses

### **Method 2: Direct API Testing**
```bash
# Check current conditions
curl https://us-central1-dynasty-420.cloudfunctions.net/checkConditions

# Force manual score update (replace YOUR_LEAGUE_ID)
curl "https://us-central1-dynasty-420.cloudfunctions.net/manualScoreUpdate?leagueId=YOUR_LEAGUE_ID"
```

### **Method 3: Firebase Console Monitoring**
1. Go to [Firebase Console](https://console.firebase.google.com/project/dynasty-420)
2. Navigate to **Functions** → **Logs**
3. Watch real-time function execution logs

---

## 📊 **What Each Test Shows**

### **✅ Conditions Check**
```json
{
  "isNFLSeason": true,
  "isGameDay": true,
  "isGameTime": true,
  "hasLiveGames": true,
  "currentWeek": 5,
  "currentTime": "14:30:00",
  "currentDay": "Sunday"
}
```

### **✅ Manual Score Update**
```json
{
  "success": true,
  "message": "Scores updated successfully",
  "conditions": {
    "isNFLSeason": true,
    "isGameDay": true,
    "isGameTime": true,
    "hasLiveGames": true
  }
}
```

---

## 🎮 **Testing Scenarios**

### **Scenario 1: During NFL Season (Game Day)**
**Expected Behavior:**
- ✅ Functions run every 5 minutes
- ✅ Live score updates
- ✅ Real-time player stats
- ✅ Automatic injury monitoring

**Test Steps:**
1. Visit app during Sunday 1-11 PM ET
2. Check "Live Scores" tab for live games
3. Monitor Cloud Test conditions
4. Watch Firebase Console logs

### **Scenario 2: During NFL Season (Non-Game Day)**
**Expected Behavior:**
- ❌ Functions skip execution
- ✅ No unnecessary API calls
- ✅ Cost savings
- ✅ Ready for next game

**Test Steps:**
1. Visit app on Tuesday/Wednesday
2. Check Cloud Test conditions
3. Verify functions don't run
4. Monitor cost savings

### **Scenario 3: Off Season**
**Expected Behavior:**
- ❌ Functions skip execution
- ✅ Minimal cost
- ✅ No wasted resources
- ✅ Ready for next season

**Test Steps:**
1. Test during off-season months
2. Verify minimal function activity
3. Check cost optimization

---

## 🔧 **Advanced Testing**

### **1. Monitor Function Logs**
```bash
# View recent function executions
firebase functions:log --only updateFantasyScores

# View all function logs
firebase functions:log
```

### **2. Check Function Status**
```bash
# List all deployed functions
firebase functions:list
```

### **3. Test Individual Functions**
```bash
# Test conditions check
curl -X GET https://us-central1-dynasty-420.cloudfunctions.net/checkConditions

# Test manual score update
curl -X GET "https://us-central1-dynasty-420.cloudfunctions.net/manualScoreUpdate?leagueId=test-league"
```

---

## 📈 **Performance Monitoring**

### **Cost Tracking**
- **During Games**: ~$5-10/month
- **Off Season**: ~$1-2/month
- **Savings**: 50-80% cost reduction

### **Function Metrics**
- **updateFantasyScores**: Every 5 minutes (when conditions met)
- **updatePlayerStats**: Every hour (NFL season only)
- **monitorInjuries**: Daily (NFL season only)

---

## 🐛 **Troubleshooting**

### **Common Issues**

#### **Issue: Functions Not Running**
**Check:**
1. Is it NFL season? (Sept 5 - Feb 9)
2. Is it a game day? (Thu/Sun/Mon)
3. Is it during game hours? (1-11 PM ET)
4. Are there live games?

#### **Issue: Manual Update Fails**
**Check:**
1. Valid League ID provided?
2. League exists in database?
3. Network connectivity?

#### **Issue: API Errors**
**Check:**
1. ESPN API availability
2. Rate limiting
3. Network connectivity

### **Debug Steps**
1. **Check Cloud Test conditions**
2. **Review Firebase Console logs**
3. **Test manual endpoints**
4. **Verify league data**

---

## 🎯 **Expected Results**

### **During Live Games:**
```
✅ NFL Season: true
✅ Game Day: true  
✅ Game Hours: true
✅ Live Games: true
🔄 Functions: Running every 5 minutes
💰 Cost: Normal operation
```

### **During Off-Season:**
```
❌ NFL Season: false
❌ Game Day: false
❌ Game Hours: false
❌ Live Games: false
⏸️ Functions: Skipped
💰 Cost: Minimal
```

---

## 🚀 **Ready to Test!**

Your smart Cloud Functions are now live and ready for testing! 

**Visit**: https://dynasty-420.web.app
**Navigate to**: Cloud Test tab
**Start Testing**: Check conditions and run manual updates

The functions will automatically optimize themselves based on the NFL schedule, saving you money while providing real-time updates during games! 🏈 