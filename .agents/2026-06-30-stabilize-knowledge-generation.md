# 2026-06-30 Stabilize knowledge point generation

## Change
- Added `force` to the knowledge point generation request.
- Default generation now reuses existing saved knowledge points instead of deleting and regenerating them.
- Added explicit regeneration behavior with confirmation in the frontend.
- Single-resource knowledge generation also reuses existing points by default and provides a separate regenerate action.
- Knowledge point AI generation now uses `temperature=0` and caps parsed output to 8 points.

## Reason
- Repeated clicks previously deleted and regenerated points, causing different names and counts across runs.
- The new behavior separates stable viewing from explicit overwrite.

## Verification
- `backend/.venv-win/Scripts/python.exe -m py_compile backend/app/main.py backend/app/ai_service.py`
- `node node_modules/typescript/bin/tsc -b`
- `node node_modules/vite/bin/vite.js build`
