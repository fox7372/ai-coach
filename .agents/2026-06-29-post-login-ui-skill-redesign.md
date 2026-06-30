# 2026-06-29 登录后界面优化和前端设计 skill 适配

## 背景

用户要求适配前面列出的 1、2、3 三个前端设计 skill，并优化登录后的前端界面，不能删除任何功能。

## Skill

- 已继续使用已安装的 Taste Skill：
  - `design-taste-frontend`
  - `redesign-existing-projects`
- 新安装：
  - `frontend-design-codex-skill`
  - `anthropic-frontend-design`
- 安装方式：直接从 GitHub 下载 `SKILL.md` 到 `C:\Users\fox\.codex\skills`。

## 设计方向

- 方向：calm study operations。
- 目标：学习调度台，而不是营销页。
- 重点：课程上下文、资料状态、测验/错题/计划入口、清晰工作流。

## 修改

- 登录后侧边栏增加当前学生、课程数和 AI 后端状态。
- 顶部栏增加课程数量、当前课程和“加资料”快捷按钮。
- 课程列表增加工作区说明、课程统计、进度条、掌握度条和明确的打开课程按钮。
- 课程详情顶部改成工作区摘要，直接显示资料数、知识点、错题、作答记录、进度和掌握度。
- 课程详情子目录改成横向可滚动 tab，避免拥挤。
- 概览页改成学习画像快照布局。
- 资料页和知识点页增加更明确的说明、空状态和内容表面样式。
- 新增 CSS token、workspace band、content rail、tab strip、reduced motion 规则。

## 保留功能

未删除任何既有入口：课程、课程详情、上传/导入、设置、资料、AI 问答、知识点、学习计划、测验、错题库、学习诊断、学习画像、错题删除、测验作答保存等。

## 验证

- 已运行前端 TypeScript 构建检查：`tsc -b` 通过。
- 已运行前端生产构建：`vite build` 通过。
- 已进行反模板词检查，未命中常见 AI 模板词和 em dash。
- 后端 `http://127.0.0.1:8000/health` 正常。
- 前端 dev server 当前未运行在 5174，因此未做浏览器截图验证。
