$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

$Python = "C:\Users\fox\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

if (!(Test-Path ".venv-win")) {
  & $Python -m venv .venv-win
}

.\.venv-win\Scripts\python.exe -m pip install -r requirements.txt

.\start_database.ps1

function Stop-BackendPort {
  $PortPids = netstat -ano |
    Select-String ":8000" |
    ForEach-Object { ($_ -split "\s+")[-1] } |
    Where-Object { $_ -match "^\d+$" -and $_ -ne "0" } |
    Select-Object -Unique

  foreach ($PortPid in $PortPids) {
    if ([int]$PortPid -ne $PID) {
      $ChildProcesses = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object { $_.ParentProcessId -eq [int]$PortPid }

      foreach ($ChildProcess in $ChildProcesses) {
        Stop-Process -Id ([int]$ChildProcess.ProcessId) -Force -ErrorAction SilentlyContinue
      }

      Stop-Process -Id ([int]$PortPid) -Force -ErrorAction SilentlyContinue
    }
  }
}

try {
  $Health = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/health -TimeoutSec 3
  if ($Health.StatusCode -eq 200) {
    $OpenApi = Invoke-RestMethod -UseBasicParsing http://127.0.0.1:8000/openapi.json -TimeoutSec 3
    $SettingsAiPath = $OpenApi.paths.PSObject.Properties["/settings/ai"]
    $HasDeleteAiConfig = $SettingsAiPath -and $SettingsAiPath.Value.PSObject.Properties["delete"]

    if ($HasDeleteAiConfig) {
      Write-Host "Backend is already running at http://127.0.0.1:8000/health" -ForegroundColor Green
      exit 0
    }

    Write-Host "Port 8000 is running an old backend. Restarting it..." -ForegroundColor Yellow
    Stop-BackendPort
    Start-Sleep -Seconds 2
  }
} catch {
  # Port 8000 is not serving this backend yet; continue and start Uvicorn.
}

try {
  $PortCheck = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/health -TimeoutSec 2
  if ($PortCheck.StatusCode -eq 200) {
    throw "Port 8000 is still occupied by another backend. Close the old backend process or restart Windows, then run this script again."
  }
} catch [System.Net.WebException] {
  # Port 8000 is free or not serving HTTP; continue.
}

Write-Host "Backend will listen on 0.0.0.0:8000. Open http://127.0.0.1:8000/health locally." -ForegroundColor Cyan
.\.venv-win\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
