# 2026-06-29 错题删除按钮

## 背景

用户希望错题库中的错题可以删除，并且数据库中的记录也要删除。

## 修改

- 后端新增 `DELETE /mistakes/{mistake_id}`。
- 删除接口按 `user_id` 校验错题归属，找不到时返回 404。
- 前端课程详情中新增 `deleteMistake`。
- 错题库每条错题右上角新增删除按钮。
- 删除成功后刷新课程详情数据，并显示“错题已删除”。

## 验证

- 已运行 `python -m py_compile backend/app/main.py`。
- 已运行前端 TypeScript 构建检查：`tsc -b` 通过。
- 已运行前端生产构建：`vite build` 通过。
