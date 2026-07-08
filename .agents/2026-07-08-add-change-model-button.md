# 2026-07-08 设置页增加更改模型按钮

## 修改内容

- 设置页新增“更改模型”按钮。
- “保存 API Key”继续要求输入 API Key，用于保存或替换 Key。
- “更改模型”只更新：
  - provider
  - base_url
  - model
- 更改模型时不要求重新输入 API Key，会保留已有 Key。
- 后端 `AIConfigUpdate.api_key` 改为可选，未传 Key 时只更新模型配置，不覆盖已有 Key。

## 验证

- 后端 `py_compile backend\app\main.py` 通过。
- 后端 OpenAPI 显示 `api_key` 不再是必填字段。
- 前端 `tsc -b` 通过。
- 前端 `vite build` 通过。
- 本地后端已重启，并验证 `POST /settings/ai` 不传 API Key 时仍能保存模型配置且保留已有 Key。
