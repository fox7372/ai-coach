# 2026-07-08 识图模型判断改为黑名单

## 修改内容

- 将 `model_supports_vision` 从白名单策略改为黑名单策略。
- 默认认为模型可以尝试接收图片，只有命中文本模型黑名单才拦截。
- 当前黑名单包括：
  - `deepseek-chat`
  - `deepseek-reasoner`
  - `qwen3.7-plus`
  - `qwen3-plus`
  - `qwen-plus`
  - `qwen-max`
  - `qwen-turbo`
  - `qwen-long`
  - `embedding`
  - `rerank`
  - `text-`
- 后端提示语改为“当前模型在文本模型黑名单中”。
- README 同步说明：错题图片默认交给当前模型尝试识别，命中黑名单时才要求手动输入文字。

## 验证

- 后端 `py_compile backend\app\ai_service.py backend\app\main.py` 通过。
- 前端 `tsc -b` 通过。
- 前端 `vite build` 通过。
- 直接测试模型判断：
  - `qwen3.7-plus` -> `False`
  - `qwen-vl-plus` -> `True`
  - `gpt-4o` -> `True`
  - `deepseek-chat` -> `False`
  - `custom-new-vision-model` -> `True`
