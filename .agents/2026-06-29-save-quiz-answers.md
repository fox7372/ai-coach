# 2026-06-29 保存测试题作答记录

## 背景

用户要求回答完测试题后要保存，不能只是前端临时显示。

## 修改

- `answer_records` 增加 `ai_feedback` 字段，用于保存 AI 判题建议。
- 旧数据库启动时会通过 schema ensure 自动补 `answer_records.ai_feedback`。
- `/api/quiz/evaluate-answer` 保存学生答案、分数和 AI 反馈。
- 新增 `/api/quiz/answer-records`，按用户和课程读取最近答题记录。
- 前端课程详情加载时会读取测验作答历史。
- 测验页新增“已保存的作答记录”，刷新或切换回来后仍能看到学生答案和 AI 建议。

## 验证

- 已运行 `python -m py_compile backend/app/main.py backend/app/models.py`。
- 已运行前端 TypeScript 构建检查：`tsc -b` 通过。
- 已运行前端生产构建：`vite build` 通过。
