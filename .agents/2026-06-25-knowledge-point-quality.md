# 2026-06-25

## Issue

- Generated knowledge points were wrong:
  - all names could become `知识点名称`
  - course logistics such as class time, grades, and deadlines were treated as knowledge points
  - every point used the same first-page source excerpt
  - concepts not directly present in a course homepage could be hallucinated

## Changes Made

- Knowledge point generation now asks for strict JSON output.
- Non-academic logistics are filtered out.
- Generic names such as `知识点名称` are rejected.
- For single-page webpage outlines, a point must directly appear in the source text.
- Source excerpts are matched per knowledge point instead of always using the first chunk.
- Single-page webpage outline points are marked with lower confidence and “初步主题” wording.

## Verification

- Backend Python compile passed with `py_compile`.
- Restarted the FastAPI backend to ensure the new filtering logic is active.
- Regenerated OS course knowledge points.
- Result no longer includes course time, grade ratio, deadline, or generic `知识点名称`.
