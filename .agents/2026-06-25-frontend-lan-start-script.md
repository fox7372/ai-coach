# 2026-06-25 前端局域网启动脚本

## 背景

用户在 PowerShell 中运行 `npm` 时提示命令不存在，需要一个不依赖系统 npm PATH 的前端启动方式。

## 修改

- 新增 `前端/start_frontend_lan.ps1`。
- 脚本使用 Codex 自带 Node 直接运行项目内 Vite。
- 启动参数使用 `--host 0.0.0.0 --port 5173`，方便同一局域网设备访问。

## 使用

```powershell
cd C:\Users\fox\Desktop\work\前端
powershell -ExecutionPolicy Bypass -File .\start_frontend_lan.ps1
```
