# 2026-06-29 Mistake Image And QA Save

## Scope

- Add support for students asking AI about mistake images when the active DeepSeek model cannot read images directly.
- Add a button in AI Q&A answers to save useful answers into the course mistake book.

## Backend

- Added mistake image fields to `mistake_records`: `image_path`, `ocr_text`.
- Added schema auto-upgrade entries for existing MariaDB tables.
- Added `POST /api/ai/ocr-mistake-image`:
  - saves the uploaded image under managed uploads,
  - tries PaddleOCR first,
  - tries Tesseract second,
  - falls back to manual text confirmation when OCR is unavailable or empty.
- Added `POST /api/ai/analyze-mistake-image`:
  - accepts confirmed OCR text,
  - calls DeepSeek text analysis,
  - saves the result into the mistake book.
- Extended `/mistakes` create/list responses with image/OCR fields.

## Frontend

- Added image upload flow inside the course mistake book:
  - upload image,
  - show OCR/manual text field,
  - optional student answer/reference answer,
  - AI analysis and save into mistake book.
- Added "加入错题本" on assistant messages in AI Q&A.
- Refreshes course detail data after Q&A answers are saved as mistakes.

## Verification

- `python -m py_compile backend/app/main.py backend/app/models.py` passed.
- `tsc -b` passed.
- `vite build` passed.

## Notes

- DeepSeek is still used only for text analysis.
- OCR is optional at runtime: PaddleOCR/Tesseract can improve recognition, but students can manually correct or enter text when OCR is unavailable.
