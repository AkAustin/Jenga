@echo off
echo Pushing JENGA 360 to https://github.com/AkAustin/Jenga ...
"%LOCALAPPDATA%\Programs\MinGit\cmd\git.exe" push -u origin main --force
echo.
echo Done! You can now click Deploy in Vercel.
pause
