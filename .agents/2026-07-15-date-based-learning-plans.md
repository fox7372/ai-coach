# Date-based learning plans

## Scope

- Daily plans now continue from the previous dated plan and the overall plan.
- Repeated feedback on the same date adjusts the current daily plan instead of restarting it.
- Learning history now includes every dated plan and groups all feedback entries by date.
- The frontend shows an explicit current date, a generate-today action, and a dated plan/feedback timeline.

No database schema migration or existing data mutation was performed.

## Verification

- Backend: `13 passed, 1 skipped`
- Frontend: TypeScript, ESLint, and production build passed
- Desktop and 390 x 844 mobile browser regression passed
- Browser console had no errors or warnings
