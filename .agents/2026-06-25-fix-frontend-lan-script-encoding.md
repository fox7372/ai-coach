# 2026-06-25 修复前端局域网脚本编码

## 背景

用户运行 `start_frontend_lan.ps1` 时，Windows PowerShell 将脚本中的中文错误信息按错误编码解析，导致字符串缺少终止符。

## 修改

- 将 `start_frontend_lan.ps1` 中的中文 `throw` 信息改为纯 ASCII 英文。
- 避免 PowerShell 5 在不同编码环境下误读脚本字符串。

## 验证

- 已运行 `powershell -ExecutionPolicy Bypass -File .\start_frontend_lan.ps1`，不再出现解析错误。
- 已确认 `http://127.0.0.1:5173` 返回 200。
