$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

$Node = "C:\Users\fox\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$Vite = Join-Path $ProjectRoot "node_modules\vite\bin\vite.js"

if (!(Test-Path $Node)) {
  throw "Codex bundled Node was not found: $Node"
}

if (!(Test-Path $Vite)) {
  throw "Vite was not found: $Vite. Please install frontend dependencies first."
}

& $Node $Vite --host 0.0.0.0 --port 5173
