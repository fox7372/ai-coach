# 2026-06-25

## Request

- Keep AI co-creation and daily feedback together with their related plans for easier editing.

## Changes Made

- Simplified learning plan views to:
  - Overall plan
  - Today's plan
  - Plan history
- Moved the AI co-creation form into the overall plan view.
- Moved the daily feedback form into the today's plan view.
- Each plan now appears beside the matching edit/update form.

## Verification

- Frontend TypeScript build passed with `tsc -b`.
- Browser check confirmed:
  - Overall plan page includes `和 AI 一起修改整体计划`.
  - Today's plan page includes `今日学习反馈`.
  - Separate `AI 共创` and `反馈调整` buttons were removed.
