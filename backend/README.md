# AI Learning Diagnosis Backend

本后端不依赖 WSL，按 Windows 本机运行。

## 1. 数据库

当前机器已有 MySQL Server 8.4，项目使用 PyMySQL 连接，和 MariaDB 协议兼容。运行下面命令会在项目目录创建一个本地数据库数据目录 `.mysql-data`，并创建 `ai_learning` 数据库：

```powershell
.\start_database.ps1
```

它会自动写入 `.env`：

```env
DATABASE_URL=mysql+pymysql://root@127.0.0.1:3306/ai_learning?charset=utf8mb4
```

## 2. 启动后端

在 Windows PowerShell 里执行：

```powershell
.\start_backend.ps1
```

启动成功后访问：

- `http://127.0.0.1:8000/health`
- `http://127.0.0.1:8000/docs`

## 3. 当前接口

- `GET /health`
- `GET /courses`
- `POST /documents/upload`
- `POST /qa/ask`
- `POST /diagnosis/signals`
- `POST /mistakes`
- `GET /mistakes`
