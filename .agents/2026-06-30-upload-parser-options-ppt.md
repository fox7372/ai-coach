# 2026-06-30 Upload parser options and PPT support

## Change
- Added an upload parser option for PDF files:
  - `pymupdf`: fast parsing for normal text PDFs.
  - `docling`: slower structured parsing for complex PDFs.
- Added PPT/PPTX upload support through Docling.
- Refactored document chunk saving so PDF and presentation parsing share the same RAG chunk persistence path.
- Updated the frontend upload panel to show the two parser choices and accept `.pdf`, `.ppt`, `.pptx`.

## Verification
- `backend/.venv-win/Scripts/python.exe -m py_compile backend/app/main.py`
- `node node_modules/typescript/bin/tsc -b`
- `node node_modules/vite/bin/vite.js build`
- Created a temporary PPTX and verified Docling extracted one text chunk.
