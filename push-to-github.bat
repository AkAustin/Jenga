@echo off
set "PATH=%LOCALAPPDATA%\Programs\MinGit\cmd;%LOCALAPPDATA%\Programs\GCM;%PATH%"
cd /d "%~dp0"
echo Staging and committing latest updates...
git add -A
git commit -m "Update mobile UI: compact camera view button, top menu, and table info popovers"
echo Pushing JENGA 360 to https://github.com/AkAustin/Jenga ...
git push -u origin main --force
echo.
echo Done! Vercel will automatically deploy the new commit on main.
pause

