# Robust runner for Sentra (PowerShell)
# Usage: run.ps1 (will be invoked by run.bat)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location -LiteralPath $scriptDir

Write-Host "Starting Sentra Crisis Damage Reporting Platform" -ForegroundColor Cyan

# Check Node
try {
    node -v > $null 2>&1
} catch {
    Write-Host "Node.js is not available in PATH. Please install Node.js." -ForegroundColor Red
    pause
    exit 1
}

# Install deps if needed
if (-not (Test-Path (Join-Path $scriptDir 'backend\node_modules'))) {
    Write-Host "Installing backend dependencies..."
    Push-Location (Join-Path $scriptDir 'backend')
    npm install
    Pop-Location
}

if (-not (Test-Path (Join-Path $scriptDir 'frontend\node_modules'))) {
    Write-Host "Installing frontend dependencies..."
    Push-Location (Join-Path $scriptDir 'frontend')
    npm install
    Pop-Location
}

# Seed backend if seed script exists
if (Test-Path (Join-Path $scriptDir 'backend\\seed.js')) {
    Write-Host "Seeding backend database (if needed)..."
    Push-Location (Join-Path $scriptDir 'backend')
    try {
        npm run seed
    } catch {
        Write-Host "Seed script failed or already ran." -ForegroundColor Yellow
    }
    Pop-Location
}

# Choose PowerShell executable (pwsh if available, otherwise powershell)
$psExe = if (Get-Command pwsh -ErrorAction SilentlyContinue) { 'pwsh' } else { 'powershell' }

Write-Host "Starting backend server..."
Start-Process -FilePath $psExe -ArgumentList "-NoExit","-Command","Set-Location -LiteralPath '$scriptDir\\backend'; npm start" -WindowStyle Normal

Write-Host "Starting frontend dev server..."
Start-Process -FilePath $psExe -ArgumentList "-NoExit","-Command","Set-Location -LiteralPath '$scriptDir\\frontend'; npm run dev" -WindowStyle Normal

# Wait for frontend to respond and open browser
$uri = 'http://localhost:3000/'
Write-Host "Waiting for frontend at $uri ..."
$max = 60
for ($i=0; $i -lt $max; $i++) {
    try {
        $resp = Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 400) {
            Write-Host "Frontend is responsive; waiting 3s for Vite to finish compiling..."
            Start-Sleep -Seconds 3
            Write-Host "Opening browser..."
            Start-Process $uri
            break
        }
    } catch {
        Start-Sleep -Seconds 1
    }
}

if ($i -ge $max) {
    Write-Host "Frontend did not respond within timeout; opening browser anyway..."
    Start-Process $uri
}

Write-Host "Sentra startup launched." -ForegroundColor Green
Write-Host " - Frontend: http://localhost:3000"
Write-Host " - Backend API: http://localhost:5000"
Write-Host "Close the spawned PowerShell windows to stop the servers."

pause
