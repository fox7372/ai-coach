# 2026-06-30 PDF RAG Processing

## Problem

- PDF uploads created `documents` records and saved files, but did not parse PDF content into `document_chunks`.
- As a result, uploaded PDFs were visible in course resources but not usable by RAG.

## Fix

- Added PDF extraction with PyMuPDF.
- Added PDF processing pipeline:
  - extract text page by page,
  - split page text into chunks,
  - save `page_number`, `section_title`, metadata, token count, and embedding,
  - update document status to `ready`,
  - mark failed PDFs with `failed` and `error_message`.
- Connected `/documents/upload` to process PDF files immediately.
- Extended `/api/resources/{resource_id}/retry` to retry PDF processing.

## Backfill

- Backfilled existing PDF documents in the local database.
- `LADR4eChinese.pdf`: 445 chunks.
- Computer network PDFs:
  - chapter 1: 32 chunks
  - chapter 2: 53 chunks
  - chapter 3: 85 chunks
  - chapter 4: 45 chunks
  - chapter 5: 46 chunks
  - chapter 6: 34 chunks
  - chapter 7: 31 chunks
  - chapter 8: 55 chunks

## Verification

- `python -m py_compile backend/app/main.py backend/app/models.py` passed.
- `GET /api/courses/21/resources` now returns `status: ready` and nonzero `chunk_count` for all computer network PDFs.
