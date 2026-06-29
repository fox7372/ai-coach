# 2026-06-29 Learning App Style Redesign

## Scope

- Apply the user's selected first visual direction: friendly learning app rather than admin dashboard.
- Preserve existing post-login features and backend-connected flows.

## Changes

- Replaced the dark logged-in sidebar with a light study navigation surface.
- Added a "today learning space" header for the post-login shell.
- Restyled course cards as learning cards with clearer "continue learning" actions.
- Restyled course detail summary and tab strip to match the lighter learning-app style.
- Added responsive behavior so the sidebar becomes a top card on smaller screens.

## Verification

- `tsc -b` passed.
- `vite build` passed.
- Checked `http://127.0.0.1:5173` and `http://127.0.0.1:8000/health`.
- Browser smoke test registered a temporary user and confirmed the post-login course page rendered with existing entries: courses, course detail, upload/import, settings, current student, and AI backend status.

## Notes

- No backend APIs were changed.
- No feature entry was intentionally removed.
- Avoided rewriting files via PowerShell string output to prevent encoding damage.
