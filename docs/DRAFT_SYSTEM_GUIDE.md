# Fantasy Football Draft System Guide

## Overview

The draft system is a comprehensive solution for managing fantasy football drafts with real-time updates, timer management, and both standard and auction draft support. The system uses Firebase as the backend with Cloud Functions for real-time functionality.

## Features

### 🎯 Core Features
- **Real-time Draft Room**: Live updates with timer and turn management
- **Draft Board**: Personal draft board with drag-and-drop functionality
- **Commissioner Controls**: Full draft management for league commissioners
- **Auto-pick System**: Automatic player selection when time runs out
- **Draft Timer**: Configurable time limits with countdown display
- **Draft Order Management**: Random and manual draft order setup
- **Player Search**: Search and filter available players
- **Draft History**: Complete record of all picks and trades

### 🏈 Draft Types Supported
- **Standard Draft**: Traditional snake draft
- **Auction Draft**: Bidding-based player acquisition
- **Snake Draft**: Reverse order in even rounds

## Getting Started

### 1. Commissioner Setup

#### Configure Draft Settings
1. Navigate to the Draft Center
2. Click "Show Draft Configuration" (Commissioner only)
3. Set draft date and time
4. Choose draft type (standard/auction/snake)
5. Set time limits for picks
6. Configure auto-pick settings

#### Set Draft Order
**Random Order:**
- Click "Randomize Order" to automatically shuffle teams
- Order is saved immediately

**Manual Order:**
- Select "Manual Order" option
- Use up/down arrows to reorder teams
- Click "Save Manual Order" when satisfied

### 2. Starting the Draft

#### Pre-Draft Checklist
- [ ] All teams have joined the league
- [ ] Draft order is set
- [ ] Draft date/time is scheduled (optional)
- [ ] All teams are ready

#### Starting the Draft
1. Commissioner clicks "Start Draft"
2. System initializes draft state
3. Timer begins for first pick
4. All users see real-time updates

### 3. During the Draft

#### Making Picks
1. **When it's your turn:**
   - Timer countdown is displayed
   - Available players are shown
   - Click "DRAFT" button next to desired player

2. **When it's not your turn:**
   - See "X picks until your turn"
   - Watch current team's selection
   - Prepare your next pick

#### Auto-Pick System
- Timer counts down from 30s (first pick) or 20s (subsequent picks)
- If time runs out, system auto-picks best available player
- Auto-picked players are marked in draft history

#### Draft Board Management
- **Add Players**: Search and drag players to your draft board
- **Reorder**: Drag players between slots
- **Remove**: Click "Remove" to clear a slot
- **Save**: Board automatically saves to your account

### 4. Commissioner Controls During Draft

#### Pause/Resume
- **Pause**: Stops the timer and prevents picks
- **Resume**: Restarts the timer and allows picks to continue

#### End Draft
- **End Draft**: Manually ends the draft
- All remaining players become free agents
- League moves to active status

## API Endpoints

### Draft Status
```javascript
// Get current draft status
GET /getDraftTimerState?leagueId={leagueId}

// Response includes:
{
  timerActive: boolean,
  timeRemaining: number,
  currentTeamId: string,
  isFirstPick: boolean,
  currentPick: number,
  draftOrder: string[],
  status: string
}
```

### Draft Actions
```javascript
// Start draft (Commissioner only)
POST /startDraft
Body: { leagueId: string }

// Make draft pick
POST /makeDraftPick
Body: { 
  leagueId: string, 
  teamId: string, 
  playerId: string 
}

// Configure draft (Commissioner only)
POST /configureDraft
Body: {
  leagueId: string,
  draftType: 'standard' | 'auction' | 'snake',
  timeLimit: number,
  autoPick: boolean
}
```

### Draft Management
```javascript
// Set draft order (Commissioner only)
POST /setDraftOrder
Body: { 
  leagueId: string, 
  draftOrder: string[] 
}

// Pause draft (Commissioner only)
POST /pauseDraft
Body: { leagueId: string }

// Resume draft (Commissioner only)
POST /resumeDraft
Body: { leagueId: string }

// End draft (Commissioner only)
POST /endDraft
Body: { leagueId: string }
```

## Frontend Integration

### Using the Draft Service
```javascript
import draftService from '../utils/draftService.js';

// Get draft status
const status = await draftService.getDraftStatus(leagueId);

// Make a pick
await draftService.makeDraftPick(leagueId, teamId, playerId);

// Start draft (commissioner)
await draftService.startDraft(leagueId);

// Subscribe to real-time updates
const unsubscribe = draftService.subscribeToDraftStatus(leagueId, (status) => {
  console.log('Draft status updated:', status);
});
```

### DraftCenter Component
The main draft interface is the `DraftCenter` component which provides:

- **Draft Board Tab**: Personal draft board management
- **Draft Room Tab**: Live draft interface
- **Commissioner Controls**: Draft management tools
- **Real-time Updates**: Automatic status synchronization

## Timer System

### Timer States
- **30 seconds**: First pick of the draft
- **20 seconds**: All subsequent picks
- **Auto-pick**: Triggers when timer reaches 0

### Timer Management
- Timer updates every second during live drafts
- Auto-pick system handles timeouts
- Commissioner can pause/resume timer
- Timer resets for each new pick

## Player Management

### Available Players
- All NFL players are available for drafting
- Players are ranked by fantasy value
- Search functionality for quick access
- Filter by position, team, or name

### Drafted Players
- Complete history of all picks
- Shows team, round, and pick number
- Auto-picked players are marked
- Available for review after draft

## Error Handling

### Common Issues
1. **"It's not your turn"**: Wait for your turn in the draft order
2. **"Draft not live"**: Commissioner needs to start the draft
3. **"Player not available"**: Player was already drafted
4. **Network errors**: Check internet connection and retry

### Troubleshooting
- Refresh the page if interface seems stuck
- Check console for error messages
- Verify league and team permissions
- Contact commissioner for draft issues

## Best Practices

### For Commissioners
1. **Test the system** before the actual draft
2. **Communicate rules** clearly to all teams
3. **Monitor the draft** for any issues
4. **Have a backup plan** for technical issues

### For Participants
1. **Prepare your draft board** before the draft
2. **Have backup picks** ready
3. **Pay attention to the timer**
4. **Test your connection** before the draft

### Technical Considerations
1. **Stable internet connection** required
2. **Modern browser** recommended
3. **Disable ad blockers** if issues occur
4. **Keep the tab active** for real-time updates

## Advanced Features

### Draft Analysis
- AI-powered pick recommendations
- Team needs analysis
- Risk assessment for picks
- Projected finish predictions

### Auction Draft Support
- Bidding system for players
- Budget management
- Nomination process
- Real-time auction updates

### Integration Points
- **ESPN API**: Player data and stats
- **Firebase**: Real-time database
- **Cloud Functions**: Serverless backend
- **Python Bridge**: Advanced analytics

## Support

For technical support or questions about the draft system:
1. Check this guide first
2. Review console error messages
3. Contact the development team
4. Check the project documentation

---

*This draft system is designed to provide a smooth, professional fantasy football draft experience with all the features needed for both casual and competitive leagues.*
