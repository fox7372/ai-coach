# 2026-06-25

## Issue

- The overall learning plan did not appear after generation.
- Root cause: frontend stored the generated overall plan in `dailyPlan`, then `loadDetail()` immediately refreshed the daily plan and overwrote it.

## Changes Made

- Split frontend state into `overallPlan` and `dailyPlan`.
- `loadDetail()` now restores the latest non-daily learning suggestion as the overall plan.
- The learning-plan panel now shows two sections:
  - Overall plan
  - Daily plan

## Verification

- Frontend TypeScript build passed with `tsc -b`.
- Backend learning suggestions confirmed existing overall plans.
- Browser check confirmed the learning plan tab displays both `整体计划` and `今日计划`.
