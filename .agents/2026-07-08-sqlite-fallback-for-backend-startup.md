# 2026-07-08 SQLite fallback for backend startup

## Change
- Changed backend default `DATABASE_URL` to `sqlite:///./ai_learning.db`.
- Added SQLite connection options in `backend/app/database.py`.
- Made schema migration helpers compatible with SQLite by using `PRAGMA table_info`.
- Updated `start_backend.ps1` to try MySQL first, then fall back to SQLite if MySQL does not become query-ready.
- Changed `start_database.ps1` failures from `exit 1` to `throw` so `start_backend.ps1` can catch them.
- Updated `.env.example` to use SQLite by default and keep MySQL/MariaDB as an optional example.
- Ignored `backend/*.db` runtime database files.

## Reason
- Local MySQL 8.4 repeatedly failed on startup with InnoDB undo tablespace errors.
- The backend was getting stuck because the database was not query-ready.
- SQLite fallback keeps the development server usable after computer restarts while preserving the option to switch back to MariaDB/MySQL via `.env`.

## Verification
- `backend/.venv-win/Scripts/python.exe -m py_compile backend/app/main.py backend/app/database.py`
- `GET http://127.0.0.1:8000/health`
- Health response returned `database: connected`.
