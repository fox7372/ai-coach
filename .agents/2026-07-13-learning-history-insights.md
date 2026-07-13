# Learning History and Insights

## Changes

- Replaced the learning-plan history view with completed daily learning records.
- Added a backend endpoint that groups completed check-ins by date and returns total minutes, latest feedback, difficulty, and linked daily plan content.
- Added an AI-focused planning toolbar, a seven-day study-time bar chart, and a course-knowledge keyword cloud derived from real completed records and extracted knowledge points.
- Corrected the README database stack wording to distinguish SQLAlchemy ORM, the PyMySQL driver, and the default MySQL 8.4 Docker service.

## Validation

- Ran the isolated backend route assertion with the project WSL virtual environment.
- Ran `pnpm exec tsc -b`, `pnpm lint`, and `pnpm build` in `前端`.
