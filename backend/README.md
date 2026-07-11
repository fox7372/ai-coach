# AI Coach Backend

该后端通过 `DATABASE_URL` 连接独立运行的 MySQL、MariaDB、Docker MySQL 或远程 MySQL。后端脚本不创建项目内数据库实例，也不会启动、关闭或修复数据库进程。

## 配置

```powershell
Copy-Item .env.example .env
```

在 `.env` 中配置数据库和 OpenAI 兼容模型。默认示例使用 `ai_coach` 用户；请替换 `your_password`。密码含 `@`、`:`、`/`、`?`、`#` 等特殊字符时需要 URL 编码。

## 数据库

先使用 Windows 服务、Docker Compose 或远程数据库单独启动 MySQL/MariaDB。

```powershell
Get-Service *mysql*
Get-Service *mariadb*
```

`start_database.ps1` 只用于显示已注册服务状态。需要显式启动停止状态的服务时运行：

```powershell
.\start_database.ps1 -Start
```

Docker 数据库方案位于仓库根目录：

```powershell
$env:MYSQL_ROOT_PASSWORD = "change-this-root-password"
$env:MYSQL_PASSWORD = "your_password"
$env:MYSQL_HOST_PORT = "3307"
docker compose up -d db
```

Docker 默认映射到宿主机 3307 端口，避免与本机 MySQL 的 3306 冲突。使用 Docker 时，`.env` 的 `DATABASE_URL` 也应使用 `127.0.0.1:3307`。

## 启动后端

```powershell
powershell -ExecutionPolicy Bypass -File .\start_backend.ps1
```

脚本会创建或复用 `.venv`，安装依赖，检查数据库连接和 8000 端口。数据库未启动、连接串错误或端口被占用时，脚本会退出并给出处理提示，不会改动数据库或结束其他进程。

启动成功后访问：

- `http://127.0.0.1:8000/health`
- `http://127.0.0.1:8000/docs`
