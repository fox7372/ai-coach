# 2026-06-25

## Issue

- Overall plan editing still did not feel like a conversation.
- The UI did not clearly show that the edit message was sent and that the daily plan was synced.

## Changes Made

- Frontend overall-plan edit now behaves like a small chat:
  - user edit message appears immediately
  - assistant pending message appears while syncing
  - assistant success/failure message appears after the API call
- The send button shows `正在同步...` while the overall plan and daily plan are being regenerated.
- Frontend `generatePlan` now returns the backend result and directly applies both `plan` and `daily_plan`.
- Backend already updates the same overall-plan record and regenerates today's plan from the updated overall plan.

## Verification

- Frontend TypeScript build passed with `tsc -b`.
- Backend Python compile passed with `py_compile`.
- Backend `/health` returned `status=ok`.
- Real API call confirmed `/api/ai/generate-learning-plan` returns both `plan` and `daily_plan`.
