# 2026-06-25

## Request

- AI 问答需要记录历史。
- 支持通过关键字搜索之前的对话。

## Changes Made

- Added backend endpoint `GET /qa/messages/search` for keyword search over stored chat messages.
- Updated the course-detail AI Q&A panel to load chat sessions from the database.
- Added a conversation history sidebar.
- Added a keyword search box for previous conversations.
- Search results can be clicked to open the matching conversation.
- Added new conversation creation and conversation deletion controls in the Q&A panel.
- Current questions are sent with `session_id`, so messages stay attached to the selected conversation.

## Verification

- Frontend TypeScript build passed with `tsc -b`.
- Backend Python compile passed with `py_compile`.
- Backend `/health` returned `status=ok`.
- Browser check confirmed the AI Q&A tab shows conversation history, search input, delete conversation, and message input.
- `GET /qa/messages/search` returned a valid JSON response.
