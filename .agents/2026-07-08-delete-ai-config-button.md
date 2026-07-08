# 2026-07-08 前端删除 AI 配置

## 修改内容

- 后端新增 `DELETE /settings/ai` 接口。
- 删除 AI 配置时会同时清理新旧环境变量：
  - `AI_PROVIDER`
  - `AI_API_KEY`
  - `AI_BASE_URL`
  - `AI_MODEL`
  - `DEEPSEEK_API_KEY`
  - `DEEPSEEK_BASE_URL`
  - `DEEPSEEK_MODEL`
- 删除后运行时 AI 服务回到默认演示模式。
- 前端设置页新增“删除 AI 配置”按钮，并带确认提示。

## 验证

- 后端 `py_compile backend\app\main.py` 通过。
- 前端 `tsc -b` 通过。
- 前端 `vite build` 通过。
