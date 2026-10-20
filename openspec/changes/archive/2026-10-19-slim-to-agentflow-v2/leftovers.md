# 遗留项

没有在本次 change 里清理的内容。每一项都写明原因,方便以后判断要不要继续做。

## v1 残留,但与共享组件缠在一起,没有安全地删除

| 位置                                                                                                           | 内容                                                                             | 为什么留着                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui/src/utils/genericHelper.js` `getAvailableNodesForVariable`                                                 | `else` 分支(按 v1 锚点连线取上游节点)                                            | 当前调用方传入的目标节点都是 Agent Flows 类别,走不到;但这个函数被 6 个输入组件共用,留着它可以让"目标节点不存在"时仍返回空数组而不是抛错                    |
| `ui/src/ui-component/dialog/FormatPromptValuesDialog.jsx` 及 `NodeInputHandler` 里的 `formatPromptValues` 入口 | v1 链节点"格式化提示值"参数                                                      | v2 节点没有这种参数类型,但它属于 `NodeInputHandler` 的通用参数渲染,要和节点参数类型一起整理                                                                |
| `ui/src/views/evaluations/CreateEvaluationDialog.jsx`                                                          | 过滤评估用模型的条件 `!node.tags \|\| !node.tags.indexOf('[LlamaIndex]') === -1` | 上游就写错了(实际效果是**带任何 tag 的 chat model 都被排除**)。LlamaIndex 节点已删除,但这个条件还会影响其他带 tag 的模型,改它属于行为变化,没有放进本次范围 |
| `components/nodes/agentflow/*` 里的 `tags?.includes('LlamaIndex')`                                             | 过滤 LlamaIndex 模型/工具                                                        | 现在恒为假,无害,任务 5.2 明确允许保留                                                                                                                      |
| `ui/src/views/agentflowsv2/*`、`ChatflowConfigurationDialog` 等                                                | 名字里的 `chatflow`(组件名、`/chatflows` 接口、`SET_CHATFLOW` 等)                | 接口路径是 SDK、embed 和公开分享链接的契约;重命名收益小、范围大                                                                                            |

## 上游本来就没人用的代码(不是这次变出来的,没动)

-   `ui/src/utils/genericHelper.js`:`convertDateStringToDateObject`、`getFolderName`、`throttle`
-   `server/src/utils/index.ts`:`convertToValidFilename`、`getUploadPath`、`calculateNodesDepth`、`getAllNodesInPath`
-   多个 `api/*.js` 里没人调用的方法(`deleteDatasetRow`、`getRoleById` 等)

## 数据与配置

-   历史 migration 写入的默认角色权限 JSON 里仍含 `chatflows:*`、`assistants:*`、`templates:*`。没有任何守卫识别它们,角色编辑页也不会显示,是无害的残留。
-   `chat_flow.type` 列在数据库里的默认值仍是 `'CHATFLOW'`(sqlite 改默认值要重建表)。所有写入路径都带 `type`,不会产生这样的行。
-   指标计数器仍使用 `CHATFLOW_PREDICTION_*` / `CHATFLOW_CREATED`(上游里 v2 flow 一直记在这组下)。
-   `components/dist` 不会被 `tsc` 清理,增量构建前要先 `pnpm clean`(见 design D7a)。

## 无法在本环境验证

-   所有浏览器里的交互(见 `ui-checklist.md`)。
-   MySQL / MariaDB 的 migration 没有实跑(本机没有这两种数据库)。
-   `cypress` 二进制没有安装;e2e 只有 `apikey` 和 `variables` 两个用例,都不涉及已删页面。
-   Datasets / Evaluators / Evaluations:开源版没有这些权限,需要 enterprise 许可才能验证。
-   所有需要真实模型的功能(Agent / LLM 节点执行、AI 生成 flow、AI 生成 prompt)。
