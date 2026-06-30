# 2026-06-30 Fix MySQL Undo Startup

## Problem

- Backend failed during FastAPI startup because SQLAlchemy could not connect to MySQL at `127.0.0.1:3306`.
- Running `mysqld --console` showed InnoDB undo tablespace conflicts:
  - `Can't create UNDO tablespace ... undo_001/undo_002 already exists`

## Action

- Moved stale undo files into timestamped backup directories instead of deleting them.
- Started MySQL again and confirmed `127.0.0.1:3306` was listening.
- Created/confirmed the `ai_learning` database.
- Started FastAPI backend and confirmed `/health` returned database connected.

## Code Change

- Updated `backend/start_database.ps1`:
  - backs up stale undo files before starting MySQL,
  - no longer passes `--innodb-undo-directory`,
  - waits for port `3306` before printing success.

## Verification

- `GET http://127.0.0.1:8000/health` returned:
  - `status: ok`
  - `database: connected`
