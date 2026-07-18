[CmdletBinding()]
param(
  [switch]$SkipDatabase
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendRoot = Join-Path $ProjectRoot "backend"
$FrontendRoot = Join-Path $ProjectRoot "前端"
$BackendScript = Join-Path $BackendRoot "start_backend.ps1"
$RootEnvPath = Join-Path $ProjectRoot ".env"

function Test-HttpEndpoint {
  param(
    [string]$Url,
    [int]$TimeoutSeconds = 90
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
        return $true
      }
    } catch {
      # The service may still be starting.
    }
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)

  return $false
}

function Get-PortListenerPid {
  param([int]$Port)

  $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
    Select-Object -First 1
  return $listener.OwningProcess
}

function Ensure-DockerEngine {
  try {
    $null = & docker version --format '{{.Server.Version}}' 2>$null
    if ($LASTEXITCODE -eq 0) {
      return
    }
  } catch {
    # Docker Desktop is installed but the engine is not ready yet.
  }

  $dockerDesktop = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
  if (!(Test-Path $dockerDesktop)) {
    throw "Docker 引擎不可用，且未找到 Docker Desktop。请启动 Docker Desktop，或使用 -SkipDatabase 配置现有 MySQL/MariaDB。"
  }

  Write-Host "Starting Docker Desktop..." -ForegroundColor Cyan
  Start-Process -FilePath $dockerDesktop -WindowStyle Hidden
  $deadline = (Get-Date).AddSeconds(90)
  do {
    Start-Sleep -Seconds 3
    try {
      $null = & docker version --format '{{.Server.Version}}' 2>$null
      if ($LASTEXITCODE -eq 0) {
        return
      }
    } catch {
      # Keep waiting until Docker Desktop starts the engine.
    }
  } while ((Get-Date) -lt $deadline)

  throw "Docker Desktop did not become ready within 90 seconds."
}

function Wait-ForDockerDatabase {
  $deadline = (Get-Date).AddSeconds(90)
  do {
    & docker compose exec -T db mysqladmin ping -h 127.0.0.1 --silent 2>$null
    if ($LASTEXITCODE -eq 0) {
      return
    }
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)

  throw "Docker MySQL did not become ready within 90 seconds. Run 'docker compose logs db' to inspect it."
}

function Import-ProjectEnvFile {
  param([string]$Path)

  if (!(Test-Path -LiteralPath $Path)) {
    return
  }

  foreach ($rawLine in Get-Content -LiteralPath $Path) {
    $line = $rawLine.Trim()
    if (!$line -or $line.StartsWith("#")) {
      continue
    }

    if ($line -match "^([A-Za-z_][A-Za-z0-9_]*)=(.*)$") {
      $key = $Matches[1]
      $value = $Matches[2]
      if (!(Test-Path "Env:$key")) {
        Set-Item -Path "Env:$key" -Value $value
      }
    }
  }
}

function Test-RequiredDockerCredentials {
  Import-ProjectEnvFile -Path $RootEnvPath

  $missing = @()
  foreach ($name in @("MYSQL_ROOT_PASSWORD", "MYSQL_PASSWORD")) {
    $value = (Get-Item -Path "Env:$name" -ErrorAction SilentlyContinue).Value
    if ([string]::IsNullOrWhiteSpace($value) -or $value -like "replace_with_*") {
      $missing += $name
    }
  }

  if ($missing.Count -gt 0) {
    throw "缺少 MYSQL_ROOT_PASSWORD 或 MYSQL_PASSWORD。请复制根目录 .env.example 为 .env，并填写强密码。"
  }
}

Set-Location $ProjectRoot

if (!$SkipDatabase) {
  Test-RequiredDockerCredentials
  Ensure-DockerEngine
  Write-Host "Starting or reusing Docker MySQL..." -ForegroundColor Cyan
  & docker compose up -d db
  Wait-ForDockerDatabase
} else {
  Write-Host "Skipping Docker database. The backend will use DATABASE_URL from backend/.env." -ForegroundColor Yellow
}

if (Test-HttpEndpoint -Url "http://127.0.0.1:8000/health" -TimeoutSeconds 1) {
  Write-Host "Backend is already running at http://127.0.0.1:8000." -ForegroundColor Green
} else {
  $backendPid = Get-PortListenerPid -Port 8000
  if ($backendPid) {
    throw "Port 8000 is occupied by PID $backendPid, but /health did not respond. Resolve the process manually before starting the backend."
  }

  Write-Host "Starting backend..." -ForegroundColor Cyan
  Start-Process -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $BackendScript) `
    -WorkingDirectory $BackendRoot `
    -WindowStyle Hidden | Out-Null

  if (!(Test-HttpEndpoint -Url "http://127.0.0.1:8000/health")) {
    throw "Backend did not become ready. Run backend/start_backend.ps1 in a terminal to view the detailed error."
  }
}

if (Test-HttpEndpoint -Url "http://127.0.0.1:5173/" -TimeoutSeconds 1) {
  Write-Host "Frontend is already running at http://127.0.0.1:5173." -ForegroundColor Green
} else {
  $frontendPid = Get-PortListenerPid -Port 5173
  if ($frontendPid) {
    throw "Port 5173 is occupied by PID $frontendPid, but the Vite frontend did not respond. Resolve the process manually before starting the frontend."
  }

  $pnpm = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
  if (!$pnpm) {
    $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
  }
  if (!$pnpm) {
    throw "pnpm was not found. Install Node.js 20+ and pnpm before starting the frontend."
  }

  if (!(Test-Path (Join-Path $FrontendRoot "node_modules"))) {
    Write-Host "Installing frontend dependencies..." -ForegroundColor Cyan
    & $pnpm.Source install
    if ($LASTEXITCODE -ne 0) {
      throw "Frontend dependency installation failed."
    }
  }

  Write-Host "Starting frontend..." -ForegroundColor Cyan
  Start-Process -FilePath $pnpm.Source `
    -ArgumentList @("dev", "--", "--host", "127.0.0.1", "--port", "5173") `
    -WorkingDirectory $FrontendRoot `
    -WindowStyle Hidden | Out-Null

  if (!(Test-HttpEndpoint -Url "http://127.0.0.1:5173/" -TimeoutSeconds 60)) {
    throw "Frontend did not become ready. Run 'pnpm dev' in the 前端 directory to view the detailed error."
  }
}

Write-Host ""
Write-Host "Project is ready." -ForegroundColor Green
Write-Host "Frontend: http://127.0.0.1:5173" -ForegroundColor Green
Write-Host "Backend:  http://127.0.0.1:8000/docs" -ForegroundColor Green
