# Proposal

## Why

`add-resource-library` 让资源可以上传和管理，但只有 WeChat 的 Send Image、Send File、Send Video 能选择资源，其他节点用不了。产品手册、价目表、海报这类资源上传以后，想让 LLM 读文档内容或看图片回答问题，或者把资源信息交给后续节点，现在都做不到，只能把内容复制进提示词。本 change 让工作流节点也能通过选择资源来载入资源。

## What Changes

-   资源选择变成所有节点都能用的通用能力：选择控件、按类型过滤的 loadMethod 和运行时解析，从 WeChat 节点的内部实现中抽出来，成为通用模块。WeChat 媒体节点改为使用通用模块，行为不变。
-   新增通用节点 **Load Resource**（Agent Flows 分组）：选择一个资源（或输入 `res://name/...`，可以含变量），按"返回内容"选项输出文档的文本内容、资源文件的本地路径或资源信息（JSON），并可以写入 flow state，后续节点用变量引用。
-   **LLM** 和 **Agent** 节点新增"附加资源"参数，可以选择多个资源：图片作为视觉输入发给模型，文档（pdf、docx、xlsx、pptx、txt 等）提取文本后放进本次调用的上下文。视频和无法提取文本的文件不能附加，节点失败并说明原因。
-   新增文档文本提取：支持 pdf、docx、xlsx/xls、pptx、txt；超过字符上限的内容截断，并注明已截断。
-   这些新入口只接受资源库中的资源（`res://id/`、`res://name/`），不接受本地绝对路径和 URL，避免通过工作流把服务器上的任意文件读进模型上下文。
-   附加的资源内容只用于本次调用，不写入对话记忆。执行记录中只记录资源名称，不记录文件内容或 base64。
-   保存流程时的资源引用检查扩展到 Load Resource 和 LLM/Agent 的附加资源；资源"使用中"统计自动包含这些引用，不需要额外处理。
-   不在本 change 范围内：Load Resource 输出图片的 Data URI 或 base64、HTTP 节点以 form-data 上传资源文件、Custom Function 直接读取资源文件、视频内容理解、扫描版 pdf 的 OCR、旧版 .doc/.ppt 的文本提取、把资源批量导入 Document Store。

## Capabilities

### New Capabilities

-   `resource-loading`: 资源在流程运行时如何被载入为可用内容：文本提取的格式、上限与失败方式，以及 Load Resource 节点的参数、输出和 flow state 写入。
-   `model-resource-inputs`: LLM 和 Agent 节点的附加资源：可选的资源类型、图片和文档分别如何交给模型、与对话记忆和执行记录的关系。

### Modified Capabilities

-   `resource-references`: 资源选择控件从三个 WeChat 媒体节点扩展为通用参数，新增"只接受资源引用"的参数形式；保存时的引用检查覆盖新节点和新参数。
-   `node-catalog`: Agentflow v2 节点列表新增 Load Resource；LLM 和 Agent 的输入定义新增"附加资源"。

## Impact

-   代码：`packages/components`（从 `nodes/agentflow/WeChat/shared.ts` 抽出通用的资源参数和 loadMethod；新增 Load Resource 节点；LLM、Agent 节点新增附加资源并调整消息组装；`Interface.ts` 新增运行时的资源接口）；`packages/server`（`buildAgentflow` 的运行参数新增资源运行时；资源解析返回资源信息；文本提取；`channels/media/validate.ts` 的保存时检查扩展到新参数）；`packages/ui`（`locales/zh-CN/nodes.json` 中新增节点和参数的中文）。
-   依赖：前置 change 是 `add-resource-library`（需要它的资源表、`res://` 解析和选择控件），本 change 对 `resource-references` 的修改以它归档后的规格为基础；对 `node-catalog` 的修改以 `add-wechat-channel` 归档后的规格为基础。文本提取使用 `packages/components` 已有的 `pdf-parse`、`mammoth`、`xlsx`、`officeparser`，不新增依赖。
-   数据：不新增表，不改动已有表。LLM、Agent 节点版本号加 1，已保存流程不需要迁移。
-   配置：新增环境变量 `RESOURCE_TEXT_MAX_CHARS`（单个资源提取文本的字符上限，默认 50000）。
