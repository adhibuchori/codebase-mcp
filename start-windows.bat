@echo off
REM Start the MCP server + a tunnel on Windows in one go. Close both windows to stop.
REM To keep the server running and open the tunnel only when needed, use "bun start" and "bun tunnel" instead.
cd /d "%~dp0"

REM Use Bun when available; fall back to Node.js 22.18+ (which runs TypeScript directly) on laptops
REM where Bun can't be installed. The Node install skips dev tools and install scripts: nothing native
REM is downloaded or built.
set "RUN=node --disable-warning=ExperimentalWarning"
set "INSTALL=npm install --omit=dev --ignore-scripts --no-audit --no-fund"
where bun >nul 2>nul && (set "RUN=bun" & set "INSTALL=bun install")
where node >nul 2>nul || where bun >nul 2>nul || (
  echo Neither Bun nor Node.js is installed. Install Bun, or Node.js 22.18+ if Bun isn't allowed.
  pause
  exit /b 1
)
if not exist node_modules call %INSTALL%
if not exist codebase.config.json if not exist .env (
  echo No configuration yet. Running setup first...
  %RUN% scripts\setup\setup.ts
)

start "Codebase MCP" cmd /k %RUN% src\index.ts start
timeout /t 3 >nul
echo.
%RUN% scripts\tunnel\tunnel.ts
pause
