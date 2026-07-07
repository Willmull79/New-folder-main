# 🔌 API Integration Guide

## 📋 **Quick Start - Adding APIs to Your App**

### **1. Free APIs You Can Use Right Now:**

#### **Sports Data APIs:**
- **ESPN API** - Free NFL data
- **SportsData.io** - Free tier available
- **MySportsFeeds** - Free tier available

#### **Weather APIs:**
- **OpenWeatherMap** - Free tier (1000 calls/day)
- **WeatherAPI.com** - Free tier available

#### **News APIs:**
- **NewsAPI.org** - Free tier available
- **GNews API** - Free tier available

### **2. How to Add an API Key:**

1. **Get your API key** from the service provider
2. **Add it to `api.js`** in the `apiKeys` object:

```javascript
this.apiKeys = {
    sportsData: 'YOUR_SPORTS_DATA_API_KEY',
    weather: 'YOUR_WEATHER_API_KEY',
    news: 'YOUR_NEWS_API_KEY'
};
```

### **3. Example API Calls:**

#### **Get NFL Teams:**
```javascript
const teams = await window.apiService.getNFLTeams();
```

#### **Get Player Stats:**
```javascript
const stats = await window.apiService.getPlayerStats('playerId');
```

#### **Get Weather:**
```javascript
const weather = await window.apiService.getWeather('Kansas City');
```

### **4. Adding New API Methods:**

Add new methods to the `APIService` class in `api.js`:

```javascript
// Example: Get injury reports
async getInjuryReports() {
    const url = 'https://api.sportsdata.io/v3/nfl/injuries/json/Injuries';
    return this.makeRequest(url);
}

// Example: Get game schedules
async getGameSchedule(season) {
    const url = `https://api.sportsdata.io/v3/nfl/scores/json/Schedules/${season}`;
    return this.makeRequest(url);
}
```

### **5. Using APIs in React Components:**

```javascript
const MyComponent = ({ showMessage }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        try {
            const result = await window.apiService.getNFLTeams();
            setData(result);
            showMessage("Data loaded successfully!", "success");
        } catch (error) {
            showMessage("Failed to load data.", "error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <button onClick={fetchData} disabled={loading}>
                {loading ? 'Loading...' : 'Load Data'}
            </button>
            {data && <pre>{JSON.stringify(data, null, 2)}</pre>}
        </div>
    );
};
```

## 🚀 **Popular APIs for Fantasy Football:**

### **1. Sports Data APIs:**
- **ESPN API** - Free, no key required
- **SportsData.io** - Comprehensive NFL data
- **MySportsFeeds** - Real-time stats
- **Pro Football Reference** - Historical data

### **2. Weather APIs:**
- **OpenWeatherMap** - Game day weather
- **WeatherAPI.com** - Detailed forecasts
- **AccuWeather** - Professional grade

### **3. News APIs:**
- **NewsAPI.org** - Player injury news
- **GNews API** - Sports headlines
- **Bing News Search** - Microsoft's news API

## 🔧 **Advanced API Integration:**

### **1. Firebase Functions (Backend API):**
```javascript
// Create a Firebase Function to proxy API calls
exports.getPlayerStats = functions.https.onCall(async (data, context) => {
    const playerId = data.playerId;
    const response = await fetch(`https://api.example.com/players/${playerId}`);
    return response.json();
});
```

### **2. CORS Issues:**
If you get CORS errors, use a proxy:
```javascript
// Use a CORS proxy
const url = `https://cors-anywhere.herokuapp.com/https://api.example.com/data`;
```

### **3. Rate Limiting:**
```javascript
// Add rate limiting to your API calls
class RateLimitedAPI {
    constructor() {
        this.lastCall = 0;
        this.minInterval = 1000; // 1 second between calls
    }

    async makeRequest(url) {
        const now = Date.now();
        if (now - this.lastCall < this.minInterval) {
            await new Promise(resolve => setTimeout(resolve, this.minInterval));
        }
        this.lastCall = Date.now();
        return fetch(url);
    }
}
```

## 📊 **Example: Real NFL Data Integration**

Here's how to integrate real NFL data into your fantasy app:

```javascript
// Add this to your existing player data
const enhancePlayerData = async (playerId) => {
    try {
        const realStats = await window.apiService.getPlayerStats(playerId);
        return {
            ...playerData,
            realStats: realStats,
            lastUpdated: new Date().toISOString()
        };
    } catch (error) {
        console.error('Failed to get real stats:', error);
        return playerData; // Fallback to existing data
    }
};
```

## 🛡️ **Security Best Practices:**

1. **Never expose API keys in client-side code** (for sensitive APIs)
2. **Use Firebase Functions** for sensitive API calls
3. **Implement rate limiting** to avoid API abuse
4. **Add error handling** for API failures
5. **Use environment variables** for API keys in production

## 📝 **Next Steps:**

1. **Choose an API** from the list above
2. **Get an API key** from the provider
3. **Add the key** to your `api.js` file
4. **Test the integration** with the demo component
5. **Integrate into your app** where needed

Your app now has a complete API integration framework! 🎉 