# 更新日志

本项目遵循语义化版本号。公开安装包与源代码标签保持一致。

## v2.1.8 - 2026-08-05

### 修复

- 修复 macOS 安装包无法定位 `app.asar.unpacked` 中内置 Codex CLI，导致导演 Agent 提示 CLI 未安装的问题。
- 脚本节点和导演 Agent 改用经过能力校验的多模态文本模型目录，不再混入图片 LoRA 训练模型。
- 保留开发环境、Apple Silicon、Intel、Windows 和 Linux 的 Codex 二进制解析兼容路径。

## v2.1.7 - 2026-08-05

首个 zmTV 公开非商业版本。

### 新增

- 多画布影视与设计工作流，支持文本、图片、视频、音频、3D、数字人、脚本和分镜节点。
- 图片与视频生成器动态模型、模式和参数加载。
- Codex 画布助手、导演 Agent、工作流技能和导演预设资源。
- zaomeng.art、WaveSpeed、One API / New API 兼容服务接入。
- macOS、Windows、Linux 和 Android 自动构建流程。

### 发布

- 使用新的 zmTV 无限环形 Logo 更新桌面端、应用内界面、Android 图标和启动画面。
- 补充安装包下载说明、功能截图、工作流手册、供应商接入和安全文档。
- 使用 PolyForm Noncommercial 1.0.0 发布项目自有代码。
