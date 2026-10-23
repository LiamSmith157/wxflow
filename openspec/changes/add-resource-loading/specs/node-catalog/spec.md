# Spec Delta

## MODIFIED Requirements

### Requirement: 提供全部 Agentflow v2 节点

节点注册表 SHALL 提供全部 Agentflow v2 节点:Start、Agent、LLM、Condition、Condition Agent、Direct Reply、Custom Function、Execute Flow、HTTP、Human Input、Iteration、Loop、Retriever、Tool、Sticky Note,以及新增的通用节点 Cooldown、Delay、Talker Filter、Load Resource。

#### Scenario: 列出节点

-   **WHEN** 客户端请求节点列表
-   **THEN** 返回结果包含上述每个 Agentflow v2 节点;除 Start 节点的输入类型新增 `WeChat Event` 及其相关参数、LLM 和 Agent 节点新增"附加资源"参数外,裁剪前已有节点的输入定义与裁剪前一致

#### Scenario: Load Resource 在 Agent Flows 分组

-   **WHEN** 用户在 Agentflow 画布上打开添加节点面板
-   **THEN** Load Resource 出现在 `Agent Flows` 分组中
