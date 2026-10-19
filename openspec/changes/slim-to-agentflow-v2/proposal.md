# Proposal

## Why

本项目基于 Flowise 3.1.4 二次开发,产品定位只有 Agentflow v2 一种编排形态。上游代码里并存着 Chatflow、Agentflow v1(MULTIAGENT)、Assistants、Marketplace 等多套模型,它们与 v2 共用表、路由、工具函数和 UI 组件,导致代码体量大、依赖重、维护和二次开发时的认知负担高。项目是全新部署、没有存量数据,现在是一次性物理裁剪成本最低的时机。

## What Changes

- **BREAKING** 平台只接受 `AGENTFLOW` 一种 flow 类型;`CHATFLOW`、`MULTIAGENT`、`ASSISTANT` 的创建、导入、查询、执行全部移除。`ChatFlow` 表和 `/chatflows` 路由保留,作为 v2 flow 的存储和 CRUD 接口。
- **BREAKING** 删除 Chatflow 模块:v1 画布、chatflow 执行路径(LangChain 图构建)、`/vector` upsert 接口和 RAG 文件上传路径、`openai-realtime`。
- **BREAKING** 删除 Agentflow v1:`buildAgentGraph`、`multiagents`、`sequentialagents` 节点,以及 v1/v2 切换页。
- **BREAKING** 删除 Assistants:Custom Assistant、OpenAI Assistants(含 files、vector-store)的路由、service、UI,`Assistant` 实体,以及 RBAC 中的 `assistants:*` 权限。其中 v2 也在用的通用接口(chat model 列表、prompt 指令生成)**迁移到中立路径**后保留。
- **BREAKING** 删除 Marketplace:模板浏览、"保存为模板"、`server/marketplaces/*` 模板文件、`CustomTemplate` 实体、`templates:*` 权限,v2 画布中与模板相关的入口一并删除。
- 裁剪 `packages/components` 节点:只保留 v2 运行时和 Document Store 依赖的类别,删掉 Chatflow/v1 专用的类别,以及依赖 v1 锚点输入的 tools。
- 删除 `packages/observe`。
- 保留 `packages/agentflow`(可嵌入的 v2 编辑器 SDK),SDK 调用的被迁移接口同步修改。
- `packages/api-documentation` 删掉被删接口的 swagger 定义。
- 清理不再使用的依赖包(LangChain chains/agents、LlamaIndex 等)。
- 数据库:上游已有 migration 保留,另外追加 migration 删除 `assistant`、`custom_template` 表,覆盖 sqlite、mysql、mariadb、postgres 四种数据库。

**明确保留**(v2 完整功能及平台基础能力):v2 画布、执行引擎、16 个 agentflow 节点、Executions/HITL、Document Stores(含 upsert-history)、Tools/Custom MCP Servers、Credentials/Variables/API Keys、Schedule/Webhook、MCP Endpoint、Evaluations/Datasets/Evaluators、公开 chatbot 分享与 embed、Leads/Feedback/TTS/STT/文件上传、enterprise(用户/角色/工作区/SSO)、AgentflowV2 Generator。

## Capabilities

### New Capabilities

- `flow-types`:平台支持的 flow 类型,以及非 AGENTFLOW 类型在创建、更新、导入、查询、执行时被拒绝的行为。
- `node-catalog`:节点注册表对外提供的节点集合,包括 v2 节点、v2 通过 category 动态加载的组件,以及 Document Store 依赖的组件。
- `api-surface`:对外 HTTP API 的边界:哪些接口被移除、哪些通用接口迁移到新路径,以及 `packages/agentflow` SDK 依赖的接口契约。
- `console-navigation`:管理后台的菜单、路由和入口,只暴露 v2 及保留模块。

### Modified Capabilities

(无:`openspec/specs/` 目前为空)

## Impact

- **packages/server**:`utils/buildChatflow.ts`、`utils/buildAgentGraph.ts`、`utils/index.ts`、`utils/upsertVector.ts`、`queue/UpsertQueue.ts`、`routes/index.ts`;services 和 controllers 下的 assistants、openai-assistants*、openai-realtime、marketplaces、vectors、chatflows、export-import、evaluations;`enterprise/services/workspace.service.ts`、`account.service.ts`;`enterprise/rbac/Permissions.ts`;`database/entities` 及各数据库的 migrations;`Interface.ts` 中的 `ChatflowType`。
- **packages/components**:`nodes/` 下约 14 个类别目录;`nodes/tools` 中的部分工具;`nodes/agentflow/ExecuteFlow`;`package.json` 依赖。
- **packages/ui**:`views/canvas`(共享组件先迁出)、`views/chatflows`、`views/agentflows`、`views/assistants`、`views/marketplaces`、`views/agentflowsv2/MarketplaceCanvas`、`menu-items/*`、`routes/*`、`api/assistants.js`、`api/marketplaces.js`、`api/vectorstore.js`,以及引用这些模块的共享组件。
- **packages/agentflow**:`src/infrastructure` 中对 `/assistants/chatmodels` 的调用。
- **packages/observe**:整个包删除;根目录 `package.json` 的 `build:docker` 过滤条件同步修改。
- **packages/api-documentation**:swagger 定义。
- **对外 API**:被删接口返回 404;`flowise-embed` 和公开分享链接依赖的 `/public-chatflows`、`/prediction` 保持不变。
- **与上游的关系**:裁剪之后不再计划 merge 上游。
