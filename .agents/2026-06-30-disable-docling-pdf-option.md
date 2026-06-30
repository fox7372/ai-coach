# 2026-06-30 Disable Docling PDF option

## Change
- Removed the frontend Docling parser choice for PDF uploads.
- PDF uploads now always use PyMuPDF from the frontend.
- Backend upload parser default changed from Docling to PyMuPDF.
- PPT/PPTX uploads still use Docling and keep the Docling loading animation.

## Reason
- Local tests showed Docling can parse PPTX, but PDF parsing is not stable enough for the upload UX.
- Some PDFs did not complete Docling parsing within 180 seconds and left documents without chunks.

## Verification
- `backend/.venv-win/Scripts/python.exe -m py_compile backend/app/main.py`
- `node node_modules/typescript/bin/tsc -b`
- `node node_modules/vite/bin/vite.js build`
