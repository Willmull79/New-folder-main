@echo off
echo Deploying Firebase Functions for ESPN Data Service...
echo.

echo Building and deploying functions...
cd functions
npm install
firebase deploy --only functions

echo.
echo Functions deployed successfully!
echo.
echo Available functions:
echo - updateTeamsDaily: Updates teams daily at 6 AM EST
echo - updatePlayersDaily: Updates players daily at 7 AM EST  
echo - updateGamesHourly: Updates games every hour
echo - updatePlayerStatsGameDay: Updates player stats every 15 min on game days
echo - updateAllDataWeekly: Full data update every Sunday at 5 AM EST
echo - manualUpdate: HTTP endpoint for manual updates
echo - getUpdateStatus: HTTP endpoint to check update status
echo.
echo Manual update URLs:
echo - Teams: https://your-project.cloudfunctions.net/manualUpdate?type=teams
echo - Players: https://your-project.cloudfunctions.net/manualUpdate?type=players
echo - Games: https://your-project.cloudfunctions.net/manualUpdate?type=games
echo - Stats: https://your-project.cloudfunctions.net/manualUpdate?type=stats
echo - All: https://your-project.cloudfunctions.net/manualUpdate?type=all
echo.
pause 