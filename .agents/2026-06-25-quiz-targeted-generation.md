# 2026-06-25

## Request

- Quiz/detection should be based on user needs or today's learning content.
- Generated quiz content could appear garbled.

## Changes Made

- Backend quiz generation now prioritizes:
  1. User detection requirement
  2. Today's learning plan
  3. Course material
- Backend prompt now requires simplified Chinese Markdown and a strict per-question format.
- Frontend quiz panel now has:
  - a custom detection requirement input
  - `检测今日内容`
  - `按我的需求生成`
  - quick buttons for today's plan and weak points

## Verification

- Backend Python compile passed with `py_compile`.
- Frontend TypeScript build passed with `tsc -b`.
- Real quiz generation using today's plan returned focused questions.
- Checked the generated quiz text for common mojibake markers; none were found.
