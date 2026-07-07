# Fantasy Football Backend API

A comprehensive REST API and WebSocket server for the Fantasy Dynasty Central platform, built with Node.js, Express, MongoDB, and Redis.

## 🚀 Features

- **Authentication & Authorization**: JWT-based authentication with role-based access control
- **Real-time Updates**: WebSocket integration for live scoring, draft, auction, and trade updates
- **Database Management**: MongoDB with Redis caching for optimal performance
- **Background Jobs**: Automated scoring updates, player stats, and injury monitoring
- **Rate Limiting**: API rate limiting and WebSocket event throttling
- **Email Notifications**: Automated email notifications for various events
- **File Upload**: Image upload support for avatars and team logos
- **Comprehensive Validation**: Request validation using Joi schemas
- **Error Handling**: Centralized error handling with detailed logging
- **Health Monitoring**: Database health checks and system monitoring

## 📋 Prerequisites

- Node.js 18+ 
- MongoDB 5.0+
- Redis 6.0+ (optional but recommended)
- SMTP server for email notifications

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   cp config.env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   # Server Configuration
   NODE_ENV=development
   PORT=3001
   FRONTEND_URL=http://localhost:3000

   # Database Configuration
   MONGODB_URI=mongodb://localhost:27017/fantasy_football
   REDIS_URL=redis://localhost:6379

   # JWT Configuration
   JWT_SECRET=your-super-secret-jwt-key-here
   JWT_EXPIRES_IN=7d

   # Email Configuration
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-email-password
   ```

4. **Start the server**
   ```bash
   # Development
   npm run dev

   # Production
   npm start
   ```

## 📚 API Documentation

### Authentication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register a new user |
| POST | `/api/auth/login` | Login user |
| POST | `/api/auth/verify-email` | Verify email address |
| POST | `/api/auth/forgot-password` | Send password reset email |
| POST | `/api/auth/reset-password` | Reset password with token |
| GET | `/api/auth/me` | Get current user profile |
| PUT | `/api/auth/profile` | Update user profile |
| PUT | `/api/auth/change-password` | Change user password |
| POST | `/api/auth/logout` | Logout user |
| DELETE | `/api/auth/account` | Delete user account |

### League Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/leagues` | Get user's leagues |
| POST | `/api/leagues` | Create a new league |
| GET | `/api/leagues/:id` | Get league details |
| PUT | `/api/leagues/:id` | Update league settings |
| DELETE | `/api/leagues/:id` | Delete league |
| POST | `/api/leagues/:id/join` | Join league with invite code |
| POST | `/api/leagues/:id/leave` | Leave league |
| GET | `/api/leagues/:id/standings` | Get league standings |
| GET | `/api/leagues/:id/schedule` | Get league schedule |

### Team Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/teams` | Get user's teams |
| POST | `/api/teams` | Create a new team |
| GET | `/api/teams/:id` | Get team details |
| PUT | `/api/teams/:id` | Update team settings |
| DELETE | `/api/teams/:id` | Delete team |
| GET | `/api/teams/:id/roster` | Get team roster |
| PUT | `/api/teams/:id/roster` | Update team roster |
| GET | `/api/teams/:id/stats` | Get team statistics |

### Player Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/players` | Get all players |
| GET | `/api/players/:id` | Get player details |
| GET | `/api/players/search` | Search players |
| GET | `/api/players/stats` | Get player statistics |
| GET | `/api/players/injuries` | Get injury updates |

### Draft Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/draft/start` | Start draft |
| GET | `/api/draft/:leagueId/state` | Get draft state |
| POST | `/api/draft/:leagueId/pick` | Make draft pick |
| PUT | `/api/draft/:leagueId/settings` | Update draft settings |
| POST | `/api/draft/:leagueId/complete` | Complete draft |

### Auction Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auction/start` | Start auction |
| GET | `/api/auction/:leagueId/state` | Get auction state |
| POST | `/api/auction/:leagueId/bid` | Place bid |
| POST | `/api/auction/:leagueId/nominate` | Nominate player |
| POST | `/api/auction/:leagueId/complete` | Complete auction |

### Trade Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/trades` | Propose trade |
| GET | `/api/trades/:id` | Get trade details |
| PUT | `/api/trades/:id/accept` | Accept trade |
| PUT | `/api/trades/:id/reject` | Reject trade |
| PUT | `/api/trades/:id/veto` | Veto trade |
| POST | `/api/trades/:id/execute` | Execute trade |

### Waiver Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/waivers/claim` | Submit waiver claim |
| GET | `/api/waivers/:leagueId/claims` | Get waiver claims |
| PUT | `/api/waivers/:id/process` | Process waiver claim |
| DELETE | `/api/waivers/:id` | Cancel waiver claim |

### Scoring Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/scoring/rules` | Get scoring rules |
| PUT | `/api/scoring/rules` | Update scoring rules |
| GET | `/api/scoring/calculate` | Calculate player score |
| GET | `/api/scoring/live` | Get live scoring |

### Stats Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stats/players` | Get player statistics |
| GET | `/api/stats/teams` | Get team statistics |
| GET | `/api/stats/leagues` | Get league statistics |
| GET | `/api/stats/trends` | Get statistical trends |

## 🔌 WebSocket Events

### Connection
```javascript
// Connect with authentication
const socket = io('http://localhost:3001', {
  auth: {
    token: 'your-jwt-token'
  }
});
```

### League Events
```javascript
// Join league room
socket.emit('join-league', leagueId);

// Listen for league updates
socket.on('league:updated', (data) => {
  console.log('League updated:', data);
});

// Listen for member joins
socket.on('league:member:joined', (data) => {
  console.log('Member joined:', data);
});
```

### Draft Events
```javascript
// Join draft room
socket.emit('join-draft', leagueId);

// Listen for draft picks
socket.on('draft:pick', (data) => {
  console.log('Draft pick made:', data);
});

// Listen for draft timer
socket.on('draft:timer', (data) => {
  console.log('Draft timer:', data);
});
```

### Auction Events
```javascript
// Join auction room
socket.emit('join-auction', leagueId);

// Listen for auction bids
socket.on('auction:bid', (data) => {
  console.log('Auction bid:', data);
});

// Listen for auction timer
socket.on('auction:timer', (data) => {
  console.log('Auction timer:', data);
});
```

### Trade Events
```javascript
// Join trade room
socket.emit('join-trade', tradeId);

// Listen for trade updates
socket.on('trade:proposed', (data) => {
  console.log('Trade proposed:', data);
});

socket.on('trade:accepted', (data) => {
  console.log('Trade accepted:', data);
});
```

### Scoring Events
```javascript
// Listen for live scoring
socket.on('live:scoring', (data) => {
  console.log('Live scoring:', data);
});

// Listen for score updates
socket.on('score:updated', (data) => {
  console.log('Score updated:', data);
});
```

## 🗄️ Database Models

### User Model
- Authentication and profile information
- Preferences and settings
- Statistics and achievements
- Subscription management

### League Model
- League settings and configuration
- Member management
- Standings and statistics
- Draft and auction settings

### Team Model
- Team information and branding
- Roster management
- Performance statistics
- Salary cap tracking

### Player Model
- Player information and stats
- Injury status and updates
- Performance metrics
- Historical data

## 🔄 Background Jobs

### Scoring Updates
- Real-time fantasy point calculations
- Live game updates during NFL season
- Automated score updates every 5 minutes during games

### Player Updates
- Daily player statistics updates
- Injury monitoring and notifications
- Performance trend analysis

### System Maintenance
- Database cleanup and optimization
- Cache management
- Log rotation and archiving

## 🛡️ Security Features

- **JWT Authentication**: Secure token-based authentication
- **Password Hashing**: bcrypt with configurable rounds
- **Rate Limiting**: API and WebSocket rate limiting
- **Input Validation**: Comprehensive request validation
- **CORS Configuration**: Secure cross-origin requests
- **Helmet Security**: HTTP security headers
- **SQL Injection Protection**: MongoDB with parameterized queries

## 📊 Monitoring & Health Checks

### Health Endpoint
```bash
GET /health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "environment": "development"
}
```

### Database Health
```bash
GET /api/admin/health
```

Response:
```json
{
  "mongodb": "healthy",
  "redis": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## 📝 Logging

The application uses structured logging with different levels:

- **Error**: Application errors and exceptions
- **Warn**: Warning messages and deprecations
- **Info**: General application information
- **Debug**: Detailed debugging information

## 🚀 Deployment

### Production Setup

1. **Environment Variables**
   ```bash
   NODE_ENV=production
   PORT=3001
   MONGODB_URI=mongodb://your-production-db
   REDIS_URL=redis://your-production-redis
   JWT_SECRET=your-production-secret
   ```

2. **PM2 Configuration**
   ```javascript
   // ecosystem.config.js
   module.exports = {
     apps: [{
       name: 'fantasy-football-api',
       script: 'server.js',
       instances: 'max',
       exec_mode: 'cluster',
       env: {
         NODE_ENV: 'production'
       }
     }]
   };
   ```

3. **Nginx Configuration**
   ```nginx
   server {
     listen 80;
     server_name your-domain.com;

     location / {
       proxy_pass http://localhost:3001;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection 'upgrade';
       proxy_set_header Host $host;
       proxy_cache_bypass $http_upgrade;
     }
   }
   ```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the API documentation
- Review the troubleshooting guide

---

**Fantasy Dynasty Central Backend API** - Built with ❤️ for fantasy football enthusiasts 