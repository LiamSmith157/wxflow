# Design

## Context

当前 `README.md` 共 188 行,已含 wxflow 品牌的 logo(`packages/ui/src/assets/images/wxflow_white.svg` / `wxflow_dark.svg`)、"关于本仓库"、环境变量与升级说明,但大部分章节沿用 Flowise 的英文原文。`images/` 与 `assets/` 下的截图仍是 Flowise 命名/品牌(`flowise_agentflow.gif`、`FloWiseAI*.png`),README 目前未引用它们。动机见 proposal.md - Why。

## Goals / Non-Goals

**Goals:**
- 一份语言统一(简体中文)、结构清晰、事实准确的 wxflow README。
- 内容可由仓库现状验证(命令、变量名、路径)。

**Non-Goals:**
- 不翻译或重写 `i18n/README-{TW,ZH,JA,KR}.md`、`CONTRIBUTING-ZH.md` 等。
- 不新增或替换截图/logo 资源(现有 Flowise 品牌图片不引用)。
- 不修改 `CONTRIBUTING.md`、`SECURITY.md` 等其他文档。

## Decisions

- **语言用简体中文**:项目规格与 UI 默认面向中文用户;与"关于本仓库"现有语言一致。备选:中英双语——维护成本翻倍,且无英文读者诉求,放弃。
- **移除语言切换栏**:链接的译本是 Flowise 旧内容,保留会把读者引向非 wxflow 说明。待这些译本重写后再恢复。
- **章节结构**:简介 → 能力范围(保留/已移除) → 快速开始(从源码构建) → Docker → 开发者(模块、构建、开发模式) → 环境变量 → 升级说明 → 贡献 → 许可证与致谢。把原"关于本仓库"中的构建注意事项并入"快速开始/开发者"。
- **保留 Flowise 来源声明**:Apache-2.0 要求保留版权/许可声明,放在"许可证与致谢"并链接 `LICENSE.md`。
- **不放截图**:没有 wxflow 自己的截图,宁缺毋滥。
- **去掉 `<h3>Build AI Agents, Visually</h3>`**,换成 wxflow 自己的一句话定位(可视化构建 Agentflow v2 工作流的 AI Agent 平台)。

## Risks / Trade-offs

- [README 与实际命令漂移] → 实施时逐条对照 `package.json`、`docker/`、`.env.example` 核对。
- [根 README 不再链接旧译本,i18n 目录显得孤立] → 在 proposal 中已声明范围外,后续单独变更处理。
- [删除 Flowise 口号可能被认为弱化来源] → 来源声明保留在简介引言与许可证章节。
