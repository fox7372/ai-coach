# Knowledge generation math import fix

## Problem

Generating course knowledge points from a course with more chunks than the
selection limit returned HTTP 500. `select_knowledge_chunks` calls
`math.floor`, but `backend/app/main.py` did not import `math`.

## Change

Imported `math` in `backend/app/main.py`.

## Verification

- Compiled `backend/app/main.py` with the project Python environment.
- Generated and saved eight knowledge points for course 24 from
  `LADR4eChinese.pdf`.
- Verified the frontend knowledge tab displays the eight points and the
  existing-result action returns successfully.
