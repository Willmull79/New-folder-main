# Fantasy Dynasty Central

A comprehensive fantasy football management platform built with React, Node.js, and Firebase.

## 🚀 Quick Start

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- MongoDB (for backend)
- Redis (optional, for caching)

### Installation

1. **Clone and install dependencies:**
   ```bash
   # Install frontend dependencies
   npm install
   
   # Install backend dependencies
   cd backend
   npm install
   cd ..
   ```

2. **Configure environment:**
   - Copy `backend/config.env.example` to `backend/config.env`
   - Update the configuration values in `backend/config.env`
   - The Firebase configuration is already set up in `src/config/firebase.js`

3. **Start the application:**

   **Option 1: Start both frontend and backend (Recommended)**
   ```bash
   # Windows
   scripts/windows/start-full-app.bat
   
   # Or manually:
   # Terminal 1 - Backend
   cd backend && npm start
   
   # Terminal 2 - Frontend
   npm run dev
   ```

   **Option 2: Frontend only (for development)**
   ```bash
   npm run dev
   ```

   **Option 3: Build for production**
   ```bash
   npm run build
   npm run serve
   ```

## 📁 Project Structure

```
fantasy-dynasty-central/
├── src/                    # Frontend React application
│   ├── components/         # React components
│   ├── contexts/          # React contexts (Firebase)
│   ├── config/            # Configuration files
│   ├── data/              # Mock data and constants
│   ├── utils/             # Utility functions
│   └── styles.css         # Global styles
├── backend/               # Node.js/Express backend
│   ├── routes/            # API routes
│   ├── middleware/        # Express middleware
│   ├── models/            # Database models
│   ├── services/          # Business logic
│   └── config.env         # Environment configuration
├── functions/             # Firebase Cloud Functions
├── dist/                  # Built frontend files
├── scripts/               # Utility scripts (see scripts/README.md)
├── docs/                  # Project guides and reference docs
└── tests/                 # Manual HTML test pages
```

## 🔧 Configuration

### Frontend Configuration
- Firebase configuration: `src/config/firebase.js`
- Webpack configuration: `webpack.config.js`
- Tailwind CSS: `tailwind.config.js`

### Backend Configuration
- Environment variables: `backend/config.env`
- Database connection: MongoDB
- Authentication: JWT + Firebase Admin

## 🛠️ Available Scripts

### Frontend
- `npm start` - Start development server
- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run serve` - Serve built files
- `npm run build:css` - Build CSS with Tailwind

### Backend
- `cd backend && npm start` - Start backend server
- `cd backend && npm run dev` - Start with nodemon

### Utility / Ops Scripts
- Windows launcher: `scripts/windows/start-full-app.bat`
- Script index: `scripts/README.md`

## 🌐 Access Points

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **API Documentation**: http://localhost:3001/api-docs
- **Health Check**: http://localhost:3001/health

## 🔑 Features

- **User Authentication** - Firebase Auth integration
- **League Management** - Create and manage fantasy leagues
- **Team Management** - Roster management and team settings
- **Draft System** - Live draft functionality
- **Waiver Wire** - Player acquisition system
- **Trade Center** - Player trading between teams
- **Live Scoring** - Real-time score updates
- **Commissioner Tools** - Advanced league management

## 🚨 Troubleshooting

### Common Issues

1. **Port conflicts**: Make sure ports 3000 and 3001 are available
2. **Firebase errors**: Check Firebase configuration in `src/config/firebase.js`
3. **Backend connection**: Ensure MongoDB is running and `backend/config.env` is configured
4. **Build errors**: Clear `node_modules` and reinstall dependencies

### Development Tips

- Use `npm run dev` for frontend development with hot reload
- Backend logs are available in the terminal
- Check browser console for frontend errors
- Use browser dev tools for debugging

## 📚 Documentation

- [API Guide](docs/API_GUIDE.md)
- [Testing Guide](docs/TESTING_GUIDE.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Background Scoring Guide](docs/BACKGROUND_SCORING_GUIDE.md)
- [Enhanced Waiver Wire Guide](docs/ENHANCED_WAIVER_WIRE_GUIDE.md)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details 