# Design

## Context

动机见 proposal.md 的 Why;对外行为见 `specs/` 下的四个 capability。这里只说明实施时会影响做法的现状:

-   **v2 与 v1 共用同一条执行入口。** `server/src/utils/buildChatflow.ts` 被 predictions、internal-predictions、mcp-endpoint、PredictionQueue、webhook 共 7 个地方引用。它在 `:481` 判断 `type === 'AGENTFLOW'`,然后把请求转给 `buildAgentflow.ts` 的 `executeAgentFlow`。反方向上,`buildAgentflow.ts` 又从 `buildChatflow.ts` 引入了 `generateTTSForResponseStream` 和 `shouldAutoPlayTTS`。
-   **`utils/index.ts`(2143 行)混合了两类函数。** 一类只服务于 v1 和 Chatflow,例如 `buildFlow`、`getEndingNodes`、`getStartingNodes`、`findMemoryNode`、`getMemorySessionId`、`getAllConnectedNodes`、`isFlowValidForStream`,以及 `isStartNodeDependOnInput`、`isSameOverrideConfig`、`isSameChatId` 这三个已经没有调用方的函数。另一类是 v2 或平台在用的函数,例如 `constructGraphs`、`resolveVariables`、`replaceInputsWithConfig`、`findAvailableConfigs` 以及加解密相关函数。
-   **节点注册是扫描目录。** `NodesPool` 会扫描 `components/dist/nodes` 下的所有文件,所以删掉源码目录,对应节点就会从注册表消失,不需要另外维护清单。
-   **UI 的 v2 画布引用了 v1 目录里的组件。** `views/agentflowsv2` 引用了 `views/canvas/{AddNodes,CanvasHeader,NodeInputHandler}` 和 `views/marketplaces/MarketplaceCanvasHeader`。`views/canvas/CredentialInputHandler` 被 8 处共享组件引用,`NodeInputHandler` 被 6 处引用。
-   **Assistants 路由里有 v2 在用的通用接口。** 一个是 chat model 列表:它的实现就是 `getAllNodesForCategory('Chat Models')` 再过滤掉 LlamaIndex,跟现有的 `/nodes/category/:name` 是等价的。另一个是 prompt 指令生成。
-   **`chat_flow.type` 列的数据库默认值是 `'CHATFLOW'`。** 这个默认值同时写在实体定义和历史 migration 里。
-   **本地还没安装依赖。** 没有 `node_modules`。本机 Node 版本是 v22.23.3,而 `.nvmrc` 要求 v24.15.0。

## Goals / Non-Goals

**Goals:**

-   每完成一个阶段,仓库都能通过 `pnpm build` 和 `pnpm test`,并且 v2 冒烟清单(见 Migration Plan)全部通过,这样任何一个阶段都可以单独提交和回退。
-   删除要彻底:被删模块的源码、测试、路由注册、UI 入口、权限、swagger、依赖包都不留残余。

**Non-Goals:**

-   不重命名 `ChatFlow` 实体、`chat_flow` 表、`/chatflows` 路由,也不改 `chatflowid` 之类的字段名。改名会波及 SDK、embed、公开链接和所有 migration,收益不大。
-   不重构 v2 引擎(`buildAgentflow.ts`)本身。只把它从 `buildChatflow.ts` 里拆出来,内部逻辑不改。
-   不删 `credentials/` 下的凭据定义。凭据和节点不是一一对应的关系,多留几个无害;误删则会让某个保留节点无法配置。
-   不修改上游历史 migration,也不压缩 migration。
-   不让主 UI 改用 `packages/agentflow` SDK。

## Decisions

### D1. `buildChatflow.ts` 保留为瘦入口,不删文件也不改名

`utilBuildChatflow` 被 7 个地方引用。这个函数只保留以下职责:校验 flow 存在、校验 `type === 'AGENTFLOW'`(否则返回 400)、做 API Key 和域名校验、调用 `executeAgentFlow`,以及更新 metrics。v1 和 Chatflow 的分支整段删掉。`generateTTSForResponseStream` 和 `shouldAutoPlayTTS` 移到新文件 `utils/textToSpeech.ts`,`buildAgentflow.ts` 改为从那里引入,这样就消除了反向依赖。

-   备选方案:直接删掉 `buildChatflow.ts`,让 7 个调用方都改为调用 `executeAgentFlow`。没有采用,因为 API Key 校验、域名校验、metrics 这些入口逻辑会在 7 个地方重复。

### D2. `utils/index.ts` 按调用方删除

逐个函数检查:如果删掉 v1 代码后它没有任何调用方了,就删除。不把这个文件拆成多个文件。

-   备选方案:借这次机会把 `utils/index.ts` 拆成多个模块。没有采用,因为这会让改动量翻倍,而且和"裁剪"这个目标无关。

### D3. 通用接口迁移:能复用现有接口就复用

-   chat model 列表:调用方改为请求 `GET /nodes/category/Chat Models`,不新建接口。因为 LlamaIndex 节点都会被删掉,原来的过滤条件变成了恒为真,两个接口的返回结果一致。
-   prompt 指令生成:移到 `agentflowv2-generator` 路由下,新路径是 `POST /agentflowv2-generator/instruction`。service 函数也从 `services/assistants` 搬到 `services/agentflowv2-generator`。
-   `packages/agentflow` SDK 的 `src/infrastructure` 同步修改,同时更新它的测试 mock。
-   备选方案:先保留 `/assistants/components/chatmodels` 作为别名。没有采用,因为 SDK 在同一个仓库里,可以一起修改,不存在需要兼容的外部调用方。

### D4. flow 类型约束在 service 层强制执行

`EnumChatflowType` 和 `ChatflowType` 只保留 `AGENTFLOW`,`validateChatflowType` 会自动拒绝其他值。在 `saveChatflow` 中,如果没传 `type`,就设为 `AGENTFLOW`。实体上 `type` 列的 `default` 也改成 `AGENTFLOW`,但**不写 migration 去修改数据库列的默认值**:所有写入都会经过 service 层,而 sqlite 修改列默认值需要重建整张表,风险和收益不对等。`getAllChatflows` 无论传什么参数,都固定加上 `type = 'AGENTFLOW'` 的过滤条件。

-   备选方案:写 migration 修改四种数据库的列默认值。没有采用,理由如上;这个问题留作 Open Question。

实施中补充的约束(实现时才发现,已按此落地):

-   4 个历史 migration(`ModifyChatflowType`)直接引用了 `EnumChatflowType.CHATFLOW`。枚举收缩后,这几处改为内联字面量 `'CHATFLOW'`,生成的 SQL 与原来完全一致,所以这不算修改历史 migration 的行为。
-   类型收缩会让 `export-import` 里的 ChatFlow、AgentFlow(v1)、AssistantFlow 三段无法再表达,因此这三段的导出/导入随 3.4 一并移除(原本排在 4.4)。导入文件里出现这些段,或 `AgentFlowV2` 里有非 `AGENTFLOW` 的 flow,在写任何数据之前返回 400。Assistant 和 CustomTemplate 两段仍留给 4.4。
-   校验必须写在 `try` 之外:这些 service 的 `catch` 会把所有错误统一包成 500,放在里面会让 400 变成 500。
-   `predictions` service 的外层包装同样会把 `utilBuildChatflow` 抛出的所有错误变成 500。改为对 4xx 的 `InternalFlowiseError` 原样透传,5xx 和未知错误仍包装成 500。这样对外的 `/prediction` 对非 AGENTFLOW 返回 400(顺带,API Key 无效也从 500 变成了正确的 401)。
-   指标计数器:上游里 v2 flow 的 `isAgentFlow` 恒为 false(它只对 `MULTIAGENT` 为真),所以 v2 一直记在 `CHATFLOW_PREDICTION_*` 和 `CHATFLOW_CREATED` 下。去掉这个恒为 false 的参数后,保持记在同一组计数器上,不改变监控口径。

### D5. 删除表的 migration:每种数据库各追加一个

为 sqlite、mysql、mariadb、postgres 各新增一个 `<timestamp>-DropAssistantAndCustomTemplate.ts`,用 `DROP TABLE IF EXISTS` 删除 `assistant` 和 `custom_template` 两张表。`down()` 按照上游最后一次的表结构重新建表,以保持可以回滚。这些 migration 注册在各数据库 migrations 目录的 `index.ts` 末尾。enterprise 相关的 migration 如果引用了这两张表(例如工作区共享),需要一起检查。

-   备选方案:只删实体,不删表。没有采用,因为全新部署时这两张表会以空表形式一直留在库里,让人困惑。

### D5a. v2 生成器依赖的参考样例要保留,但与 Marketplace 脱钩

`agentflowv2-generator` 在生成 flow 时,会把 `server/marketplaces/agentflowsv2/` 里的 13 个 v2 模板读进系统提示词当作参考样例。删除 Marketplace 时不能把它们一并删掉,否则"AI 生成 flow"会因为读目录失败而整体不可用。处理方式:

-   目录改名并移到 `packages/server/agentflow-examples/`(仍在包根目录,与 `dist` 的相对位置不变),`package.json` 的 `files` 同步改名;其余三个模板目录(chatflows、agentflows、tools)随 Marketplace 删除。
-   生成器里的函数、变量和提示词占位符一并从 `marketplace` 改为 `example`(`prompt.ts` 与 `index.ts` 必须同步改,只改一边会让样例填不进提示词)。
-   这些文件不再有任何面向用户的入口,只是生成器的内部数据。

### D5b. 历史 migration 对实体的依赖

删除 `Assistant`、`CustomTemplate` 实体时,历史 migration `FixOpenSourceAssistantTable`(4 个数据库各一个)用 `Assistant` 当查询行的类型。改为内联的 `{ id: string; details: string }`,运行行为不变。以后删实体时,要把 `database/migrations` 也纳入引用检查,不能只看业务代码。

### D5c. 权限

-   `Permissions.ts` 里删除 `chatflows`、`assistants`、`templates` 三个分类,所有路由守卫只保留 `agentflows:*` 等权限。
-   历史 migration(`RefactorEnterpriseDatabase`、`AddApiKeyPermission`)写入默认角色的权限 JSON 里仍含这三类字符串。它们没有被任何守卫识别,也不在角色编辑页的权限目录里,所以是无害的残留;为了不改历史 migration,不去清理。

### D6. 先迁移共享代码,再删除

UI 和 server 都按"先迁移,后删除"的顺序进行,保证每一步之后都能编译通过:

-   `views/canvas/{CredentialInputHandler,NodeInputHandler,NodeOutputHandler}` 移到 `ui-component/input-handlers/`(新目录)。`AddNodes`、`CanvasHeader` 移到 `views/agentflowsv2/`。所有 import 一起改。
-   `MarketplaceCanvasHeader` 不迁移:它只被 `agentflowsv2/MarketplaceCanvas` 使用,而这个页面本身也要删除。
-   迁移的时候只改路径。v1 专用的分支(例如 `isAgentCanvas` 为 false 时的逻辑)放到 UI 清理阶段再删,这样迁移那一步的 diff 只有路径变化,方便 review。

### D7. 节点裁剪以编译结果为准

按 proposal 的清单删除 components 的节点目录,再删掉 4 个依赖 v1 锚点的 tools,以及保留类别中的 LlamaIndex 变体。删完之后跑 `components` 的 `tsc`:如果保留的节点 import 了被删目录里的工具函数(例如 `memory` 或 `retrievers` 下的共享代码),就把这个函数搬到 `components/src`,而不是恢复整个目录。`ExecuteFlow` 和 `ChatflowTool` 的 `listChatflows` 改为查询时加上 `type: 'AGENTFLOW'` 条件。

### D7a. 节点裁剪实施中的修正

-   **`Utilities/CustomFunction` 必须保留。** `POST /node-custom-function` 是 v2 也在用的接口(代码编辑器放大对话框里的"执行"按钮),服务端靠 `customFunction` 这个节点来跑 JS。`Utilities` 里另外 4 个节点(`getVariable`、`setVariable`、`ifElseFunction`、`stickyNote`)是 v1 画布专用,已删除。v2 画布的节点面板只展示 `Agent Flows` 类别,所以这个节点不会出现在用户界面里。
-   保留代码对被删目录只有两条编译期依赖:`customGet`(搬进 `components/src/utils.ts`)和 `Moderation` 类型(随 v1 的 `IMultiAgentNode`、`ISeqAgentNode` 等类型一起删除)。运行时的字符串引用用"节点 name"逐个在保留代码里搜过,没有保留代码按名字去加载被删节点。
-   server 的 `clearSessionMemory` 只对 `Memory` 类别和 OpenAI Assistant 节点起作用,对 v2 flow 永远是空操作,连同 chat-messages 控制器里的两处调用一起删除。UI 的"同时清除第三方记忆"勾选框因此失去意义,留到阶段 6 处理。
-   **`components/dist` 不会自动清理。** `NodesPool` 扫描 `dist/nodes` 注册节点,只删源码而不清 `dist` 的话,旧节点仍会被加载。增量构建前必须先 `pnpm clean`;Docker 全新构建不受影响。
-   `GET /nodes/:name` 对不存在的节点原本返回 500(内部抛出的 404 被外层 catch 包成了 500),改为透传 404。

### D7b. UI 清理实施中的修正

-   **聊天文件下载接口不能随 Assistants 一起删。** `POST /openai-assistants-file/download` 名字像是 Assistants 专用,实际是通用的聊天文件下载(按 flow、chat、文件名从存储读取)。v2 的 Agent 节点会产生文件附件,聊天面板、消息查看、执行详情三处靠它下载,外部的 `flowise-embed` 也用这个 URL。阶段 4 把它当 Assistants 路由删掉了,阶段 6 反查 UI 调用时才发现。已恢复为 `POST /chat-files/download`(中性名字),并在旧路径上保留别名;UI 改用新路径。教训:删除一个模块前,要按"接口 → 调用方"同时检查 UI、SDK 和外部 embed,而不是只看模块名。冒烟里加了"上传再下载"的真实往返。
-   **`views/chatflows` 里有共享组件。** `APICodeDialog`、`ShareChatbot`、`EmbedChat` 是 v2 画布头部的 API 对话框用的,搬到 `views/agentflowsv2/` 之后才删除其余目录。
-   v2 画布的节点面板只展示 `Agent Flows` 类别,`AddNodes` 里 v1 的黑名单、例外、LangChain / LlamaIndex / Utilities 页签都是死代码,已收敛(783 行 → 约 580 行)。
-   `isAgentCanvas`、`isAgentflowV2` 在唯一的调用方里恒为 `true`,已从 `CanvasHeader`、`APICodeDialog`、`ShareChatbot`、`ChatMessage`、`ChatPopUp`、`ChatExpandDialog`、`ChatflowConfigurationDialog`、`FlowListMenu`、`FlowListTable` 里移除。仍留在共享组件里的少量 v1 逻辑记录在 `leftovers.md`。
-   v2 画布上的 "Upsert History" 菜单项一并删除:chatflow 的向量 upsert 接口已删除,画布上的 flow 不可能再产生 upsert 历史。Document Store 自己的 upsert 历史侧边栏保留。
-   UI 没有浏览器自动化,验收靠构建、lint、单元测试、后端冒烟加人工清单(`ui-checklist.md`)。

### D8a. 依赖瘦身实施中的修正

-   **判断一个依赖能不能删,不能只看 depcheck。** 仓库设置了 `shamefully-hoist = true`,所有包都被提升到根 `node_modules`,任何一个包都可能在没声明的情况下用到别人的依赖。所以每个候选依赖都要同时满足:基线里有引用、现在全仓库(所有包的 `src`、`nodes`、`evaluation`、配置)没有引用。
-   **两个明确不能删的"误报"**:
    -   `ioredis`(components 声明)——server 的 `CachePool`、Redis 会话、限流都在 `import 'ioredis'`,server 自己没有声明,靠提升拿到。
    -   `mysql2`(server 声明)——TypeORM 在 `DATABASE_TYPE=mysql` 时按名字动态加载,源码里不会出现。
        这两个都已保留。以后如果要整理依赖声明,应该先给 server 补上 `ioredis`。
-   实际移除了 components 的 4 个依赖:`llamaindex`(重量级,lockfile 减少约 2300 行)、`@mem0/community`、`fast-json-patch`、`jsonrepair`;同时删除了只服务于 LlamaIndex 评估追踪的 `evaluation/EvaluationRunTracerLlama.ts` 和 `handler.ts` 里依赖 `options.llamaIndex` 的分支。
-   保留了 `@langchain/langgraph`:它虽然不再被节点使用,但仍在自定义函数沙箱的可用模块白名单里(`components/src/utils.ts`),删掉会让用户代码里 `require` 它失败。
-   比预期少得多:大部分 LangChain 系列包保留的节点(聊天模型、向量库、文档加载器)仍在使用,所以只删节点目录并不会让依赖树明显变小。
-   `packages/observe` 删除时同步清理了 `build:docker` 过滤条件、`publish-observe.yml` 工作流和 `agentflow` 里两处"与 observe 保持同步"的注释。`pnpm-workspace.yaml` 用 `packages/*` 通配,不需要改。

### D8. 依赖瘦身放在最后,并以构建通过为准

所有代码删除都完成之后,再逐个包用 `depcheck` 或 `knip` 找出没有被引用的依赖,删除后重新执行 `pnpm install` 和 `pnpm build`。这一步和代码删除分开提交,出问题时可以只回退这一步。

## Risks / Trade-offs

-   [`utils/index.ts` 或 `buildChatflow.ts` 中的某个函数被 v2 间接用到,删掉之后才发现] → 每次删除之后都跑 `tsc`;冒烟清单要覆盖流式输出、文件上传、TTS、HITL、定时调度、webhook、MCP endpoint。
-   [删除 `memory`、`cache`、`retrievers` 之后,某个保留节点在运行时动态 `require` 失败,编译期发现不了] → 冒烟清单要覆盖 v2 Agent 节点使用 Tools、Document Store Retriever 以及 MCP 工具的组合;同时 grep 被删目录名,确认没有字符串形式的动态引用。
-   [UI 中大量组件带有 `isAgentCanvas` 一类分支,清理不完整的话会留下死代码] → UI 清理阶段 grep 这些标志,判断哪些分支已经不可能走到;不要求一次清理干净,只要求功能正确,剩余的死代码记录下来。
-   [`packages/agentflow` SDK 的 jest 测试 mock 了旧路径,迁移后测试失败] → SDK 的修改和接口迁移放在同一个任务里完成,并在该任务中跑 SDK 测试。
-   [export-import 删除 Assistant、CustomTemplate 段之后,从上游 Flowise 导出的文件无法导入] → 这是 spec 要求的行为:返回 400 并说明原因。全新部署没有需要兼容的旧导出文件。
-   [本地 Node v22 与 `.nvmrc` 要求的 v24 不一致] → 第一步先确认基线构建;如果 v22 下构建失败,先切换到 v24,再开始任何删除工作。
-   [裁剪之后基本无法再 merge 上游的安全修复] → 用户已接受这个代价。之后只能看上游 changelog,手动移植需要的修复。

## Migration Plan

按 tasks.md 的阶段顺序执行。每个阶段完成后的检查标准如下:

1. `pnpm build` 通过。
2. `pnpm test` 通过;被删模块的测试随模块一起删除。
3. **v2 冒烟清单**(手动执行,或在 cypress 中补充用例):新建 v2 flow 并保存;Start → Agent(带一个 Tool 和一个 MCP 工具)→ Direct Reply 能以流式方式返回;Agent 节点使用 Document Store 知识库;Condition、Iteration、Loop、Human Input 能正确分支、循环,并且在 HITL 处暂停后能继续;Execute Flow 能调用另一个 v2 flow;Executions 页面能看到执行记录;公开分享链接和 embed 能对话;定时调度和 webhook 能触发执行;"AI 生成 flow"和"AI 生成 prompt"能正常使用;Evaluations 能对 v2 flow 运行一次评估;SDK 示例(`packages/agentflow/examples`)能加载和保存 flow。

回滚方式:每个阶段单独提交,回退一个阶段只需要 revert 对应的提交。项目是全新部署,数据库可以直接重建。如果需要在有数据的库上回滚,删表 migration 的 `down()` 会重建两张空表。

## Open Questions

-   要不要在以后写一个 migration,把 `chat_flow.type` 列的数据库默认值改为 `AGENTFLOW`?目前由 service 层保证,不影响本次的规范、方案和任务拆分。
-   metrics 和 telemetry 中带 `CHATFLOW_*` 字样的计数器名称要不要改名?目前保持不变;如果以后要改,会影响已有的监控面板。
