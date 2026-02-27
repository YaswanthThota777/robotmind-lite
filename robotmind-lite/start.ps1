# RobotMind Lite - Start Script
# Run this file to start both backend and frontend

Write-Host "Starting RobotMind Lite..." -ForegroundColor Cyan

# Kill any existing instances
Get-Process -Name python -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process -Name node   -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

# Start backend
Write-Host "Starting backend on http://localhost:8000 ..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command",
    "cd '$PSScriptRoot'; Write-Host 'BACKEND' -ForegroundColor Green; python -m uvicorn backend.main:app --reload --port 8000"

# Start frontend
Write-Host "Starting frontend on http://localhost:5173 ..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command",
    "cd '$PSScriptRoot\frontend'; Write-Host 'FRONTEND' -ForegroundColor Green; npm run dev"

# Wait and open browser
Start-Sleep -Seconds 10
Write-Host "App is ready!" -ForegroundColor Green
Write-Host "  Frontend : http://localhost:5173" -ForegroundColor Cyan
Write-Host "  Backend  : http://localhost:8000" -ForegroundColor Cyan
Start-Process "http://localhost:5173"
