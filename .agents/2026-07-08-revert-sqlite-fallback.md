# 2026-07-08 Revert SQLite fallback

## Change
- Reverted commit `853e64b Add SQLite fallback for backend startup`.
- Restored backend default database behavior to MySQL/MariaDB.
- Restored local `backend/.env` `DATABASE_URL` to the MySQL connection string.
- Removed the generated local SQLite runtime file `backend/ai_learning.db`.

## Reason
- User requested returning to the previous version so the original MySQL/MariaDB data remains the active backend data source.

## Verification
- `git revert --no-edit 853e64b`
- Confirmed local `backend/.env` points to `mysql+pymysql://root@127.0.0.1:3306/ai_learning?charset=utf8mb4`.
