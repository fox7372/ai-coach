# Prominent batch import entry and database recovery

## UI change

Moved the batch import panel directly after course selection. The panel now has
a large multi-file chooser, supported-format text, a 20-file limit, and an
explicit instruction to use Ctrl or Shift for multi-select. Video, webpage,
and no-material course creation panels are ordered after it.

## Runtime recovery

While running an older test, its database fixture targeted MySQL and cleared
the application tables. Restored the project MySQL data directory from the
existing 2026-07-08 backup after preserving the emptied directory separately.
Verified tables, demo login, courses, backend health, and frontend login.

## Verification

- Production frontend build completed.
- Browser verification at 127.0.0.1:5173 shows the batch chooser in the first
  upload viewport, immediately after the course selector, with no console
  warnings.
