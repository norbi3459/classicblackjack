@echo off
cd /d "%~dp0"
start "" http://localhost:5173/game/index.html
node server.js
