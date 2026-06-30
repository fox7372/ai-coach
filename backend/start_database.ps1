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
  Remove-Item -LiteralPath (Join-Path $DataDir "undo_001"), (Join-Path $DataDir "undo_002") -Force -ErrorAction SilentlyContinue
  Start-Process -FilePath $MySqlD -ArgumentList @(
    "--basedir=$MySqlBase",
    "--datadir=$DataDir",
    "--innodb-undo-directory=$DataDir",
    "--port=3306",
    "--bind-address=127.0.0.1",
    "--console"
  ) -WindowStyle Hidden
  Start-Sleep -Seconds 8
}

& $MySql -h 127.0.0.1 -P 3306 -u root -e "CREATE DATABASE IF NOT EXISTS ai_learning DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci;"

[System.IO.File]::WriteAllText(
  (Join-Path $ProjectRoot ".env"),
  "DATABASE_URL=mysql+pymysql://root@127.0.0.1:3306/ai_learning?charset=utf8mb4",
  [System.Text.UTF8Encoding]::new($false)
)

Write-Host "Database is ready at 127.0.0.1:3306, database: ai_learning" -ForegroundColor Green
