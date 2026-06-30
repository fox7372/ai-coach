# 2026-06-30 Knowledge Point Source Quality

## Problem

- Knowledge point generation used course/document chunks, but selected the earliest chunks.
- For PDF slides, early chunks often contain cover pages, book titles, page headers, or chapter outlines.
- This produced noisy points such as `Security`, `Computer Networking`, `资料`, and `任务内容`.

## Fix

- Added filtering for noisy knowledge chunks.
- Added representative chunk sampling across the document/course instead of taking only early chunks.
- Strengthened knowledge point name validation.
- Updated the AI prompt to reject titles, book names, page headers, task fields, and non-concept labels.

## Data Cleanup

- Cleared bad knowledge points for the `计算机网络` course.
- Did not regenerate because the current backend is running in mock AI mode and has no DeepSeek API key configured.

## Next Step

- Configure `DEEPSEEK_API_KEY`.
- Regenerate knowledge points from the course detail page or per-resource generation button.
