$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

$BundledPython = "C:\Users\fox\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$VenvPython = Join-Path $ProjectRoot ".venv-win\Scripts\python.exe"
$Requirements = Join-Path $ProjectRoot "requirements.txt"
$RequirementsStamp = Join-Path $ProjectRoot ".venv-win\.requirements.stamp"

function Get-BasePython {
  if (Test-Path $BundledPython) {
    return $BundledPython
  }

  $PyLauncher = Get-Command py -ErrorAction SilentlyContinue
  if ($PyLauncher) {
    return $PyLauncher.Source
  }

  $SystemPython = Get-Command python -ErrorAction SilentlyContinue
  if ($SystemPython) {
    return $SystemPython.Source
  }

  throw "Python was not found. Install Python 3.12 or run this from Codex where the bundled Python is available."
}

if (!(Test-Path ".venv-win")) {
  $BasePython = Get-BasePython
  & $BasePython -m venv .venv-win
}

$NeedsInstall = !(Test-Path $RequirementsStamp)
if (!$NeedsInstall) {
  $NeedsInstall = (Get-Item $Requirements).LastWriteTimeUtc -gt (Get-Item $RequirementsStamp).LastWriteTimeUtc
}

if ($NeedsInstall) {
  Write-Host "Installing backend dependencies..." -ForegroundColor Cyan
  & $VenvPython -m pip install --disable-pip-version-check -r requirements.txt
  Set-Content -Path $RequirementsStamp -Value (Get-Date).ToString("o")
} else {
  Write-Host "Backend dependencies are up to date." -ForegroundColor DarkGray
}

.\start_database.ps1

function Get-BackendHealth {
  try {
    return Invoke-RestMethod -UseBasicParsing http://127.0.0.1:8000/health -TimeoutSec 10
  } catch {
    return $null
  }
}

function Test-CurrentBackend {
  param($Health)

  return $Health -and
    $Health.status -eq "ok" -and
    $Health.rag_vector_store -eq "chroma" -and
    $Health.embedding_model
}

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

$Health = Get-BackendHealth
if (Test-CurrentBackend $Health) {
  Write-Host "Backend is already running at http://127.0.0.1:8000/health" -ForegroundColor Green
  Write-Host "RAG: $($Health.rag_vector_store), embedding: $($Health.embedding_model), reranker: $($Health.reranker_model), device: $($Health.rag_device)" -ForegroundColor Green
  exit 0
}

if ($Health) {
  Write-Host "Port 8000 is running a different backend. Restarting it..." -ForegroundColor Yellow
  Stop-BackendPort
  Start-Sleep -Seconds 2
}

$PortCheck = Get-BackendHealth
if (Test-CurrentBackend $PortCheck) {
  Write-Host "Backend is already running at http://127.0.0.1:8000/health" -ForegroundColor Green
  Write-Host "RAG: $($PortCheck.rag_vector_store), embedding: $($PortCheck.embedding_model), reranker: $($PortCheck.reranker_model), device: $($PortCheck.rag_device)" -ForegroundColor Green
  exit 0
}

if ($PortCheck) {
  throw "Port 8000 is still occupied by another backend. Close the old backend process or restart Windows, then run this script again."
}

Write-Host "Backend will listen on 0.0.0.0:8000. Open http://127.0.0.1:8000/health locally." -ForegroundColor Cyan
& $VenvPython -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
