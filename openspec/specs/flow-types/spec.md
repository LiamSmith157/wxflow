# flow-types Specification

## Purpose

定义平台支持哪些 flow 类型。本平台只承载 Agentflow v2 一种编排形态,任何其他类型的 flow 都不能被创建、存储或执行。

## Requirements

### Requirement: 仅支持 AGENTFLOW 类型

系统 SHALL 只承认 `AGENTFLOW` 这一种 flow 类型。`CHATFLOW`、`MULTIAGENT`、`ASSISTANT` 不再是合法值。

#### Scenario: 创建 AGENTFLOW 类型的 flow

-   **WHEN** 客户端调用创建 flow 接口,`type` 为 `AGENTFLOW`
-   **THEN** 系统创建成功,返回的 flow 的 `type` 为 `AGENTFLOW`

#### Scenario: 用已移除的类型创建

-   **WHEN** 客户端调用创建 flow 接口,`type` 为 `CHATFLOW`、`MULTIAGENT` 或 `ASSISTANT`
-   **THEN** 系统返回 400,提示 flow 类型非法,并且不写入任何数据

#### Scenario: 用已移除的类型更新

-   **WHEN** 客户端更新一个已有 flow,请求中的 `type` 为 `CHATFLOW`、`MULTIAGENT` 或 `ASSISTANT`
-   **THEN** 系统返回 400,该 flow 保持不变

### Requirement: 缺省类型为 AGENTFLOW

创建 flow 时如果没有提供 `type`,系统 SHALL 将其存为 `AGENTFLOW`。

#### Scenario: 不传 type 创建

-   **WHEN** 客户端调用创建 flow 接口,请求体中没有 `type` 字段
-   **THEN** 系统创建成功,存储的 `type` 为 `AGENTFLOW`

### Requirement: 列表查询只返回 AGENTFLOW

flow 列表和计数接口 SHALL 只返回 `AGENTFLOW` 类型的 flow,无论请求是否带 `type` 参数。

#### Scenario: 不带 type 参数查询列表

-   **WHEN** 客户端查询 flow 列表,不带 `type` 参数
-   **THEN** 返回当前工作区内的全部 AGENTFLOW 类型 flow

#### Scenario: 带已移除的 type 参数查询

-   **WHEN** 客户端查询 flow 列表,`type` 参数为 `CHATFLOW`、`MULTIAGENT` 或 `ASSISTANT`
-   **THEN** 系统返回 400,提示 flow 类型非法

### Requirement: 导入只接受 AGENTFLOW

导入接口 SHALL 只导入 AGENTFLOW 类型的 flow 以及保留模块的数据。导入数据中出现已移除类型的 flow、Assistant 或自定义模板时,系统 SHALL 拒绝整个导入。

#### Scenario: 导入只含 AGENTFLOW 的数据

-   **WHEN** 用户导入一份只包含 AGENTFLOW、Tools、Variables 等保留模块数据的导出文件
-   **THEN** 导入成功,所有数据都写入当前工作区

#### Scenario: 导入包含已移除类型的数据

-   **WHEN** 用户导入的文件中含有 `CHATFLOW` 或 `MULTIAGENT` 类型的 flow,或者含有非空的 `AssistantCustom`、`AssistantFlow`、`AssistantOpenAI`、`CustomTemplate` 段
-   **THEN** 系统返回 400,说明哪些数据类型不受支持,并且不写入任何数据

### Requirement: 导出只包含保留模块

导出接口 SHALL 只输出 AGENTFLOW 类型的 flow 以及保留模块的数据,不输出 Chatflow、Agentflow v1、Assistant、自定义模板相关的段。

#### Scenario: 导出全部数据

-   **WHEN** 用户选择导出全部数据
-   **THEN** 导出文件中包含 AGENTFLOW flow、Tools、Variables 等保留模块的数据,不包含 `ChatFlow`、`MultiAgent`、`AssistantCustom`、`AssistantFlow`、`AssistantOpenAI`、`CustomTemplate` 段

### Requirement: 执行只针对 AGENTFLOW

所有 flow 执行入口(内部和外部的 prediction、定时调度、webhook、MCP endpoint、队列 worker)SHALL 只用 Agentflow v2 引擎执行 AGENTFLOW 类型的 flow。

#### Scenario: 执行 AGENTFLOW flow

-   **WHEN** 客户端对一个 AGENTFLOW 类型的 flow 发起 prediction 请求
-   **THEN** 系统用 Agentflow v2 引擎执行,返回结果,并记录一条 execution

#### Scenario: 执行非 AGENTFLOW 类型的遗留记录

-   **WHEN** 数据库中存在一条 `type` 不是 `AGENTFLOW` 的 flow 记录(例如被人直接写入),客户端对它发起 prediction 请求
-   **THEN** 系统返回 400,提示 flow 类型不受支持,并且不执行任何节点
