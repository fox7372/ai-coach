# 2026-07-08 修复 AI 配置删除后仍显示已配置

## 原因

- 当前 8000 端口运行的是旧后端，`DELETE /settings/ai` 返回 405。
- 旧后端仍从 `.env` 里的 `DEEPSEEK_*` 配置读取模型和 Key，所以前端仍显示已配置。
- `start_backend.ps1` 之前只检查 `/health`，旧后端健康检查通过时会直接退出，不会加载新代码。

## 修改内容

- 前端删除 AI 配置失败时显示明确提示：当前后端可能不是最新版本，需要重启后端。
- `start_backend.ps1` 增加新版接口检测：
  - 如果 8000 已运行且 `/openapi.json` 包含 `DELETE /settings/ai`，才认为后端可用。
  - 如果 8000 是旧后端，则尝试停止旧端口并重启。
  - 如果端口仍被占用，给出明确错误。
- 已清理本机 `backend\.env` 中的 AI 配置键，但不提交 `.env`。

## 验证

- `start_backend.ps1` 脚本解析通过。
- 前端 `tsc -b` 通过。
- 前端 `vite build` 通过。
