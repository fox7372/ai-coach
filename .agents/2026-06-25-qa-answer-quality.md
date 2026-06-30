# 2026-06-25

## Issue

- The AI answer for “系统调用” looked unprofessional.
- It cited broad course homepage content as if it directly supported the concept.
- It guessed course sections and experiments without enough evidence.

## Changes Made

- Strengthened the AI assistant prompt to forbid unsupported course claims.
- Added direct keyword match detection for retrieved chunks.
- When no direct match exists, the backend now tells the model that the course material did not directly support the question.
- Low-relevance chunks are no longer presented as direct evidence.
- Source references now include compact source excerpts when there is a direct match.

## Verification

- Backend Python compile passed with `py_compile`.
- Backend `/health` returned `status=ok`.
- Tested `/qa/ask` with question `系统调用` on course id `18`.
- The new answer explicitly says the imported course material has no direct match and gives only general OS knowledge instead of inventing course evidence.
