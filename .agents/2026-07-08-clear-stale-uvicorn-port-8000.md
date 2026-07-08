# 2026-07-08 清理 8000 旧后端占用

## 现象

- 前端删除 AI 配置时，后端日志显示 `DELETE /settings/ai` 返回 405。
- 本地代码路由表已包含 `GET /settings/ai`、`POST /settings/ai`、`DELETE /settings/ai`。
- 8000 端口实际运行的是旧后端，OpenAPI 里只有 `get` 和 `post`。

## 原因

- Windows `netstat` 显示 8000 监听进程为 PID 63264，但系统中没有这个进程。
- 进一步检查发现存在异常 Python 子进程 PID 23296，其父进程 ID 为 63264。
- 停止 PID 23296 后，8000 端口释放。

## 处理

- 已停止异常旧 Python 子进程。
- 已启动当前代码版本的后端。
- `DELETE /settings/ai` 已验证可用，当前 AI 配置为 `has_api_key=false`。
- 增强 `start_backend.ps1`：当端口 PID 本身无法停止时，会尝试停止该 PID 的子进程，避免旧后端残留。

## 验证

- `start_backend.ps1` 脚本解析通过。
- `/settings/ai` 返回默认配置且 `has_api_key=false`。
- `/openapi.json` 中 `/settings/ai` 已包含 `delete,get,post`。
