# 2026-07-05 Fix frontend 5174 CORS

## Change
- Added `http://localhost:5174` and `http://127.0.0.1:5174` to backend CORS allowed origins.
- Also allowed nearby Vite fallback port 5175 for local development.

## Reason
- The frontend was running at `http://localhost:5174/`, but the backend only allowed `5173`.
- Browser requests from 5174 were blocked by CORS, making it appear that the frontend was not connected to the backend.

## Verification
- `backend/.venv-win/Scripts/python.exe -m py_compile backend/app/main.py`
- Restarted backend on port 8000.
- `GET http://127.0.0.1:8000/health` returned `database: connected`.
- `GET http://127.0.0.1:8000/courses` with `Origin: http://localhost:5174` returned `Access-Control-Allow-Origin: http://localhost:5174`.
- `GET http://localhost:5174/` returned 200.
