# 2026-07-05 Fix MySQL startup readiness

## Change
- Updated `backend/start_database.ps1` to validate MySQL readiness with an actual `SELECT 1` query instead of only checking whether port 3306 briefly opens.
- Kept undo-file backup handling, but made the readiness check stricter so the script does not report success when MySQL later exits.
- Added `--innodb-undo-directory=$DataDir` to the MySQL startup arguments to match the existing local data directory setup.
- Updated `backend/start_backend.ps1` to always call the database readiness script before starting Uvicorn.
- Added a local browser URL hint: `http://127.0.0.1:8000/health`.

## Reason
- MySQL could briefly open port 3306 and then exit because of undo tablespace startup errors.
- The old script treated that transient port opening as success, then FastAPI got stuck at startup because the database was not actually query-ready.
- The browser was opened at `http://0.0.0.0:8000/`, but `0.0.0.0` is a listen address, not the local browser address.

## Verification
- `backend/start_database.ps1`
- `mysql -h 127.0.0.1 -P 3306 -u root --connect-timeout=2 -e "SELECT 1 AS ok;"`
- `Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/health`
- Health response: `{"status":"ok","database":"connected","ai_provider":"mock","ai_model":"deepseek-chat"}`
