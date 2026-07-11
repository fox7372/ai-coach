[CmdletBinding()]
param(
  [switch]$Start
)

$ErrorActionPreference = "Stop"

$DatabaseServices = @(Get-Service -ErrorAction SilentlyContinue |
  Where-Object {
    $_.Name -match "mysql|mariadb" -or $_.DisplayName -match "mysql|mariadb"
  } |
  Sort-Object Name)

if ($DatabaseServices.Count -eq 0) {
  Write-Host "未找到已注册的 MySQL 或 MariaDB Windows 服务。" -ForegroundColor Yellow
  Write-Host "可选方案：" -ForegroundColor Yellow
  Write-Host "  1. 安装并注册 MySQL/MariaDB 服务。" -ForegroundColor DarkGray
  Write-Host "  2. 在仓库根目录执行：docker compose up -d db" -ForegroundColor DarkGray
  Write-Host "  3. 在 backend/.env 中配置远程 MySQL 的 DATABASE_URL。" -ForegroundColor DarkGray
  exit 1
}

Write-Host "检测到以下数据库服务：" -ForegroundColor Cyan
$DatabaseServices | Select-Object Name, DisplayName, Status | Format-Table -AutoSize

$StoppedServices = @($DatabaseServices | Where-Object { $_.Status -ne "Running" })
if (!$Start) {
  if ($StoppedServices.Count -gt 0) {
    Write-Host "服务未启动。请在确认服务名称后执行：" -ForegroundColor Yellow
    foreach ($Service in $StoppedServices) {
      Write-Host "  .\start_database.ps1 -Start  # 启动 $($Service.Name)" -ForegroundColor DarkGray
      Write-Host "  或 Start-Service $($Service.Name)" -ForegroundColor DarkGray
    }
  } else {
    Write-Host "数据库服务已在运行。" -ForegroundColor Green
  }
  exit 0
}

foreach ($Service in $StoppedServices) {
  Write-Host "正在启动 Windows 服务 $($Service.Name)..." -ForegroundColor Cyan
  Start-Service -Name $Service.Name
}

$DatabaseServices = @(Get-Service -Name $DatabaseServices.Name)
$DatabaseServices | Select-Object Name, DisplayName, Status | Format-Table -AutoSize
Write-Host "数据库服务启动命令已执行。后端脚本只会检查连接，不会管理数据库进程。" -ForegroundColor Green
