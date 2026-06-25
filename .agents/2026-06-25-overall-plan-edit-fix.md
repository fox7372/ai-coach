# 2026-06-25

## Issue

- The overall plan looked like it could not be modified.
- Root cause: `/api/ai/generate-learning-plan` always created a new suggestion and did not include the current plan as edit context.

## Changes Made

- Backend now finds the latest overall plan (`整体学习计划` or old `下一步学习建议`) and updates that same row.
- Backend prompt now includes the current overall plan and the user's new edit instruction.
- Backend returns a full updated plan, not only an edit explanation.
- Frontend copy now says the AI will update the current plan based on the left-side plan.
- Frontend clears the edit box after submitting.

## Verification

- Backend Python compile passed with `py_compile`.
- Frontend TypeScript build passed with `tsc -b`.
- Backend `/health` returned `status=ok`.
- Real API call confirmed the same `suggestion_id` was updated instead of creating a new row.
- Browser check confirmed the overall plan page shows the updated edit instructions.
