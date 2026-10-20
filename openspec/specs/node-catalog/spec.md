# node-catalog Specification

## Purpose

定义节点注册表(节点列表、节点详情、节点 load method、节点配置接口)向画布、SDK 和执行引擎提供的节点集合,确保只暴露 Agentflow v2 及 Document Store 实际可用的节点。

## Requirements

### Requirement: 提供全部 Agentflow v2 节点

节点注册表 SHALL 提供全部 Agentflow v2 节点:Start、Agent、LLM、Condition、Condition Agent、Direct Reply、Custom Function、Execute Flow、HTTP、Human Input、Iteration、Loop、Retriever、Tool、Sticky Note。

#### Scenario: 列出节点

-   **WHEN** 客户端请求节点列表
-   **THEN** 返回结果包含上述每个 Agentflow v2 节点,并且每个节点的输入定义与裁剪前一致

### Requirement: 提供 v2 节点动态引用的组件类别

节点注册表 SHALL 提供 v2 节点通过 load method 动态加载的组件类别:Chat Models、Tools、Tools (MCP)、Embeddings、Vector Stores。

#### Scenario: Agent 节点加载模型列表

-   **WHEN** 画布对 Agent 节点调用 `listModels` load method
-   **THEN** 返回的 chat model 选项与裁剪前一致

#### Scenario: Agent 节点加载工具列表

-   **WHEN** 画布对 Agent 或 Tool 节点调用 `listTools` load method
-   **THEN** 返回全部保留的 Tools 和 MCP 工具,不包含已删除的工具

### Requirement: 提供 Document Store 依赖的组件类别

节点注册表 SHALL 提供 Document Store 加载、切分、向量化、入库所需的组件类别:Document Loaders、Text Splitters、Embeddings、Vector Stores、Record Manager。

#### Scenario: 创建 Document Store 时选择加载器

-   **WHEN** 用户在 Document Store 中添加文档加载器
-   **THEN** 可选的加载器、切分器、embedding、向量库、record manager 与裁剪前一致

### Requirement: 不提供已移除的节点类别

节点注册表 SHALL NOT 提供以下类别中的任何节点:Agents、Chains、LLMs、Multi Agents、Sequential Agents、Output Parsers、Prompts、Engine、Response Synthesizer、Graph、Moderation、Memory、Cache、Retrievers。

#### Scenario: 节点列表中没有已移除类别

-   **WHEN** 客户端请求节点列表
-   **THEN** 返回结果中没有任何节点的 category 属于上述已移除类别

#### Scenario: 请求已移除的节点

-   **WHEN** 客户端按名称请求一个已移除的节点(例如 `supervisor` 或 `conversationChain`)
-   **THEN** 系统返回 404

### Requirement: 不提供 LlamaIndex 节点

节点注册表 SHALL NOT 提供带 `LlamaIndex` 标签的节点,包括保留类别(Chat Models、Embeddings、Vector Stores)中的 LlamaIndex 变体。

#### Scenario: 按类别列出 chat model

-   **WHEN** 客户端请求 `Chat Models` 类别的节点
-   **THEN** 返回结果中没有任何带 `LlamaIndex` 标签的节点

### Requirement: 不提供依赖已移除组件输入的工具

节点注册表 SHALL NOT 提供输入必须接入已移除组件(Chain、Query Engine、Retriever、LLM 锚点)的工具:Chain Tool、Query Engine Tool、Retriever Tool、Web Browser。

#### Scenario: 工具列表中没有这些工具

-   **WHEN** 画布对 Tool 节点调用 `listTools`
-   **THEN** 返回结果不包含 Chain Tool、Query Engine Tool、Retriever Tool、Web Browser

### Requirement: 调用其他 flow 的节点只能选择 AGENTFLOW

Execute Flow 节点、Agent as Tool、Chatflow Tool 在列出可调用的 flow 时 SHALL 只列出 AGENTFLOW 类型的 flow。

#### Scenario: Execute Flow 列出可调用的 flow

-   **WHEN** 画布对 Execute Flow 节点调用列出 flow 的 load method
-   **THEN** 只返回当前工作区内的 AGENTFLOW 类型 flow

#### Scenario: Chatflow Tool 列出可调用的 flow

-   **WHEN** 画布对 Chatflow Tool 调用 `listChatflows`
-   **THEN** 只返回当前工作区内的 AGENTFLOW 类型 flow
