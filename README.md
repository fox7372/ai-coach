# AI Coach

## 总体描述

AI Coach 是面向学生的课程专属知识库与学习辅导平台。学生把 PDF、PPT、Word、网页或视频资料导入课程后，系统完成解析、切块、向量索引与课程范围检索；后续 AI 问答、知识点、测验、错题复盘、学习诊断、学习画像和学习计划都基于课程资料与学习记录协同工作。

系统把业务数据与向量数据分开保存：MySQL/MariaDB 记录用户、课程、资料、会话、测验、错题与学习行为；Chroma 保存文档切块的 Embedding。这使课程资料可被检索，同时学习过程可被持续分析，而不只是一次性的聊天机器人。

当前版本面向课程设计、毕业设计原型、个人使用和小范围演示，不以高并发生产部署为目标。

## 核心功能

- 用户注册、登录、课程创建、编辑和删除
- PDF、PPT/PPTX、DOCX 资料上传与批量导入；支持网页和视频资料入口
- PDF 可选 PyMuPDF 快速解析或 Docling 结构化解析；DOCX 使用 python-docx，演示文稿使用 Docling
- 基于课程资料的 RAG 问答，保留会话、历史记录和检索来源
- 从课程资料生成知识点和测验，支持作答、参考答案、AI 判题和解析
- 错题库：作答错题、手动录入、问答加入错题、图片分析与复盘状态
- 学习诊断与学习画像：综合作答成绩、错题复盘、学习打卡、学习时长、提问和学习建议；样本不足时显示“待采样”而不是错误地显示为 0%
- 整体学习计划、每日学习计划、学习反馈和计划更新
- 通过 OpenAI 兼容接口接入不同的对话大模型

## RAG 流程

```mermaid
flowchart LR
    A["上传课程资料"] --> B["解析与文本切块"]
    B --> C["Transformers Embedding"]
    C --> D["Chroma 持久化知识库"]
    Q["学生问题"] --> E["同模型生成问题向量"]
    E --> F["按课程过滤并点积召回"]
    D --> F
    F --> G["Cross-Encoder 重排"]
    G --> H["OpenAI 兼容大模型回答"]
    H --> I["回答与来源片段"]
```

- Embedding：默认 `BAAI/bge-small-zh-v1.5`，由 Transformers 在本机生成归一化向量。
- 向量库：Chroma `PersistentClient`，默认目录为 `backend/chroma_db`，使用 inner-product 空间。
- 召回：在同一课程范围内获取候选片段，并用点积重新排序，默认候选数为 30。
- 重排：默认 `cross-encoder/mmarco-mMiniLMv2-L12-H384-v1`，保留前 5 个片段。
- 生成：通过 OpenAI SDK 调用兼容 Chat Completions 的服务，可配置 DeepSeek、OpenAI、通义千问、硅基流动或其他兼容服务。

“OpenAI 兼容”只代表接口格式兼容，不代表模型必须来自 OpenAI。修改 `AI_BASE_URL`、`AI_API_KEY` 和 `AI_MODEL` 即可切换服务商，无需改业务代码。

## 技术栈

| 层级 | 技术 | 用途 |
| --- | --- | --- |
| 前端 | React 19、TypeScript、Vite、Tailwind CSS | 学习工作台、上传、问答、测验、错题和诊断界面 |
| 前端能力 | Axios、React Router、React Markdown、KaTeX、Lucide React | API 访问、路由、Markdown/公式渲染和图标 |
| 后端 | Python、FastAPI、Uvicorn、Pydantic Settings | REST API、配置、启动检查与业务编排 |
| 业务数据 | SQLAlchemy、PyMySQL、MySQL 8.4 / MariaDB | 用户、课程、资料、会话、题目、错题和学习记录 |
| 向量知识库 | Chroma PersistentClient | 课程文档切块、元数据与归一化 Embedding 的本地持久化检索 |
| RAG 模型 | Transformers、PyTorch、NumPy | BGE Embedding、课程过滤、点积召回与 Cross-Encoder 重排；支持 CUDA 回退 |
| 资料处理 | PyMuPDF、Docling、python-docx、yt-dlp | PDF、演示文稿、Word、网页和视频资料处理 |
| 图片能力 | PaddleOCR、pytesseract、Pillow | 错题图片 OCR 兜底；可配合视觉模型分析图片 |
| 本地运行 | Docker Compose、PowerShell | MySQL 容器、Windows 启动脚本与服务预检 |

## 目录结构

```text
.
├── backend/
│   ├── app/
│   │   ├── api/routes/         # 按业务域拆分的 FastAPI 路由
│   │   ├── services/           # 解析、索引、检索和应用服务
│   │   ├── ai_service.py       # OpenAI 兼容模型调用与文本处理
│   │   ├── rag_service.py      # Embedding、Chroma 召回和重排
│   │   ├── runtime.py          # 共享运行时依赖
│   │   ├── database.py         # 数据库与 RAG 配置
│   │   ├── main.py             # FastAPI 应用装配
│   │   └── models.py           # SQLAlchemy 数据模型
│   ├── requirements.txt
│   ├── requirements-gpu.txt
│   ├── start_backend.ps1
│   └── start_database.ps1
├── 前端/
│   ├── src/
│   │   ├── components/         # 课程详情、上传、问答和学习面板
│   │   └── shared/             # 类型、常量、工具和通用组件
│   ├── package.json
│   └── vite.config.ts
├── docker-compose.yml
├── start_project.ps1           # Docker 数据库、后端和前端的一键启动
└── README.md
```

## 部署前下载与配置

部署机器需要能够访问数据库、所选大模型服务，以及 Hugging Face 模型下载源。首次导入资料或提问时，Embedding 和重排模型会自动下载；建议在上线前预热一次，避免首次用户请求等待下载。

### 必需环境

1. 安装 Node.js 20 或更高版本，并安装 pnpm。
2. 安装 Python 3.11 或与项目依赖兼容的版本，并确保可以创建虚拟环境。
3. 安装 Docker Desktop，或准备可连接的 MySQL/MariaDB 数据库。
4. 准备一个 OpenAI 兼容大模型服务的 API Key；没有 API Key 时，问答、出题和分析功能无法生成内容。
5. 确保服务器可写入 `backend/uploads`、`backend/chroma_db` 和数据库数据目录，并把这些运行数据排除在 Git 之外。

### 后端依赖下载

在后端目录创建虚拟环境并安装依赖：

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

这会下载 FastAPI、SQLAlchemy、PyMuPDF、Docling、Chroma、Transformers、PyTorch、PaddleOCR 等 Python 依赖。`Docling`、`PaddleOCR`、`PyTorch` 和 Transformers 模型体积较大，部署时需要预留磁盘空间和网络带宽。

如需 GPU，确认 NVIDIA 驱动和 CUDA 环境与 PyTorch CUDA 轮子匹配后安装：

```powershell
pip install -r requirements-gpu.txt
```

`RAG_DEVICE=auto` 会在检测到 CUDA 时优先使用 GPU；没有可用 GPU 时自动回退到 CPU。

### 本地模型预热

默认会下载以下 Hugging Face 模型：

```text
BAAI/bge-small-zh-v1.5
cross-encoder/mmarco-mMiniLMv2-L12-H384-v1
```

在受限网络环境中，应提前配置可用的 Hugging Face 镜像或把模型缓存带到部署机器。模型首次下载成功后会由 Transformers 缓存；之后服务可复用本地缓存。

### 可选系统组件

- 需要处理错题图片且不使用视觉模型时，安装 Tesseract OCR，并准备中文语言包 `chi_sim`；项目会在 PaddleOCR 不可用时尝试该备用路径。
- 使用视频资料导入时，需要网络可访问对应视频平台及可用字幕；`yt-dlp` 已包含在 Python 依赖中，但部分平台可能受到访问限制。
- 大文件解析、视频导入和 OCR 当前在后端进程内执行。正式生产部署建议增加后台任务队列、资源限制、对象存储与备份策略。

## 配置环境变量

复制示例配置：

```powershell
cd backend
Copy-Item .env.example .env
```

至少配置数据库和对话模型：

```env
DATABASE_URL=mysql+pymysql://ai_coach:123456@127.0.0.1:3307/ai_learning?charset=utf8mb4
AI_PROVIDER=deepseek
AI_API_KEY=your_api_key
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-chat

CHROMA_PERSIST_DIR=backend/chroma_db
EMBEDDING_MODEL=BAAI/bge-small-zh-v1.5
RERANKER_MODEL=cross-encoder/mmarco-mMiniLMv2-L12-H384-v1
RAG_DEVICE=auto
```

其他 OpenAI 兼容服务示例：

```env
# OpenAI
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini

# 通义千问兼容接口
AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
AI_MODEL=qwen-plus

# 硅基流动兼容接口
AI_BASE_URL=https://api.siliconflow.cn/v1
AI_MODEL=deepseek-ai/DeepSeek-V3
```

## 本地启动

### 推荐：一键启动 Docker 开发环境

首次使用时先复制配置并填写大模型 Key：

```powershell
Copy-Item backend\.env.example backend\.env
```

在仓库根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\start_project.ps1
```

该脚本会启动或复用 Docker Desktop 和 MySQL 容器，等待数据库可连接，再启动或复用后端与前端。它不会结束已存在的进程；若 `8000` 或 `5173` 被其他无关进程占用，会明确报错而不是强制关闭进程。

默认 Docker 数据库连接为 `ai_coach:123456@127.0.0.1:3307/ai_learning`。首次部署前请同时修改根目录 Docker 环境变量 `MYSQL_PASSWORD` 与 `backend/.env` 中的 `DATABASE_URL` 密码。若使用已有 Windows 服务或远程数据库，可跳过 Docker：

```powershell
powershell -ExecutionPolicy Bypass -File .\start_project.ps1 -SkipDatabase
```

### 手动启动

### 1. 准备环境变量

```powershell
cd backend
Copy-Item .env.example .env
```

编辑 `backend/.env` 中的 `DATABASE_URL` 与大模型配置。数据库密码中如有 `@`、`:`、`/`、`?`、`#` 等特殊字符，必须进行 URL 编码后再写入连接串。

### 2. 单独启动数据库

后端启动脚本不会启动、关闭、重启或修复数据库。请选择一种方式单独提供 MySQL/MariaDB。

#### Windows MySQL/MariaDB 服务

```powershell
Get-Service *mysql*
Get-Service *mariadb*
Start-Service <实际服务名称>
```

也可以使用项目保留的服务状态检查脚本：

```powershell
cd backend
.\start_database.ps1
.\start_database.ps1 -Start
```

不带参数时它只显示已注册服务状态；只有显式传入 `-Start` 才会启动停止状态的 Windows 服务。

#### Docker Compose

在仓库根目录设置数据库密码并启动数据库容器：

```powershell
$env:MYSQL_ROOT_PASSWORD = "change-this-root-password"
$env:MYSQL_PASSWORD = "123456"
$env:MYSQL_HOST_PORT = "3307"
docker compose up -d db
docker compose ps
```

Docker 默认使用宿主机 `3307` 端口，避免与已安装的 Windows MySQL 服务占用的 3306 冲突。此处的 `MYSQL_PASSWORD` 必须与 `backend/.env` 中 `DATABASE_URL` 的 `ai_coach` 密码一致；Docker 方式的连接串端口也应写为 `3307`。也可以把 `DATABASE_URL` 指向远程 MySQL 服务。

### 3. 启动后端

```powershell
cd backend
powershell -ExecutionPolicy Bypass -File .\start_backend.ps1
```

启动脚本会创建或复用 `backend/.venv`，安装依赖，读取 `.env`（缺失时临时使用 `.env.example`），检查数据库连接和 8000 端口。数据库连接失败或端口被占用时会清晰报错并退出，不会自动处理数据库或结束任何进程。

如果此前在 WSL/Linux 中创建过 `backend/.venv`，Windows 下会缺少 `Scripts/python.exe`。请在确认不再使用后手动删除或重命名该虚拟环境，再运行启动脚本；脚本不会自动覆盖已有虚拟环境。

后端健康检查：`http://127.0.0.1:8000/health`

接口文档：`http://127.0.0.1:8000/docs`

### 4. 启动前端

```powershell
cd 前端
pnpm install
pnpm dev
```

默认地址：`http://127.0.0.1:5173`

### 5. 停止服务

- 后端：在启动后端的终端中按 `Ctrl+C`。
- Docker 数据库：在仓库根目录执行 `docker compose stop db`。
- Windows 数据库服务：执行 `Stop-Service <实际服务名称>`。

不要通过任务管理器强制结束 `mysqld.exe`，这可能损坏 InnoDB 数据。

## 验证

后端测试：

```powershell
cd backend
pytest -q
```

前端生产构建：

```powershell
cd 前端
pnpm build
```

## 数据与安全说明

以下运行数据和密钥不得提交到 Git：

- `backend/.env`
- `backend/.mysql-data/`、`backend/.mysql-data-backup-*/`、`backend/.mysql-data-corrupt-*/`（旧版遗留数据库目录）
- `backend/uploads/`
- `backend/chroma_db/`
- `backend/.venv/`、`backend/.venv-win/`
- `前端/node_modules/`、`前端/dist/`、`前端/.env.local`

当前认证与部署方式仍以演示和本地开发为目标。公开部署前需要补充密码策略、会话或令牌鉴权、权限隔离、HTTPS、日志脱敏、备份与恢复流程。

### 旧版数据库目录迁移

新版本不会创建或管理 `backend/.mysql-data`。如果旧版本中已有该目录，请先完成备份；不要直接删除仍含有效数据的目录。如果数据不需要保留，确认关联的 MySQL 进程已经停止后，再由管理员手动移除旧目录。脚本不会移动 undo 文件、删除数据目录或尝试修复 InnoDB 文件。

## 当前限制与后续方向

- 文档和图片处理是同步 MVP 流程，大文件需要等待；可升级为 Redis + Celery/RQ 等后台任务队列。
- 本地向量库、上传文件和数据库需要单独备份；可迁移到对象存储和托管数据库。
- 可继续完善课程资料的页码/段落级引用、用户隔离、计划版本管理、部署脚本和 CI 检查。
