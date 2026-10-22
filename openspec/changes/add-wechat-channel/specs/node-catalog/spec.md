# Spec Delta

## MODIFIED Requirements

### Requirement: 提供全部 Agentflow v2 节点

节点注册表 SHALL 提供全部 Agentflow v2 节点:Start、Agent、LLM、Condition、Condition Agent、Direct Reply、Custom Function、Execute Flow、HTTP、Human Input、Iteration、Loop、Retriever、Tool、Sticky Note,以及新增的通用节点 Cooldown、Delay、Talker Filter。

#### Scenario: 列出节点

-   **WHEN** 客户端请求节点列表
-   **THEN** 返回结果包含上述每个 Agentflow v2 节点;除 Start 节点的输入类型新增 `WeChat Event` 及其相关参数外,裁剪前已有节点的输入定义与裁剪前一致

## ADDED Requirements

### Requirement: 提供 WeChat 类别的节点

节点注册表 SHALL 提供 `WeChat` 类别的节点:Message Type Router、Send Text、Send Image、Send File、Send Video、Send @Mention、Send Link Card、Quote Reply、Search Contacts、Fetch Image、Fetch Voice。

#### Scenario: 按类别列出

-   **WHEN** 客户端请求 `WeChat` 类别的节点
-   **THEN** 返回结果恰好包含上述 11 个节点

#### Scenario: 不移植已有等价物的节点

-   **WHEN** 客户端请求节点列表
-   **THEN** 返回结果中没有与 Condition、HTTP、Agent、LLM 功能重复的微信专用版本

### Requirement: 节点面板按分组显示

Agentflow 画布的节点面板 SHALL 按 `Agent Flows`、`WeChat` 的顺序分组显示节点,每组可以单独展开和收起;分组标题 SHALL 以当前界面语言显示。搜索时 SHALL 在两个分组中查找,结果仍按分组显示。其他类别的节点 SHALL NOT 出现在面板中。

#### Scenario: 打开节点面板

-   **WHEN** 用户在 Agentflow 画布上打开添加节点面板
-   **THEN** 面板先显示 `Agent Flows` 分组,再显示 `WeChat` 分组

#### Scenario: 搜索微信节点

-   **WHEN** 用户在面板中搜索 "send" 或"发送"
-   **THEN** 结果中出现 `WeChat` 分组下的发送类节点

#### Scenario: 拖入画布

-   **WHEN** 用户把 Send Text 从面板拖到画布
-   **THEN** 画布上出现带微信图标的 Send Text 节点,可以与其他节点连线
