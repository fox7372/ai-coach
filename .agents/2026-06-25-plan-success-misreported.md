# 2026-06-25

## Issue

- Overall plan editing could still show `修改失败` even when the backend generated both the updated overall plan and daily plan.

## Root Cause

- Frontend treated the whole operation as failed if the follow-up `loadDetail()` refresh failed after the plan update succeeded.
- The AI generation request can also take longer than ordinary API calls because it generates both overall and daily plans.

## Changes Made

- Plan update success is now separated from best-effort detail refresh.
- If `loadDetail()` fails after a successful plan update, the UI keeps the successful plan result.
- The overall-plan generation request now uses an explicit 300 second timeout.

## Verification

- Frontend TypeScript build passed with `tsc -b`.
- Real API call using `30天完成，并且完成相应的任务` returned both `plan` and `daily_plan`.
