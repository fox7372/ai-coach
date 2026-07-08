$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

$MySqlBase = "C:\Program Files\MySQL\MySQL Server 8.4"
$MySqlD = Join-Path $MySqlBase "bin\mysqld.exe"
$MySql = Join-Path $MySqlBase "bin\mysql.exe"
$DataDir = Join-Path $ProjectRoot ".mysql-data"

function Test-DatabaseReady {
  try {
    & $MySql -h 127.0.0.1 -P 3306 -u root --connect-timeout=2 -e "SELECT 1;" 2>$null | Out-Null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function Backup-UndoFiles {
  $UndoFiles = @("undo_001", "undo_002", "undo_1_trunc.log", "undo_2_trunc.log")
  $ExistingUndoFiles = $UndoFiles | ForEach-Object { Join-Path $DataDir $_ } | Where-Object { Test-Path $_ }
  if ($ExistingUndoFiles.Count -eq 0) {
    return
  }

  $UndoBackupDir = Join-Path $DataDir ("undo-backup-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
  New-Item -ItemType Directory -Path $UndoBackupDir | Out-Null
  foreach ($UndoFile in $ExistingUndoFiles) {
    Move-Item -LiteralPath $UndoFile -Destination (Join-Path $UndoBackupDir (Split-Path -Leaf $UndoFile))
  }
  Write-Host "Moved stale undo files to: $UndoBackupDir" -ForegroundColor Yellow
}

function Set-EnvValue {
  param(
    [string]$Key,
    [string]$Value
  )

  $EnvPath = Join-Path $ProjectRoot ".env"
  $Lines = @()
  if (Test-Path $EnvPath) {
    $Lines = [System.IO.File]::ReadAllLines($EnvPath, [System.Text.Encoding]::UTF8)
  }

  $Updated = $false
  $Output = foreach ($Line in $Lines) {
    if ($Line -match "^$([regex]::Escape($Key))=") {
      $Updated = $true
      "$Key=$Value"
    } else {
      $Line
    }
  }
  if (!$Updated) {
    $Output += "$Key=$Value"
  }

  [System.IO.File]::WriteAllLines($EnvPath, $Output, [System.Text.UTF8Encoding]::new($false))
}

if (!(Test-Path $MySqlD)) {
  Write-Host "MySQL/MariaDB compatible server was not found at: $MySqlD" -ForegroundColor Red
  exit 1
}

if (!(Test-Path $DataDir)) {
  New-Item -ItemType Directory -Path $DataDir | Out-Null
  & $MySqlD --initialize-insecure --basedir=$MySqlBase --datadir=$DataDir --console
}

if (!(Test-DatabaseReady)) {
  Backup-UndoFiles
  Start-Process -FilePath $MySqlD -ArgumentList @(
    "--basedir=`"$MySqlBase`"",
    "--datadir=`"$DataDir`"",
    "--innodb-undo-directory=`"$DataDir`"",
    "--innodb-undo-tablespaces=0",
    "--port=3306",
    "--bind-address=127.0.0.1",
    "--console"
  ) -WindowStyle Hidden

  $Ready = $false
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if (Test-DatabaseReady) {
      $Ready = $true
      break
    }
  }

  if (!$Ready) {
    Write-Host "MySQL did not become query-ready on 127.0.0.1:3306. Run mysqld with --console to inspect the startup error." -ForegroundColor Red
    exit 1
  }
}

& $MySql -h 127.0.0.1 -P 3306 -u root -e "CREATE DATABASE IF NOT EXISTS ai_learning DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci;"

Set-EnvValue -Key "DATABASE_URL" -Value "mysql+pymysql://root@127.0.0.1:3306/ai_learning?charset=utf8mb4"

Write-Host "Database is ready at 127.0.0.1:3306, database: ai_learning" -ForegroundColor Green
