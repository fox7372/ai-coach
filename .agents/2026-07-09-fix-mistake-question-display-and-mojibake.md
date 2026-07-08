# 2026-07-09 修复错题库题目缺失和显示乱码

## 问题

- 错题库卡片直接显示 `ai_analysis`，题目字段 `ocr_text` 放在后面，导致用户看到大段答案/分析，题目不明显。
- 视觉模型直接分析错题图片时没有单独保存题目字段。
- 测验错题自动保存时没有单独保存题目字段。
- 错题卡片没有使用 Markdown / KaTeX 渲染，公式、加粗、列表会显示成原始符号；部分 emoji 在某些环境可能显示成异常方块。

## 修改内容

- 后端新增 `extract_mistake_question_text`，可以从旧的 `ai_analysis` 中提取题目。
- `/mistakes` 返回时：
  - 对 `ai_analysis`、`weak_points`、`suggestion`、`ocr_text` 做 mojibake 修复。
  - 如果旧记录没有 `ocr_text`，自动从分析中提取题目返回。
- 新保存错题时补充题目字段：
  - AI 错题分析保存 `payload.question`。
  - 测验错题保存 `question.content`。
  - 图片识图错题从模型回答中提取“题目：...”。
  - 前端加入错题本时传入测验题目或问答问题。
- 前端错题卡片改为：
  - 上方单独显示“题目”。
  - 下方显示“AI 分析”。
  - 使用 ReactMarkdown + remark-math + rehype-katex 渲染分析。
  - 过滤 emoji / dingbat 字符，避免显示成异常符号。

## 验证

- 后端 `py_compile backend\app\main.py` 通过。
- 前端 `tsc -b` 通过。
- 前端 `vite build` 通过。
- 已重启 8000 后端。
- `/mistakes?user_id=1` 验证旧记录已返回独立题目字段：
  - 图片错题返回线性代数证明题题目。
  - 测验错题返回操作系统核心作用题目。
