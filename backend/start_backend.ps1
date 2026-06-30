$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

$Python = "C:\Users\fox\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

if (!(Test-Path ".venv-win")) {
  & $Python -m venv .venv-win
}

.\.venv-win\Scripts\python.exe -m pip install -r requirements.txt

$MariaDbPort = Test-NetConnection 127.0.0.1 -Port 3306 -InformationLevel Quiet
if (!$MariaDbPort) {
  .\start_database.ps1
}

.\.venv-win\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
