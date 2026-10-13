@echo off
REM Start the MCP server + a tunnel on Windows in one go. Close both windows to stop.
REM To keep the server running and open the tunnel only when needed, use "bun start" and "bun tunnel" instead.
cd /d "%~dp0"
if not exist .env (
  echo .env not found. Copy .env.example to .env and fill it in.
  pause
  exit /b 1
)

REM Use Bun when available; fall back to Node.js on laptops where Bun can't be installed
set "RUN=node"
set "INSTALL=npm install"
where bun >nul 2>nul && (set "RUN=bun" & set "INSTALL=bun install")
where %RUN% >nul 2>nul || (
  echo Neither Bun nor Node.js is installed. Install Bun, or Node.js 18+ if Bun isn't allowed.
  pause
  exit /b 1
)
if not exist node_modules call %INSTALL%

start "Codebase MCP" cmd /k %RUN% server.js
timeout /t 2 >nul
echo.
%RUN% tunnel.js
pause
