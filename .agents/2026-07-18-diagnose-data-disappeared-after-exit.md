# 2026-07-18 退出后数据消失排查

## 现象

- 用户反馈退出后所有数据消失。
- 访问 `127.0.0.1:8000` 时后端不可连接。
- `backend/.env` 当前指向 Docker MySQL：`127.0.0.1:3307`。

## 原因

- Docker Desktop 服务处于停止状态，`127.0.0.1:3307` 没有数据库监听。
- 后端无法连接数据库，因此前端表现为空或不可用，看起来像数据消失。
- 当前项目已切换为 Docker MySQL，数据保存在 Docker volume `work_mysql_data`，不是旧版 `backend/.mysql-data`。
- Windows 后端启动脚本原本使用 `backend/.venv`，但该目录是 WSL/Linux 虚拟环境；Windows 下应使用 `backend/.venv-win`。

## 处理

- 修复 `backend/start_backend.ps1`，Windows 后端固定使用 `backend/.venv-win`，不再被 WSL 的 `backend/.venv` 干扰。
- 修复 `start_project.ps1` 中 Docker 检测逻辑，Docker 未启动时不再因 native stderr 直接中断，而是进入自动启动 Docker Desktop 流程。
- 已运行 `start_project.ps1`，Docker MySQL 和后端均启动成功。

## 验证

- `docker compose ps` 显示 `work-db-1` 运行，端口为 `127.0.0.1:3307->3306`。
- `/health` 返回数据库已连接。
- 当前 Docker 数据库记录数：
  - `users`: 1
  - `courses`: 3
  - `documents`: 10
  - `document_chunks`: 655
  - `knowledge_points`: 66
  - `chat_sessions`: 3
  - `learning_suggestions`: 10
  - `mistake_records`: 0
  - `chat_messages`: 0

## 注意

- 如果用户要找更早版本里的错题或聊天记录，可能需要从旧版 `backend/.mysql-data` 或备份目录中迁移到 Docker volume；当前 Docker 库本身没有这些记录。
