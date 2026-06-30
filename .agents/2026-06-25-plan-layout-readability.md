# 2026-06-25

## Issue

- The 30-day overall plan was rendered as a very wide Markdown table.
- The table mixed weeks, modules, theory tasks, experiments, and time allocation into one crowded block.

## Changes Made

- Updated the backend overall-plan prompt to forbid large Markdown tables.
- Required the AI to output weekly sections with bullet lists instead of wide tables.
- Added clearer required sections: overall goal, stage arrangement, weekly tasks, experiments, daily rhythm, checkpoints.
- Applied `markdown-answer` styling to learning plan and quiz Markdown blocks.
- Improved Markdown table CSS so existing tables scroll horizontally and do not break the layout.

## Verification

- Backend Python compile passed with `py_compile`.
- Frontend TypeScript build passed with `tsc -b`.
- Real 30-day plan generation returned `has_table=false`.
- The API response still included synchronized `daily_plan`.
