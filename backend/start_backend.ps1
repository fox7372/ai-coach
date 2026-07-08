$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

$Python = "C:\Users\fox\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

if (!(Test-Path ".venv-win")) {
  & $Python -m venv .venv-win
}

.\.venv-win\Scripts\python.exe -m pip install -r requirements.txt

.\start_database.ps1

try {
  $Health = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/health -TimeoutSec 3
  if ($Health.StatusCode -eq 200) {
    Write-Host "Backend is already running at http://127.0.0.1:8000/health" -ForegroundColor Green
    exit 0
  }
} catch {
  # Port 8000 is not serving this backend yet; continue and start Uvicorn.
}

Write-Host "Backend will listen on 0.0.0.0:8000. Open http://127.0.0.1:8000/health locally." -ForegroundColor Cyan
.\.venv-win\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
