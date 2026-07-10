# Chat and Quiz Display Repair

- Show chat history with the newest answer first and update session recency after each answer.
- Repair common UTF-8 mojibake for chat and quiz history at the API and UI boundaries.
- Parse multiline quiz fields without requiring blank lines and always retain the complete generated content in the UI.
- Added isolated SQLite tests for quiz parsing and reverse-chronological chat history.

Validation: `pytest tests\\test_quiz_text_parsing.py -q`, frontend production build, and browser checks on the chat and quiz panels.
