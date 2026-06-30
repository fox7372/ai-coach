# 2026-06-25

## Request

- Test generation, AI Q&A, and learning plan loading should show animations.

## Changes Made

- Added a reusable `LoadingNotice` component with a spinning loader.
- Learning plan view now shows an AI loading notice while generating or syncing plans.
- Overall-plan sync button now shows a spinner while syncing.
- Daily feedback update button shows a spinner while updating.
- Quiz generation now shows a loading notice and button spinner.
- AI Q&A now shows a loading notice while retrieving/generating an answer.
- AI Q&A send button changes to a spinner and `回答中` while waiting.

## Verification

- Frontend TypeScript build passed with `tsc -b`.
