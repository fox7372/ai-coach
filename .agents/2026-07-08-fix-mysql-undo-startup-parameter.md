# 2026-07-08 Fix MySQL undo startup parameter

## Change
- Added `--innodb-undo-tablespaces=0` to `backend/start_database.ps1`.
- Quoted `--basedir`, `--datadir`, and `--innodb-undo-directory` values for `Start-Process` so paths containing spaces are passed correctly.
- Changed `.env` writing in `start_database.ps1` to update only `DATABASE_URL` instead of overwriting the full file.
- Added `backend/.mysql-data-backup-*/` to `.gitignore`.

## Reason
- MySQL 8.4 repeatedly failed with `Can't create UNDO tablespace ... undo_001 already exists`.
- Manual startup worked only when undo files were moved and `--innodb-undo-tablespaces=0` was supplied.
- The script also risked breaking paths under `C:\Program Files` because `Start-Process -ArgumentList` needs explicit quoting.
- The old script overwrote `.env` and removed AI settings.

## Verification
- `powershell -ExecutionPolicy Bypass -File .\start_database.ps1`
- `mysql -h 127.0.0.1 -P 3306 -u root --connect-timeout=2 -e "SELECT 1 AS ok; SELECT COUNT(*) AS courses FROM ai_learning.courses;"`
- MySQL returned `ok=1` and `courses=4`.
- `GET http://127.0.0.1:8000/health` returned `database: connected`.
