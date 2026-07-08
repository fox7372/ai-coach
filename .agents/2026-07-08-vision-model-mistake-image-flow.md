# 2026-07-08 错题图片改为识图模型优先

## 修改内容

- 新增后端视觉模型判断逻辑：
  - `gpt-4o`
  - `gpt-4.1`
  - `gpt-5`
  - `qwen-vl`
  - `qwen2.5-vl`
  - `glm-4v`
  - `gemini`
  - `vision`
  - `vl`
  - `o3`
  - `o4`
- 后端新增 `POST /api/ai/analyze-mistake-image-upload`：
  - 视觉模型：直接把图片传给模型分析，并加入错题库。
  - 非视觉模型：保存图片但不做 OCR，返回提示让学生切换识图模型或手动输入题目文字。
- 前端错题图片上传流程改为调用新接口。
- 前端文案从“先 OCR”改为“识图模型直接分析，非识图模型手动文字输入”。
- README 更新图片处理说明，OCR 保留为备用能力，不再作为默认流程。

## 验证

- 后端 `py_compile backend\app\ai_service.py backend\app\main.py` 通过。
- 前端 `tsc -b` 通过。
- 前端 `vite build` 通过。
- 运行中的后端 OpenAPI 已包含：
  - `/api/ai/ocr-mistake-image`
  - `/api/ai/analyze-mistake-image-upload`
  - `/api/ai/analyze-mistake-image`

## 当前本机状态

- 当前 AI 配置为 `qwen / qwen3.7-plus`，该模型名未被识别为视觉模型。
- 因此上传错题图片会提示切换识图模型或手动输入题目文字。
