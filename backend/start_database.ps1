$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

$MySqlBase = "C:\Program Files\MySQL\MySQL Server 8.4"
$MySqlD = Join-Path $MySqlBase "bin\mysqld.exe"
$MySql = Join-Path $MySqlBase "bin\mysql.exe"
$DataDir = Join-Path $ProjectRoot ".mysql-data"

if (!(Test-Path $MySqlD)) {
  Write-Host "MySQL/MariaDB compatible server was not found at: $MySqlD" -ForegroundColor Red
  exit 1
}

if (!(Test-Path $DataDir)) {
  New-Item -ItemType Directory -Path $DataDir | Out-Null
  & $MySqlD --initialize-insecure --basedir=$MySqlBase --datadir=$DataDir --innodb-undo-directory=$DataDir --console
}

$PortOpen = Test-NetConnection 127.0.0.1 -Port 3306 -InformationLevel Quiet
if (!$PortOpen) {
  $UndoFiles = @("undo_001", "undo_002", "undo_1_trunc.log", "undo_2_trunc.log")
  $ExistingUndoFiles = $UndoFiles | ForEach-Object { Join-Path $DataDir $_ } | Where-Object { Test-Path $_ }
  if ($ExistingUndoFiles.Count -gt 0) {
    $UndoBackupDir = Join-Path $DataDir ("undo-backup-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
    New-Item -ItemType Directory -Path $UndoBackupDir | Out-Null
    foreach ($UndoFile in $ExistingUndoFiles) {
      Move-Item -LiteralPath $UndoFile -Destination (Join-Path $UndoBackupDir (Split-Path -Leaf $UndoFile))
    }
    Write-Host "Moved stale undo files to: $UndoBackupDir" -ForegroundColor Yellow
  }

  Start-Process -FilePath $MySqlD -ArgumentList @(
    "--basedir=$MySqlBase",
    "--datadir=$DataDir",
    "--port=3306",
    "--bind-address=127.0.0.1",
    "--console"
  ) -WindowStyle Hidden

  $Ready = $false
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    if (Test-NetConnection 127.0.0.1 -Port 3306 -InformationLevel Quiet) {
      $Ready = $true
      break
    }
  }

  if (!$Ready) {
    Write-Host "MySQL did not start on 127.0.0.1:3306. Run mysqld with --console to inspect the startup error." -ForegroundColor Red
    exit 1
  }
}

& $MySql -h 127.0.0.1 -P 3306 -u root -e "CREATE DATABASE IF NOT EXISTS ai_learning DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci;"

[System.IO.File]::WriteAllText(
  (Join-Path $ProjectRoot ".env"),
  "DATABASE_URL=mysql+pymysql://root@127.0.0.1:3306/ai_learning?charset=utf8mb4",
  [System.Text.UTF8Encoding]::new($false)
)

Write-Host "Database is ready at 127.0.0.1:3306, database: ai_learning" -ForegroundColor Green
