# 2026-07-05 Avoid duplicate backend startup

## Change
- Updated `backend/start_backend.ps1` to check `http://127.0.0.1:8000/health` before starting Uvicorn.
- If the backend is already healthy, the script now prints the running URL and exits successfully.

## Reason
- Running the startup script while an existing backend already listens on port 8000 caused `WinError 10013`.
- The backend was already available, so starting a second Uvicorn process was unnecessary.

## Verification
- Ran `powershell -ExecutionPolicy Bypass -File .\start_backend.ps1`.
- Script output included `Backend is already running at http://127.0.0.1:8000/health`.
- Confirmed health endpoint returns `{"status":"ok","database":"connected","ai_provider":"mock","ai_model":"deepseek-chat"}`.
