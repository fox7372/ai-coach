# Batch document and Word import

## Change

- Added `POST /documents/upload/batch` for up to 20 documents per request.
- Added DOCX parsing with `python-docx`, including paragraph and table text.
- Added DOCX retry support and `python-docx` to backend requirements.
- Updated the import UI to select multiple PDF, PPT/PPTX, and DOCX files for
  one existing or newly created course.

## Time estimates

The backend now returns each document's actual processing seconds. The frontend
records recent per-type, per-parser throughput in local storage and uses it for
later estimates on the same machine. First imports use a conservative baseline.

## Verification

- Uploaded two generated DOCX files through the batch endpoint: both parsed,
  chunked, indexed, and returned per-file processing durations.
- Added and passed DOCX paragraph/table extraction test.
- Passed the LADR RAG pipeline test in an isolated process and built the
  frontend successfully.
