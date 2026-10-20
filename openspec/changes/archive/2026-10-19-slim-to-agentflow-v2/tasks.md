# Tasks

## 1. 基线

-   [x] 1.1 在仓库根目录执行 `git init`,把当前未改动的上游 3.1.4 代码作为第一次提交。验证:`git log` 能看到这次基线提交,`git status` 是干净的
-   [x] 1.2 切换到 `.nvmrc` 要求的 Node v24.15.0,然后执行 `pnpm install`。验证:`node -v` 输出 v24.15.0,install 正常结束
-   [x] 1.3 执行 `pnpm build` 和 `pnpm test`,把基线结果(包括上游本来就失败的用例)记录到 `openspec/changes/slim-to-agentflow-v2/baseline.md`。验证:文件存在,并列出每个包的构建和测试结果
-   [x] 1.4 启动服务,按 design.md 的 Migration Plan 手动跑一遍 v2 冒烟清单,结果追加到 `baseline.md`。验证:清单中每一项都标注了通过或失败,作为之后各阶段的对照

## 2. 迁移共享代码(只移动,不删除功能)

-   [x] 2.1 把 `buildChatflow.ts` 中的 `generateTTSForResponseStream` 和 `shouldAutoPlayTTS` 移到 `server/src/utils/textToSpeech.ts`,同时更新 `buildAgentflow.ts` 和 `buildChatflow.ts` 的 import。验证:`buildAgentflow.ts` 不再 import `./buildChatflow`;server 的 `tsc` 通过
-   [x] 2.2 把 prompt 指令生成从 `services/assistants` 迁到 `services/agentflowv2-generator`,并注册 `POST /agentflowv2-generator/instruction`;UI 的 `PromptGeneratorDialog` 改为调用新路径;给新接口补一个 controller 的 jest 测试。验证:测试通过,并且在 v2 节点里用"生成指令"能拿到返回结果
-   [x] 2.3 把 UI 中对 `assistantsApi.getChatModels` 的调用(`AgentflowGeneratorDialog`、`NodeInputHandler`、`CreateEvaluationDialog`)改为调用 `GET /nodes/category/Chat Models`;在 `ui/src/api/nodes.js` 中增加对应方法。验证:ui 构建通过,"AI 生成 flow"对话框中的模型列表能正常加载
-   [x] 2.4 把 `packages/agentflow/src/infrastructure` 中对 `/assistants/chatmodels` 的调用改为 `GET /nodes/category/Chat Models`,同时更新相关测试的 mock。验证:`pnpm --filter @flowiseai/agentflow test` 通过
-   [x] 2.5 把 `views/canvas/{CredentialInputHandler,NodeInputHandler,NodeOutputHandler}.jsx` 移到 `ui-component/input-handlers/`,把 `views/canvas/{AddNodes,CanvasHeader}.jsx` 移到 `views/agentflowsv2/`,并更新所有 import。验证:`grep -r "views/canvas/" ui/src` 只剩 `views/canvas` 目录自身以及待删除页面的引用;ui 构建通过
-   [x] 2.6 提交本阶段改动,并重跑 v2 冒烟清单中的 AI 生成、节点编辑、凭据配置这几项。验证:与基线结果一致

## 3. 后端引擎与 flow 类型

-   [x] 3.1 把 `buildChatflow.ts` 精简为 D1 描述的瘦入口:非 `AGENTFLOW` 类型返回 400;删除 CHATFLOW 和 MULTIAGENT 执行分支。补一个 jest 测试,覆盖"非 AGENTFLOW 类型返回 400"。验证:测试通过,`tsc` 通过
-   [x] 3.2 删除 `utils/buildAgentGraph.ts` 及其测试。验证:`grep -r buildAgentGraph server/src` 没有结果
-   [x] 3.3 按 D2 清理 `utils/index.ts`:删掉在 3.1 之后已经没有调用方的函数,以及 `isStartNodeDependOnInput`、`isSameOverrideConfig`、`isSameChatId`。验证:对每个被删函数名执行 grep 都没有结果;`tsc` 通过
-   [x] 3.4 把 `EnumChatflowType` 和 `ChatflowType` 收缩为只有 `AGENTFLOW`;实体 `type` 列的默认值改为 `AGENTFLOW`;`saveChatflow` 在没传 `type` 时设为 `AGENTFLOW`;`getAllChatflows` 和计数函数固定只查 AGENTFLOW。为 `services/chatflows` 补 jest 测试,覆盖 flow-types spec 中创建、更新、缺省类型、列表查询这几个场景。验证:测试通过(实施时同时处理了 4 个历史 migration 对枚举的引用,以及 `export-import` 中 ChatFlow / AgentFlow(v1)/ AssistantFlow 三段,见 design D4)
-   [x] 3.5 检查 `checkIfChatflowIsValidForStreaming`、`getUploadsConfig` 等函数中只与 Chatflow 有关的分支(例如 RAG 上传判断),全部删掉。验证:`tsc` 通过;冒烟清单中的流式输出和文件上传两项通过
-   [x] 3.6 提交本阶段改动,并重跑完整的 v2 冒烟清单。验证:与基线结果一致

## 4. 后端 API、实体与权限

-   [x] 4.1 删除 `assistants`、`openai-assistants`、`openai-assistants-files`、`openai-assistants-vector-store`、`openai-realtime` 这几个模块的 routes、controllers、services,并从 `routes/index.ts` 中去掉注册;同时在 `index.ts` 的 UI 兜底路由之前增加 `/api` 下未匹配请求返回 404 JSON 的处理(上游会对任何未匹配路径返回 `200 + index.html`)。验证:`tsc` 通过;请求这些路径返回 404 且 `Content-Type` 为 JSON
-   [x] 4.2 删除 `marketplaces` 模块的 routes、controllers、services,以及 `server/marketplaces/` 目录。验证:`tsc` 通过;`GET /api/v1/marketplaces/templates` 返回 404(实施时:`marketplaces/agentflowsv2` 的 13 个文件没有删除,而是改名为 `server/agentflow-examples/`,因为 AI 生成 flow 要把它们当参考样例,见 design D5a)
-   [x] 4.3 删除 `vectors` 模块的 routes、controllers、services,以及 `utils/upsertVector.ts`,同时删掉 `queue/UpsertQueue.ts` 中 `executeUpsert` 这个分支;保留 `upsert-history` 和 Document Store 的 upsert 任务。验证:`tsc` 通过;冒烟清单中 Document Store 的 upsert 和 upsert 历史查询都正常(实施时同时删除了随之变成死代码的 `buildFlow`、`getStartingNodes`、`getEndingNodes`、`isFlowValidForStream`、`findMemoryNode`、`getMemorySessionId`、`getAllConnectedNodes` 以及 `IncomingInput.stopNodeId`、`isUpsert`;`saveUpsertFlowData` 仍被 Document Store 使用,保留)
-   [x] 4.4 修改 `services/export-import`:删掉 ChatFlow、MultiAgent、AssistantCustom、AssistantFlow、AssistantOpenAI、CustomTemplate 段的导出;导入时如果遇到这些段或非 AGENTFLOW 类型的 flow,返回 400。补 jest 测试,覆盖 flow-types spec 中的导入、导出场景。验证:测试通过(其中 ChatFlow / AgentFlow(v1)/ AssistantFlow 三段及其导入 400 校验已在 3.4 完成,这里只处理 Assistant 与 CustomTemplate 段)(实施时 4.4 整体先于 4.1 完成,因为 export-import 同时依赖 assistants 和 marketplaces 两个 service)
-   [x] 4.5 删掉 `services/evaluations` 中的 Custom Assistant 分支。验证:`tsc` 通过;冒烟清单中的评估项通过
-   [x] 4.6 删掉 `enterprise/services/workspace.service.ts`、`account.service.ts` 以及 `utils/index.ts` 中对 `Assistant`、`CustomTemplate` 的引用。验证:`tsc` 通过;创建和删除工作区都能成功
-   [x] 4.7 删除 `Assistant`、`CustomTemplate` 实体,并从 `database/entities/index.ts` 中去掉;按 D5 为 sqlite、mysql、mariadb、postgres 各追加一个删表 migration 并注册。验证:用 sqlite 和 postgres 分别从空库启动,migration 全部执行成功,库里没有这两张表
-   [x] 4.8 在 `enterprise/rbac/Permissions.ts` 中删除 `assistants:*`、`templates:*`、`chatflows:*`;把所有路由的权限检查中对这些权限的引用去掉,只保留 `agentflows:*` 等保留权限。补一个测试,验证只有 `agentflows:view` 权限的用户可以 `GET /chatflows`。验证:测试通过;`grep -rE "'(assistants|templates|chatflows):" server/src` 没有结果
-   [x] 4.9 在 `packages/api-documentation` 中删掉上面这些被删接口的 swagger 定义,增加 `POST /agentflowv2-generator/instruction`。验证:启动文档服务后,页面中没有被删接口,有新接口
-   [x] 4.10 提交本阶段改动,并重跑完整的 v2 冒烟清单。验证:与基线结果一致

## 5. Components 节点裁剪

-   [x] 5.1 删除 `components/nodes/` 下的这些目录:agents、chains、llms、multiagents、sequentialagents、outputparsers、prompts、engine、responsesynthesizer、graphs、moderation、memory、cache、retrievers。如果编译时发现保留节点依赖其中的工具函数,按 D7 把函数搬到 `components/src`。验证:components 的 `tsc` 通过;对每个被删目录名 grep,确认没有字符串形式的动态引用(实施时 `Utilities` 类别只删除 getVariable、setVariable、ifElseFunction、stickyNote 四个节点,`CustomFunction` 保留,见 design D7a)
-   [x] 5.2 删除 tools 下的 ChainTool、QueryEngineTool、RetrieverTool、WebBrowser,以及 chatmodels、embeddings、vectorstores 中带 `LlamaIndex` 标签的节点文件。验证:`grep -rl "'LlamaIndex'" components/nodes` 只剩 agentflow 节点里的过滤代码
-   [x] 5.3 修改 `ExecuteFlow` 和 `ChatflowTool` 的列表 load method:查询时只取 `type: 'AGENTFLOW'`,并删掉 MULTIAGENT 和 Chatflow 的标签分支。补单元测试。验证:测试通过
-   [x] 5.4 在 server 中补一个节点注册表测试:断言节点列表包含全部 v2 节点,不包含任何已删除类别和 LlamaIndex 节点,并且请求已删除节点名返回 404。验证:测试通过
-   [x] 5.5 提交本阶段改动,并重跑完整的 v2 冒烟清单(重点检查 Agent + Tools、MCP、Document Store 的组合)。验证:与基线结果一致

## 6. UI 清理

-   [x] 6.1 删除 `views/chatflows`、`views/canvas`、`views/assistants`、`views/marketplaces`、`views/agentflowsv2/MarketplaceCanvas.jsx`,以及 `api/assistants.js`、`api/marketplaces.js` 和 `api/vectorstore.js` 中的 upsert 方法(保留 upsert-history 方法)。验证:ui 构建通过(实施时 `views/chatflows` 里的 `APICodeDialog`、`ShareChatbot`、`EmbedChat` 先搬到 `views/agentflowsv2/`;同时删除了无人使用的 `VectorStorePopUp`、`VectorStoreDialog`、`UpsertHistoryDialog`,见 design D7b)
-   [x] 6.2 修改 `routes/MainRoutes.jsx`、`CanvasRoutes.jsx`、`DefaultRedirect.jsx` 和 `menu-items/*`:删掉 console-navigation spec 中列出的路由和菜单项,`DefaultRedirect` 的候选列表以 Agentflows 开头。验证:按 spec 中的场景手动检查菜单、根路径和已删除的路由(`config.js` 的 `defaultPath` 同步改为 `/agentflows`,否则点 logo 会回到已删除的 `/chatflows`)
-   [x] 6.3 把 `views/agentflows` 改成只有 v2 的列表页:删掉版本切换、v1 废弃提示和 `MULTIAGENT` 查询,新建按钮跳转到 `/v2/agentcanvas`。验证:按 spec 中的场景手动检查
-   [x] 6.4 删掉 `ExportAsTemplateDialog`,以及 `FlowListMenu`、v2 `CanvasHeader`、`ToolDialog` 中与模板相关的入口。验证:`grep -rn "ExportAsTemplate\|marketplace" ui/src -i` 没有结果(同时删除了 `ToolDialog` 里只有 Marketplace 会触发的 `TEMPLATE` 模式,以及 v2 画布设置菜单里的 Upsert History)
-   [x] 6.5 删掉 `CreateEvaluationDialog` 中的 Chatflow 和 Custom Assistant 选项,以及 `ChatMessage.jsx` 中的 RAG 上传分支。验证:按 spec 中的场景手动检查评估创建和文件上传(阶段 4 反查发现,UI 里 Custom Assistant 的引用还包括 `EvaluationResult`、`EvaluationResultSideDrawer`、`EvalsResultDialog`,以及 `views/settings/index.jsx` 与 `menu-items/customassistant.js`,这些在本任务一并处理)
-   [x] 6.6 grep `isAgentCanvas`、`isAgentflowV2`、`'CHATFLOW'`、`'MULTIAGENT'`、`'ASSISTANT'`,删掉已经不可能走到的分支;无法安全删除的记录到 `openspec/changes/slim-to-agentflow-v2/leftovers.md`。验证:ui 构建通过,并且 `pnpm --filter flowise-ui test` 通过
-   [x] 6.7 删除 server 中 cypress e2e 里覆盖已删页面的用例。验证:剩下的 cypress 用例能运行(核查结果:现有 cypress 用例只有 `apikey` 和 `variables` 两个,不涉及已删页面,没有需要删除的用例;本机未安装 cypress 二进制,无法运行)
-   [x] 6.8 提交本阶段改动,并重跑完整的 v2 冒烟清单。验证:与基线结果一致(验收:构建、lint、UI 65 个与 server 1056 个测试、后端冒烟 70 项全过;浏览器里的交互见 `ui-checklist.md`,需要人工完成;阶段 6 同时发现并修复了阶段 4 误删的聊天文件下载接口)

## 7. 包与依赖瘦身

-   [x] 7.1 删除 `packages/observe`,并从根目录 `package.json` 的 `build:docker` 过滤条件和 `pnpm-workspace.yaml` 中删掉相关配置(如果有)。验证:`pnpm install` 和 `pnpm build` 通过
-   [x] 7.2 对 server、components、ui 分别运行 `depcheck`(或 `knip`),删掉不再使用的依赖,例如 LangChain 的 chains/agents、LlamaIndex,以及只被已删节点使用的 SDK。验证:重新执行 `pnpm install`、`pnpm build`、`pnpm test`,全部通过(实施时只移除了 components 的 llamaindex、@mem0/community、fast-json-patch、jsonrepair 四个依赖;ioredis 和 mysql2 看起来无人引用但不能删,见 design D8a)
-   [x] 7.3 修改根目录 `README.md`,删掉 Chatflow、Assistants、Marketplace 的介绍。验证:README 中没有这些已删功能的说明(上游 README 本来就没有这些功能的介绍;实际改动是增加"关于本仓库"一节,说明保留/移除的内容和从源码构建的方式,并指出 Quick Start 里的 `npm install -g flowise` 安装的是上游包)
-   [x] 7.4 提交本阶段改动。验证:`git status` 是干净的

## 8. 集成验收

-   [x] 8.1 用 Docker 构建镜像(`pnpm build:docker` 加上 `docker build`),从空的 sqlite 库启动,跑完整的 v2 冒烟清单。验证:每一项都通过,结果追加到 `baseline.md` 并与基线对比(本机无 Docker:改为干净克隆构建 + 空库启动,详见 baseline.md)
-   [x] 8.2 用 postgres 从空库启动一次,确认 migration 和基本的 flow 创建、执行都正常。验证:服务启动成功,能创建并执行一个 v2 flow
-   [ ] 8.3 运行 `packages/agentflow/examples`,连接裁剪后的 server,完成一次加载、编辑、保存和 AI 生成。验证:四个操作都成功

## Workflow follow-up

-   所有任务完成并经过 review 之后,归档这个 change(`/opsx:archive`),把四个 capability 的 spec 同步到 `openspec/specs/`。
