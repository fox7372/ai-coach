# 2026-06-30 Upload target course selector

## Change
- Added an explicit upload target selector in the frontend:
  - Join an existing course.
  - Create a new course.
- File upload, video import, and webpage import now use the selected existing course when that mode is active.
- New course creation still supports fallback naming from the uploaded/imported resource.
- AI resource recommendation now requires the new-course mode because it creates a course.

## Verification
- `node node_modules/typescript/bin/tsc -b`
- `node node_modules/vite/bin/vite.js build`
