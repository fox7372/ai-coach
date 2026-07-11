$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

$VenvPath = Join-Path $ProjectRoot ".venv"
$VenvPython = Join-Path $VenvPath "Scripts\python.exe"
$Requirements = Join-Path $ProjectRoot "requirements.txt"
$RequirementsStamp = Join-Path $VenvPath ".requirements.stamp"
$EnvPath = Join-Path $ProjectRoot ".env"
$EnvExamplePath = Join-Path $ProjectRoot ".env.example"

function Get-PythonVersion {
  param(
    [string]$Path,
    [string[]]$Arguments = @()
  )

  try {
    $Version = & $Path @Arguments -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
    if ($LASTEXITCODE -ne 0 -or !$Version) {
      return $null
    }
    return $Version.Trim()
  } catch {
    return $null
  }
}

function Test-SupportedPythonVersion {
  param([string]$Version)

  if ($Version -eq "3.14") {
    Write-Warning "检测到 Python 3.14。部分 AI 和文档解析依赖可能尚不兼容，建议使用 Python 3.11 或 3.12。"
  }

  return $Version -in @("3.11", "3.12", "3.13", "3.14")
}

function Get-BasePython {
  $PyLauncher = Get-Command py -ErrorAction SilentlyContinue
  if ($PyLauncher) {
    $Version = Get-PythonVersion -Path $PyLauncher.Source -Arguments @("-3.11")
    if ($Version) {
      return [PSCustomObject]@{
        Path = $PyLauncher.Source
        Arguments = @("-3.11")
        Version = $Version
      }
    }
  }

  $SystemPython = Get-Command python -ErrorAction SilentlyContinue
  if ($SystemPython) {
    $Version = Get-PythonVersion -Path $SystemPython.Source
    if ($Version) {
      return [PSCustomObject]@{
        Path = $SystemPython.Source
        Arguments = @()
        Version = $Version
      }
    }
  }

  throw "未找到可用 Python。请安装 Python 3.11 或 3.12，并确保 py -3.11 或 python 可用。"
}

function Import-EnvFile {
  param([string]$Path)

  foreach ($RawLine in Get-Content -LiteralPath $Path) {
    $Line = $RawLine.Trim()
    if (!$Line -or $Line.StartsWith("#")) {
      continue
    }

    if ($Line -match "^([A-Za-z_][A-Za-z0-9_]*)=(.*)$") {
      $Key = $Matches[1]
      $Value = $Matches[2]
      if (!(Test-Path "Env:$Key")) {
        Set-Item -Path "Env:$Key" -Value $Value
      }
    }
  }
}

function Test-DatabaseConnection {
  $CheckCode = "from app.database import engine; from sqlalchemy import text; connection = engine.connect(); connection.execute(text('SELECT 1')); connection.close()"

  try {
    $null = & $VenvPython -c $CheckCode 2>&1
    if ($LASTEXITCODE -eq 0) {
      return $true
    }

    return $false
  } catch {
    return $false
  }
}

function Get-PortListenerPids {
  param([int]$Port)

  try {
    return @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess -Unique)
  } catch {
    return @()
  }
}

if (!(Test-Path $VenvPython)) {
  if (Test-Path $VenvPath) {
    throw "检测到 backend/.venv，但其中没有 Windows 版 Scripts/python.exe。该目录可能由 WSL/Linux 创建；请在确认不再使用后手动删除或重命名 backend/.venv，再重新运行本脚本。"
  }

  $BasePython = Get-BasePython
  if (!(Test-SupportedPythonVersion $BasePython.Version)) {
    throw "检测到 Python $($BasePython.Version)。请安装 Python 3.11 或 3.12 后重试。"
  }

  Write-Host "Creating Python virtual environment with Python $($BasePython.Version)..." -ForegroundColor Cyan
  & $BasePython.Path @($BasePython.Arguments) -m venv $VenvPath
}

$VenvVersion = Get-PythonVersion -Path $VenvPython
if (!$VenvVersion) {
  throw "虚拟环境中的 Python 无法运行：$VenvPython"
}
if (!(Test-SupportedPythonVersion $VenvVersion)) {
  throw "虚拟环境使用 Python $VenvVersion。建议删除 backend/.venv 后使用 Python 3.11 或 3.12 重新创建。"
}

$NeedsInstall = !(Test-Path $RequirementsStamp)
if (!$NeedsInstall) {
  $NeedsInstall = (Get-Item $Requirements).LastWriteTimeUtc -gt (Get-Item $RequirementsStamp).LastWriteTimeUtc
}

if ($NeedsInstall) {
  Write-Host "Installing backend dependencies..." -ForegroundColor Cyan
  & $VenvPython -m pip install --disable-pip-version-check -r $Requirements
  Set-Content -Path $RequirementsStamp -Value (Get-Date).ToString("o")
} else {
  Write-Host "Backend dependencies are up to date." -ForegroundColor DarkGray
}

if (Test-Path $EnvPath) {
  Import-EnvFile $EnvPath
} elseif (Test-Path $EnvExamplePath) {
  Write-Warning "未找到 backend/.env。将使用 .env.example 的默认配置进行本次检查；部署前请复制并修改 .env。"
  Import-EnvFile $EnvExamplePath
} else {
  throw "未找到 .env 或 .env.example，无法确定 DATABASE_URL。"
}

if (!(Test-DatabaseConnection)) {
  Write-Host ""
  Write-Host "数据库连接失败，后端尚未启动。" -ForegroundColor Red
  Write-Host ""
  Write-Host "请先启动 MySQL/MariaDB，或检查 backend/.env 中的 DATABASE_URL。" -ForegroundColor Yellow
  Write-Host "Windows 服务方式可尝试：" -ForegroundColor Yellow
  Write-Host "  Get-Service *mysql*" -ForegroundColor DarkGray
  Write-Host "  Get-Service *mariadb*" -ForegroundColor DarkGray
  Write-Host "  Start-Service <实际服务名称>" -ForegroundColor DarkGray
  Write-Host "也可以使用 Docker：" -ForegroundColor Yellow
  Write-Host "  docker compose up -d db" -ForegroundColor DarkGray
  exit 1
}

$PortPids = @(Get-PortListenerPids -Port 8000)
if ($PortPids.Count -gt 0) {
  Write-Host "端口 8000 已被占用，后端尚未启动。占用 PID: $($PortPids -join ', ')" -ForegroundColor Red
  Write-Host "请确认对应进程后手动关闭，或修改 Uvicorn 端口。脚本不会结束任何进程。" -ForegroundColor Yellow
  exit 1
}

Write-Host "Database connection OK. Backend will listen on 0.0.0.0:8000." -ForegroundColor Cyan
& $VenvPython -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
