# Tasks

## 1. 资源运行时

-   [x] 1.1 从 `channels/media/resourceSource.ts` 抽出 `findResource(value, workspaceId, kinds)`，`resourceSource` 改为调用它；在 `channels/media/errors.ts` 新增 `resourceOnly` 错误；运行现有的 `resourceSource` 和 `e2e.resources` 测试，确认 WeChat 发送行为不变
-   [x] 1.2 在 `components/src/Interface.ts` 新增 `IResourceFile`、`IResourceRuntime`；在 `services/resources/runtime.ts` 实现 `createRunResourceRuntime(workspaceId)`（design 决策 1），并在 `buildAgentflow` 的运行参数中加入 `resources`；单元测试覆盖按 ID、按名称、其他工作区的资源不可见、类型不匹配、文件丢失，以及传入绝对路径和 URL 时抛出 `resourceOnly`

## 2. 通用资源参数

-   [x] 2.1 把 `mediaParam`、`listResources` 及其变体移到 `components/src/resourceParams.ts`，WeChat `shared.ts` 改为重新导出；新增 `resourceParam` 和 `listAttachableResources`（图片加上可以提取文本的扩展名）；把下拉选项的测试从 `WeChat/resourceOptions.test.ts` 移到 `src/resourceParams.test.ts`（WeChat 的测试只保留节点参数定义），并补充 `listAttachableResources` 不包含视频、zip、doc 的用例；运行 `mediaNodes.test.ts` 确认 WeChat 节点参数定义不变
-   [x] 2.2 写测试确认数组参数行中的 `res://name/价目表-{{ $flow.state.city }}` 在 `buildAgentflow` 中被替换；在画布上确认数组行里的 `asyncOptions` 加 `freeSolo` 能下拉选择，也能直接输入；如果不支持，按 design 风险第一条修改数组行渲染或改用备选方案，并把结论写回 design.md

## 3. 文本提取

-   [x] 3.1 实现 `components/src/resourceText.ts`（design 决策 3）：pdf、docx、xlsx/xls（标明工作表名称）、pptx、txt（BOM、严格 UTF-8、GBK 回退），不支持的格式和没有文字时抛出带资源名称的错误，按 `RESOURCE_TEXT_MAX_CHARS` 截断并注明原长度，`path + size + mtime` LRU 缓存；用放在测试 fixtures 中的小样例文件写单元测试，覆盖 `resource-loading` 规格中的每个提取场景、截断，以及替换文件后缓存失效
-   [x] 3.2 在 `packages/server/.env.example` 和 `docker/.env.example` 中加入带注释的 `RESOURCE_TEXT_MAX_CHARS`（默认 50000）；确认两个文件中的变量名一致

## 4. Load Resource 节点

-   [x] 4.1 新增 `nodes/agentflow/LoadResource/LoadResource.ts`（design 决策 4）：资源参数、返回内容（text/path/info）、更新 flow state；返回值的 `input` 中包含替换后的引用、资源名称和类型；单元测试覆盖三种返回内容、视频选择"文本内容"时失败、绝对路径输入失败、写入 flow state
-   [x] 4.2 在 UI 的 `store/constant.js` 中为 `loadResourceAgentflow` 加图标和颜色；在 `locales/zh-CN/nodes.json` 中补充节点、参数和选项的中文；运行 `i18n/nodesCoverage.test.js` 和 `AddNodes.test.jsx`，确认节点出现在 `Agent Flows` 分组中

## 5. LLM 和 Agent 的附加资源

-   [x] 5.1 在 `nodes/agentflow/resourceAttachments.ts` 中实现 `attachResourcesParam`、`buildResourceAttachments`、`insertResourceAttachments`（design 决策 5）：图片在 `allowImageUploads` 不为真时报错，否则生成 `image_url`；文档提取文本并标明资源名称；合成带 `_isTemporaryResourceMessage` 的 user 消息；单元测试覆盖图片、文档、混合、模型未开启图片输入、zip 失败
-   [x] 5.2 LLM 节点新增 `llmResources` 参数并递增版本号；在开启和不开启记忆两条路径中都把附加消息插在最后一条用户消息之前；写入记忆和返回执行记录前同时过滤 `_isTemporaryResourceMessage`，`input` 中加入 `resources: [{ name, kind }]`；测试验证模型收到附加内容、记忆和返回的 `input.messages` 中没有附加内容、未附加资源时消息与修改前相同
-   [x] 5.3 Agent 节点新增 `agentResources` 参数并递增版本号，处理方式同 5.2，包括工具调用多轮时附加消息只插入一次、写入记忆前被过滤；测试覆盖与 5.2 相同的场景，以及带工具调用的情况
-   [x] 5.4 在 `locales/zh-CN/nodes.json` 中补充两个附加资源参数的中文，参数说明中提示大文档应使用 Document Store；运行 `i18n/nodesCoverage.test.js`

## 6. 保存时检查与使用统计

-   [x] 6.1 把 `channels/media/validate.ts` 的 `MEDIA_NODE_KINDS` 改为参数级描述列表（design 决策 6），加入 Load Resource 和 LLM、Agent 的附加资源，`resourceOnly` 的参数中不是资源引用的值产生警告，附加资源中不能提取文本的文件也产生警告；测试覆盖 `resource-references` 规格中保存检查的四个场景，以及 WeChat 三个节点的现有测试继续通过
-   [x] 6.2 在 `services/resources/usages` 的测试中加入 LLM 附加资源和 Load Resource 引用的流程，验证它们计入"使用中"、含变量的引用不计入

## 7. 文档与集成验证

-   [x] 7.1 在 `README.md` 的资源库章节补充：Load Resource 的三种返回内容、LLM/Agent 附加资源的用法（图片需要开启模型图片输入、支持的文档格式、字符上限）、只能使用资源库中的资源；逐条对照第 3 到 5 组的实际行为核对
-   [x] 7.2 端到端测试：上传一份 pdf 和一张图片，保存一个"Start → Load Resource（pdf，文本内容，写入 flow state）→ LLM（附加该图片，输入消息引用 flow state）"的流程，用模拟的 chat model 运行，验证模型收到 pdf 文本和图片、执行记录中 LLM 节点只列出资源名称和类型；替换 pdf 后再运行一次，验证收到的是新文本

## Workflow follow-up

-   前置条件：`add-resource-library` 完成并归档后再开始实现本 change；本 change 对 `resource-references` 的 MODIFIED 需要该规格已存在于 `openspec/specs/` 中，否则无法归档。
-   实现与验证完成后用 `/opsx:archive` 归档本 change。
-   以后可以考虑：HTTP 节点以 form-data 上传资源、Load Resource 输出 Data URI、扫描版 pdf 的 OCR、把资源导入 Document Store。
