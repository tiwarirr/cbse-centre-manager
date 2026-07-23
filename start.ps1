# Starts the CBSE Centre Manager app (backend + frontend, served together).
# Usage: from the repo root, run:  .\start.ps1
# Stop with Ctrl+C.

$ErrorActionPreference = "Stop"
$backend = Join-Path $PSScriptRoot "backend"
Set-Location $backend

if (-not (Test-Path ".\.venv\Scripts\Activate.ps1")) {
    Write-Host "No virtual environment found at backend\.venv - setting one up..." -ForegroundColor Yellow
    python -m venv .venv
    & .\.venv\Scripts\Activate.ps1
    python -m pip install --quiet --upgrade pip
    python -m pip install --quiet -r requirements.txt
} else {
    & .\.venv\Scripts\Activate.ps1
}

$env:FLASK_APP = "app.py"

# Idempotent - only applies migrations that haven't run yet. Creates
# instance\cbse.sqlite3 on first run.
flask db upgrade

if (-not (Test-Path ".\instance\cbse.sqlite3")) {
    Write-Host "Fresh database - no login exists yet. Create one now:" -ForegroundColor Yellow
    flask create-admin
}

Write-Host ""
Write-Host "Starting server at http://127.0.0.1:5000 (Ctrl+C to stop)" -ForegroundColor Green
python wsgi.py
