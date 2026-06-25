$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

$Node = "C:\Users\fox\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$Vite = Join-Path $ProjectRoot "node_modules\vite\bin\vite.js"

if (!(Test-Path $Node)) {
  throw "找不到 Codex 自带 Node：$Node"
}

if (!(Test-Path $Vite)) {
  throw "找不到 Vite：$Vite，请先安装前端依赖。"
}

& $Node $Vite --host 0.0.0.0 --port 5173
