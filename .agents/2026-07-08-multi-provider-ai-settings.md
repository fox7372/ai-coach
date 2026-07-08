# 2026-07-08 多模型 AI 接口配置

## 修改内容

- 后端 AI 配置从 DeepSeek 专用字段扩展为通用 OpenAI-compatible 配置：
  - `AI_PROVIDER`
  - `AI_API_KEY`
  - `AI_BASE_URL`
  - `AI_MODEL`
- 保留旧 `DEEPSEEK_*` 环境变量读取兼容，旧 `.env` 不会直接失效。
- `/settings/ai` 支持读取和保存 provider、base_url、model、api_key。
- 前端设置页增加模型服务选择：
  - DeepSeek
  - OpenAI
  - 通义千问 DashScope
  - 硅基流动
  - 自定义 OpenAI 兼容接口
- README 和 `.env.example` 更新为多模型配置说明。

## 验证

- `backend\.venv-win\Scripts\python.exe -m py_compile backend\app\database.py backend\app\ai_service.py backend\app\main.py` 通过。
- 前端 `tsc -b` 通过。
- 前端 `vite build` 通过。
- 本地 8001 临时端口验证：
  - `/health` 返回数据库连接正常。
  - `/settings/ai` 返回 `provider=deepseek`、`model=deepseek-chat`、`has_api_key=false`。

## 注意

- 当前 `.env` 里没有 API Key，所以健康检查显示 `ai_provider=mock` 是正常的；需要在前端设置页重新输入 API Key。
- 8000 端口验证时发现旧服务占用异常：`netstat` 显示 8000 被 PID 63264 监听，但系统进程查询显示该 PID 不存在，导致新后端无法绑定 8000。代码本身已在 8001 验证。
