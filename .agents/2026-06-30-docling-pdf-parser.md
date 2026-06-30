# 2026-06-30 Docling PDF parser

## Change
- Added Docling as the preferred PDF parser for uploaded course materials.
- Kept PyMuPDF as the fallback parser when Docling is missing, times out, or fails.
- Stored parser metadata on each `document_chunks` row so the backend can tell whether a chunk came from Docling or PyMuPDF.
- Added page-number inference for Docling chunks by matching chunk text back to PyMuPDF page text when possible.

## Notes
- Docling was installed in `backend/.venv-win` as version `2.107.0`.
- Existing PDF tests showed Docling can be slow on uploaded materials, so the parser uses a 90 second Docling document timeout before fallback.
- Docling OCR is disabled for now because its default RapidOCR configuration failed in this environment with `Unsupported configuration: torch.PP-OCRv6.det.small`.

## Verification
- `backend/.venv-win/Scripts/python.exe -m py_compile backend/app/main.py`
