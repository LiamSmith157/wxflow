# Spec Delta

## Purpose

定义平台对外 HTTP API 的边界:哪些接口随模块删除而移除,哪些 v2 也依赖的通用接口迁移到新路径,以及 `packages/agentflow` SDK、embed 和公开分享依赖的接口契约必须保持可用。

## ADDED Requirements

### Requirement: 移除 Assistants 相关接口
系统 SHALL 移除 `/assistants`、`/openai-assistants`、`/openai-assistants-file`、`/openai-assistants-vector-store` 下的全部接口。

#### Scenario: 请求 Assistants 接口
- **WHEN** 客户端请求 `/api/v1/assistants` 或 `/api/v1/openai-assistants` 下的任意路径
- **THEN** 系统返回 404

### Requirement: 移除 Marketplace 接口
系统 SHALL 移除 `/marketplaces` 下的全部接口,包括模板列表、自定义模板的保存和删除。

#### Scenario: 请求模板列表
- **WHEN** 客户端请求 `/api/v1/marketplaces/templates`
- **THEN** 系统返回 404

### Requirement: 移除 Chatflow 专用接口
系统 SHALL 移除 `/vector`(含 upsert 和 internal-upsert)和 `/openai-realtime` 下的全部接口。

#### Scenario: 请求向量 upsert
- **WHEN** 客户端请求 `POST /api/v1/vector/upsert/{id}`
- **THEN** 系统返回 404

#### Scenario: 请求 realtime 接口
- **WHEN** 客户端请求 `/api/v1/openai-realtime` 下的任意路径
- **THEN** 系统返回 404

### Requirement: 保留 Upsert History 接口
系统 SHALL 保留 `/upsert-history` 接口,用于查询和删除 Document Store 的 upsert 历史。

#### Scenario: 查看 Document Store 的 upsert 历史
- **WHEN** 用户在 Document Store 中执行一次 upsert 之后,请求该 store 的 upsert 历史
- **THEN** 返回结果中包含这次 upsert 的记录

### Requirement: chat model 列表通过节点类别接口获取
原 `GET /assistants/components/chatmodels` 的调用方 SHALL 改为调用 `GET /nodes/category/Chat Models`,返回内容与原接口一致(全部非 LlamaIndex 的 chat model 节点)。

#### Scenario: AI 生成 flow 时选择模型
- **WHEN** 用户打开 Agentflow v2 的"AI 生成 flow"对话框
- **THEN** 模型下拉列表通过节点类别接口加载,选项与裁剪前一致

#### Scenario: SDK 加载模型列表
- **WHEN** `packages/agentflow` SDK 的生成对话框加载可选模型
- **THEN** SDK 请求 `GET /nodes/category/Chat Models`,并得到非空的 chat model 列表

### Requirement: prompt 指令生成接口迁移到新路径
原 `POST /assistants/generate/instruction` SHALL 迁移到 `POST /agentflowv2-generator/instruction`,请求和响应格式保持不变。

#### Scenario: 在节点中用 AI 生成 prompt
- **WHEN** 用户在 v2 节点的 prompt 输入框中使用"生成指令"功能,并提交任务描述和所选模型
- **THEN** 系统调用 `POST /agentflowv2-generator/instruction`,返回生成的指令文本

### Requirement: SDK 依赖的接口保持可用
`packages/agentflow` SDK 调用的 `/chatflows`、`/nodes`、`/node-load-method`、`/node-config`、`/credentials`、`/components-credentials`、`/agentflowv2-generator` 接口 SHALL 保持现有路径和请求/响应格式。

#### Scenario: SDK 保存 flow
- **WHEN** SDK 用 API Key 调用 `POST /chatflows` 创建一个 AGENTFLOW flow,然后用 `PUT /chatflows/{id}` 更新它
- **THEN** 两次调用都成功,返回的 flow 数据与请求一致

### Requirement: 公开分享与 embed 接口保持可用
公开 chatbot 和 `flowise-embed` 依赖的 `/public-chatflows`、`/public-chatbotConfig`、`/prediction`、`/public-executions` 接口 SHALL 保持现有路径和行为。

#### Scenario: 通过 embed 与 v2 flow 对话
- **WHEN** 网页通过 `flowise-embed` 嵌入一个 AGENTFLOW flow,用户发送一条消息
- **THEN** 系统用流式方式返回 v2 引擎的执行结果

### Requirement: 移除被删模块的权限
RBAC 权限定义 SHALL 移除 `assistants:*`、`templates:*` 和 `chatflows:*` 权限。所有 v2 flow 相关接口 SHALL 以 `agentflows:*` 权限做访问控制。

#### Scenario: 角色编辑页的权限列表
- **WHEN** 管理员打开角色编辑页
- **THEN** 权限列表中没有 Assistants、Templates、Chatflows 这几个分类,Agentflows 分类保留

#### Scenario: 只有 agentflows 权限的用户访问 flow
- **WHEN** 一个只被授予 `agentflows:view` 的用户请求 `GET /chatflows`
- **THEN** 系统返回该用户工作区内的 AGENTFLOW flow 列表

### Requirement: API 文档与实际接口一致
`packages/api-documentation` 中的 swagger 定义 SHALL NOT 包含已移除的接口,并且 SHALL 包含迁移后的新接口。

#### Scenario: 查看 API 文档
- **WHEN** 开发者打开 API 文档页面
- **THEN** 文档中没有 Assistants、Marketplace、Vector Upsert 相关条目,并且有 `POST /agentflowv2-generator/instruction` 的条目
