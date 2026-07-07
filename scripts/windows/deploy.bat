@echo off
echo Starting deployment...
firebase deploy --only hosting
echo Deployment complete!
pause 