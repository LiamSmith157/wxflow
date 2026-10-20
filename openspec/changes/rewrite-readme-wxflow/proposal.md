# Proposal

## Why

根目录 `README.md` 仍是 Flowise 原版的改造品:中英文混杂(标题、章节、步骤是英文,"关于本仓库"是中文),保留了 Flowise 的口号 "Build AI Agents, Visually"、"Table of Contents" 式结构,以及指向 `i18n/` 下已过时的 Flowise 译本的语言切换栏。品牌已改为 wxflow(见 `complete-wxflow-rename`),README 作为仓库门面应当是 wxflow 自己的说明,而不是改名后的 Flowise 文档。

## What Changes

- 将 `README.md` 重写为统一的简体中文文档,以 wxflow 自身为主语:定位、能力范围、快速开始、Docker、开发、环境变量、从 Flowise 命名版本升级、许可证。
- 保留必须的来源声明:基于 Flowise 3.1.4 裁剪、Apache-2.0 许可证沿用,并保留对 `LICENSE.md` 的链接。
- 去掉 Flowise 口号和语言切换栏(`i18n/README-*.md` 仍是 Flowise 旧译本,不在本次范围内)。
- 保持 README 中所有事实与仓库现状一致(命令、环境变量名、数据目录、Docker 命名、`X-Wxflow-Signature`)。
- 不改动任何代码、配置、截图资源或 `i18n/` 下的文件。

## Capabilities

### New Capabilities

无。纯文档改动,不改变系统行为。

### Modified Capabilities

无。(`.openspec.yaml` 设置 `skip_specs: true`。)

## Impact

- 仅影响 `README.md`。
- 不影响代码、API、依赖、构建与发布流程。
- `i18n/README-*.md` 保持不变;根 README 不再链接它们。
