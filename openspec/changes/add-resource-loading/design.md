# Design

## Context

动机和范围见 proposal.md，行为要求见 `specs/resource-loading`、`specs/model-resource-inputs` 和 `specs/resource-references`。设计受以下现状约束：

-   **资源解析只服务 WeChat 发送。** `add-resource-library` 把 `res://` 解析做成媒体来源解析器上的一个来源（`server/src/channels/media/resourceSource.ts`），节点通过 `options.channels.resolveMedia(value, { kinds })` 调用，只拿回 `{ path, temporary }`，拿不到资源名称、类型等信息。`options.channels` 在 `buildAgentflow` 的运行参数里对所有节点都有，但它是渠道运行时，语义上不该承担资源载入。
-   **选择控件在 WeChat 模块里。** `mediaParam`、`listResources`、`listImageResources` 等定义在 `components/nodes/agentflow/WeChat/shared.ts`，loadMethod 通过 `options.appDataSource` 和 `searchOptions` 中的 `workspaceId` 查询 `Resource`。
-   **LLM/Agent 的图片处理。** 两个节点在首个节点且有聊天上传时，用 `getUniqueImageMessages` 把图片加进消息，前提是模型配置 `allowImageUploads` 为真。只用于本次调用的消息会标上 `_isTemporaryImageMessage`，在写入记忆和返回执行记录前被过滤掉。
-   **保存时检查。** `channels/media/validate.ts` 用 `MEDIA_NODE_KINDS` 列出三个 WeChat 节点，只检查 `wechatMedia` 一个参数。
-   **文档解析依赖已在 components 中。** `pdf-parse`、`mammoth`、`xlsx`、`officeparser` 已经是 `packages/components` 的依赖（Document Loaders 在用）。

## Goals / Non-Goals

**Goals:**

-   节点只通过一个运行时接口载入资源，不直接读资源表，也不拼资源文件路径。
-   WeChat 媒体节点的参数定义、保存值和运行结果不变，只是改为引用通用模块。

**Non-Goals:**

-   不缓存提取结果到磁盘或数据库，不做文本切分或向量化（要做检索请用 Document Store）。
-   不改变聊天上传图片的现有行为。

## Decisions

### 1. 资源运行时 `options.resources`

`components/src/Interface.ts` 新增：

```ts
interface IResourceFile {
    id
    name
    groupName?
    kind: 'image' | 'video' | 'file'
    mimeType
    ext
    size
    path
    ref
}
interface IResourceRuntime {
    workspaceId: string
    /** 只接受 res://id/ 和 res://name/；kinds 限定类型；失败时抛出面向用户的错误 */
    load(ref: string, options?: { kinds?: ResourceKind[] }): Promise<IResourceFile>
}
```

服务端在 `services/resources/runtime.ts` 实现，`buildAgentflow` 的运行参数里加上 `resources: createRunResourceRuntime(workspaceId)`，和 `channels` 并列。查找逻辑从 `resourceSource.ts` 中抽成 `findResource(value, workspaceId, kinds)`，返回资源记录；`resourceSource` 改为调用它再取路径。这样两个入口的错误文案（资源不存在、名称找不到、类型不匹配、文件丢失）完全一致。不是 `res://` 开头的值，由 `load` 抛出新增的 `resourceOnly` 错误（"只能使用资源库中的资源"）。

备选：让新节点直接调用 `options.channels.resolveMedia`。这个方法接受 URL 和绝对路径，正是新入口要拒绝的；而且它不返回资源信息，Load Resource 的"资源信息"输出和执行记录里的资源名称都做不了。

### 2. 通用的资源参数与 loadMethod

`mediaParam`、`listResources` 及其变体移到 `components/src/resourceParams.ts`，WeChat 的 `shared.ts` 改为从这里重新导出，WeChat 节点文件不需要改动。新增：

-   `resourceParam(label, name, description, loadMethod)`：与 `mediaParam` 相同（`asyncOptions` 加 `freeSolo` 加 `acceptVariable`），只是参数名可以指定；
-   `listAttachableResources`：图片，加上扩展名可以提取文本的文件（pdf、docx、xlsx、xls、pptx、txt）。这样附加资源的下拉里不会出现 zip、doc 这类一定会失败的文件。

选项格式和排序规则不变（`name` 为 `res://id/<id>`，`label` 为名称，按分组排列）。

### 3. 文本提取

在 `components/src/resourceText.ts` 中实现 `extractResourceText(file: IResourceFile)`，放在 components 而不是服务端，因为解析库已经在这里，LLM、Agent、Load Resource 也都在这里运行：

| 扩展名    | 方式                                                                   |
| --------- | ---------------------------------------------------------------------- |
| pdf       | `pdf-parse`                                                            |
| docx      | `mammoth.extractRawText`                                               |
| xlsx、xls | `xlsx` 逐个工作表 `sheet_to_csv`，每段前加 `## 工作表：<名称>`         |
| pptx      | `officeparser`                                                         |
| txt       | 有 BOM 按 BOM 解码；否则先用严格模式按 UTF-8 解码，失败时再按 GBK 解码 |

其他扩展名，以及图片和视频，都抛出"不支持提取文本"错误，错误信息带资源名称；doc、ppt 额外建议另存为新格式。提取结果去掉空白后为空时，抛出"没有可提取的文字"。上限取 `RESOURCE_TEXT_MAX_CHARS`（默认 50000），截断时在末尾追加 `[内容已截断，原文共 N 个字符]`。

进程内保留一个小的 LRU 缓存（20 项），键为 `path + size + mtime`。多轮对话中每轮都要重新载入同一份手册，缓存可以避免重复解析大文件；替换文件后 `mtime` 和 `size` 会变化，缓存自然失效。

### 4. Load Resource 节点

`components/nodes/agentflow/LoadResource/LoadResource.ts`，名称 `loadResourceAgentflow`，类别 `Agent Flows`。参数：

-   `loadResourceRef`：`resourceParam`，loadMethod 为 `listAllResources`；
-   `loadResourceReturnAs`：`text`（默认）/ `path` / `info`；
-   `loadResourceUpdateState`：与 Custom Function 的 `customFunctionUpdateState` 同构（key 用 `listRuntimeStateKeys`，value 可以引用 `{{ output }}`）。

运行时：`options.resources.load(ref)`，类型校验由"返回内容"决定（`text` 时图片和视频直接报错），再按选项生成 `output.content`。`info` 输出 `{ id, name, groupName, kind, mimeType, size, path }` 的格式化 JSON。返回值为 `{ id, name, input: { ref, resource: { name, kind }, returnAs }, output: { content }, state }`，flow state 用现有的 `updateFlowState` 和 `processTemplateVariables` 处理，与 Custom Function 一致。

在 UI 的 `store/constant.js` `AGENTFLOW_ICONS` 中加图标和颜色，`locales/zh-CN/nodes.json` 中补充节点和参数的中文。

### 5. LLM 和 Agent 的附加资源

两个节点各新增一个数组参数（`llmResources`、`agentResources`），数组参数本身设置 `acceptVariable: true`（变量替换只看顶层参数），每行一个 `resourceParam`（loadMethod 为 `listAttachableResources`），放在消息参数之后，节点版本号递增。

运行时由共用模块 `nodes/agentflow/resourceAttachments.ts` 处理（不放在 `utils.ts`，那个模块依赖太多，会让节点测试加载整个 components；同样的原因，`updateFlowState` 和 `processTemplateVariables` 移到了 `src/flowState.ts`，原位置重新导出）。`attachResourcesParam` 生成参数，`buildResourceAttachments(rows, options, modelConfig)` 依次处理：

1. 逐行 `options.resources.load(ref, { kinds: ['image', 'file'] })`；
2. 图片：`allowImageUploads` 不为真时报错，提示开启图片输入；否则读取文件，生成 `image_url` 内容（`data:<mime>;base64,...`，`detail` 与聊天上传图片的现有处理方式保持一致）；
3. 文档：`extractResourceText`，生成文本内容 `以下是资源《<名称>》的内容：\n<文本>`；
4. 合成一条 `{ role: 'user', content: [...], _isTemporaryResourceMessage: true }`。

这条消息插在本次调用最后一条用户消息之前；如果没有用户消息，就追加到末尾。无论是否开启记忆、是否是首个节点都会插入，因为它来自节点配置，不像聊天上传那样只属于第一轮。

写入记忆和返回执行记录前，现有的 `_isTemporaryImageMessage` 过滤条件扩展为同时过滤 `_isTemporaryResourceMessage`。返回值的 `input` 中新增 `resources: [{ name, kind }]`，满足"执行记录只列名称和类型"。

备选：把文档放进 system 消息。部分模型只允许一条 system 消息，而且 system 消息里的内容会和用户在消息参数里写的 system 提示混在一起，所以不采用。

### 6. 保存时检查

`validate.ts` 中的 `MEDIA_NODE_KINDS` 改为按节点名描述参数的 `MEDIA_NODE_PARAMS`，每项说明从节点输入中取哪些值（`values`）、接受哪些类型（`kinds`）、是否只接受资源引用（`resourceOnly`）、其中的文件是否必须能提取文本（`textFiles`），以及类型不符时错误信息里的用词（`usage`）：

```ts
wechatSendImageAgentflow: { values: (i) => [i.wechatMedia], kinds: ['image'] }          // 另两个 WeChat 节点同理，不变
loadResourceAgentflow:    { values: (i) => [i.loadResourceRef], resourceOnly: true, usage: '使用' }
llmAgentflow:             { values: rowValues('llmResources'), kinds: ['image', 'file'], resourceOnly: true, textFiles: true, usage: '使用' }
agentAgentflow:           { values: rowValues('agentResources'), kinds: ['image', 'file'], resourceOnly: true, textFiles: true, usage: '使用' }
```

规则：跳过含 `{{` 的值；`resourceOnly` 的参数遇到不是 `res://` 开头的值（包括 URL）产生"只能使用资源库中的资源"警告；其余交给媒体来源解析器检查。`MediaContext` 为此新增可选的 `resourceUsage`，传给 `findResource`，使类型不符的提示说"不能作为图片或文件使用"而不是"发送"。`textFiles` 的参数里，非图片的文件按存储文件的扩展名判断能否提取文本（`canExtractText`，从 components 导出），不能时产生警告。同一个节点多行的问题合并成一条警告。WeChat 三个节点的检查结果不变。

"使用中"统计（`services/resources/usages.ts`）是对整个 `flowData` 做文本扫描，新参数中的 `res://` 引用自动计入，不需要修改，只补测试。

## Risks / Trade-offs

-   [数组参数中的 `freeSolo` 下拉] → 已核对：数组行由 `ArrayRenderer` 交给 `NodeInputHandler` 渲染，`AsyncDropdown` 的 `freeSolo` 取自行参数，load method 也从行参数中查找，`itemData` 保留节点名，所以行内可以下拉选择，也可以输入。变量替换只处理顶层 `acceptVariable` 为真的参数（行内的 `acceptVariable` 不起作用），因此 `llmResources`、`agentResources` 数组参数本身必须设置 `acceptVariable: true`；`buildAgentflow.resources.test.ts` 覆盖了这一点。
-   [大文档撑爆上下文或增加费用] → 默认上限 50000 字符，可配置，截断时明确注明；参数说明里提示大文档应使用 Document Store 检索。
-   [文本内容进入执行记录] → Load Resource 返回文本时，文本作为节点输出保存在执行记录中，这与其他节点保存输出的方式相同，下游节点也依赖它；LLM/Agent 的附加内容则不进入记录。
-   [GBK 误判] → 只有严格 UTF-8 解码失败才用 GBK，纯 ASCII 和合法 UTF-8 不受影响；其他编码（如 Big5）不支持，会显示乱码，在文档里说明。
-   [`officeparser` 对 pptx 的提取质量] → 只要求提取文字，不保留版式；测试用带中文的 pptx 样例验证。
-   [模型不支持图片但 `allowImageUploads` 被误开] → 调用会由模型服务报错，错误原样显示，不额外处理。

## Migration Plan

1. 不新增表。`.env.example` 中新增带注释的 `RESOURCE_TEXT_MAX_CHARS`。
2. LLM、Agent 节点版本号递增，新参数默认为空，已保存流程不需要迁移，行为不变。
3. 回滚：移除 Load Resource 节点和两个附加资源参数即可；已保存的流程中，Load Resource 节点会显示为未知节点，附加资源参数被忽略。
