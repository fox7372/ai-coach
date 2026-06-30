# 2026-06-25

## Request

- The learning plan page was too crowded.
- Split it into multiple views.

## Changes Made

- Reworked the learning plan panel into internal views:
  - Overall plan
  - Today's plan
  - AI co-creation
  - Feedback adjustment
  - Plan history
- The default view now only shows the overall plan.
- Plan generation and daily feedback forms are hidden behind their own view buttons.

## Verification

- Frontend TypeScript build passed with `tsc -b`.
- Browser check confirmed the learning plan page shows separate buttons for `整体计划`, `今日计划`, `AI 共创`, `反馈调整`, and `历史计划`.
