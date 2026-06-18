@echo off
cd /d C:\Users\hp\ridehailing-contracts
echo Removing stale git lock file...
del /f ".git\index.lock" 2>nul
echo.
echo Running git add...
git add -A
echo.
echo Committing...
git commit -m "feat: driver dashboard, verify-driver, mint-usdc, ABI fixes, vercel.json"
echo.
echo Pushing to GitHub...
git push origin main
echo.
echo Done! Press any key to close.
pause
