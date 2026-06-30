# 2026-06-30 Docling upload animation

## Change
- Added a dedicated frontend loading animation for Docling parsing.
- Docling PDF and PPT/PPTX uploads now show a structured parsing status with:
  - pulse icon,
  - spinner,
  - parsing step indicators,
  - slow parsing note.
- PyMuPDF, video, webpage, and AI recommendation imports keep the normal loading status.

## Verification
- `node node_modules/typescript/bin/tsc -b`
- `node node_modules/vite/bin/vite.js build`
