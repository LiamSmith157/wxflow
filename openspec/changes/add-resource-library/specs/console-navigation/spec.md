# Spec Delta

## MODIFIED Requirements

### Requirement: 主菜单只包含保留模块

管理后台主菜单 SHALL 包含 Agentflows、Executions、Tools、Credentials、Variables、API Keys、Document Stores、Channel Instances、Resources,以及 Evaluations、管理和其他分组中原有的条目;SHALL NOT 包含 Chatflows、Assistants、Marketplaces。菜单条目的标题 SHALL 以当前界面语言显示,切换语言不改变条目的集合、顺序与链接。

#### Scenario: 登录后查看菜单

-   **WHEN** 拥有全部权限的用户登录管理后台
-   **THEN** 侧边菜单中有 Agentflows、Channel Instances 和 Resources,没有 Chatflows、Assistants、Marketplaces

#### Scenario: 切换语言后查看菜单

-   **WHEN** 用户把界面语言从 `en` 切换为 `zh-CN`
-   **THEN** 侧边菜单与分组标题立即显示为中文,条目的数量、顺序和跳转链接与英文时完全一致

#### Scenario: 没有渠道实例权限

-   **WHEN** 没有 `channelInstances:view` 权限的用户登录管理后台
-   **THEN** 侧边菜单中不显示 Channel Instances

#### Scenario: 没有资源库权限

-   **WHEN** 没有 `resources:view` 权限的用户登录管理后台
-   **THEN** 侧边菜单中不显示 Resources
