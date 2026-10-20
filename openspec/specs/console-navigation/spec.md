# console-navigation Specification

## Purpose

定义管理后台向用户暴露的菜单、页面路由和操作入口,确保用户只能看到并进入 Agentflow v2 及保留模块,不会遇到已删除功能的残留入口。

## Requirements

### Requirement: 主菜单只包含保留模块

管理后台主菜单 SHALL 包含 Agentflows、Executions、Tools、Credentials、Variables、API Keys、Document Stores,以及 Evaluations、管理和其他分组中原有的条目;SHALL NOT 包含 Chatflows、Assistants、Marketplaces。菜单条目的标题 SHALL 以当前界面语言显示,切换语言不改变条目的集合、顺序与链接。

#### Scenario: 登录后查看菜单

-   **WHEN** 拥有全部权限的用户登录管理后台
-   **THEN** 侧边菜单中有 Agentflows,没有 Chatflows、Assistants、Marketplaces

#### Scenario: 切换语言后查看菜单

-   **WHEN** 用户把界面语言从 `en` 切换为 `zh-CN`
-   **THEN** 侧边菜单与分组标题立即显示为中文,条目的数量、顺序和跳转链接与英文时完全一致

### Requirement: 默认落地页是 Agentflows 列表

访问根路径时,系统 SHALL 按保留模块的顺序展示用户第一个有权限访问的页面,Agentflows 列表排在第一位。

#### Scenario: 有 agentflows 权限的用户访问根路径

-   **WHEN** 有 `agentflows:view` 权限的用户访问 `/`
-   **THEN** 页面展示 Agentflows 列表

#### Scenario: 没有 agentflows 权限的用户访问根路径

-   **WHEN** 一个没有 `agentflows:view`、但有 `executions:view` 权限的用户访问 `/`
-   **THEN** 页面展示 Executions 列表

### Requirement: Agentflows 列表页只展示 v2

Agentflows 列表页 SHALL 只展示 AGENTFLOW 类型的 flow,SHALL NOT 提供 v1/v2 版本切换,也不显示 v1 废弃提示。新建按钮 SHALL 打开 v2 画布。

#### Scenario: 打开 Agentflows 列表页

-   **WHEN** 用户打开 `/agentflows`
-   **THEN** 页面列出 AGENTFLOW flow,没有 V1/V2 切换控件

#### Scenario: 新建 flow

-   **WHEN** 用户在 Agentflows 列表页点击新建
-   **THEN** 页面跳转到 `/v2/agentcanvas`

### Requirement: 已删除页面的路由不可访问

管理后台 SHALL NOT 提供 `/chatflows`、`/canvas`、`/canvas/:id`、`/agentcanvas`、`/agentcanvas/:id`、`/assistants`、`/marketplaces`、`/marketplace/:id`、`/v2/marketplace/:id` 这些路由。访问它们时 SHALL 显示与其他未知路由相同的结果。

#### Scenario: 直接访问已删除的路由

-   **WHEN** 用户在浏览器地址栏输入 `/chatflows` 或 `/marketplaces`
-   **THEN** 页面不渲染任何已删除的功能,表现与访问其他不存在的路径一致

### Requirement: v2 画布没有模板相关入口

v2 画布及 flow 列表的操作菜单 SHALL NOT 提供"保存为模板"、"从模板市场打开"等与模板相关的入口。

#### Scenario: 打开 flow 操作菜单

-   **WHEN** 用户在 Agentflows 列表中打开某个 flow 的操作菜单
-   **THEN** 菜单中没有与模板相关的选项

#### Scenario: 打开 v2 画布顶部菜单

-   **WHEN** 用户在 v2 画布中打开顶部的设置菜单
-   **THEN** 菜单中没有与模板相关的选项

### Requirement: Tools 页面没有模板导出入口

Tools 页面的工具编辑对话框 SHALL NOT 提供"导出为模板"入口。

#### Scenario: 编辑自定义工具

-   **WHEN** 用户打开一个自定义工具的编辑对话框
-   **THEN** 对话框中没有导出为模板的按钮

### Requirement: Evaluations 只能选择 v2 flow

创建评估时,评估对象 SHALL 只能选择 AGENTFLOW flow,SHALL NOT 提供 Chatflow 或 Custom Assistant 作为选项。

#### Scenario: 创建评估

-   **WHEN** 用户打开创建评估对话框并选择评估对象
-   **THEN** 可选的对象只有 AGENTFLOW flow

### Requirement: 聊天面板不提供 RAG 文件上传

v2 的聊天调试面板和公开 chatbot SHALL NOT 提供"上传到向量库"类型(RAG)的文件上传;v2 支持的图片和完整文件上传 SHALL 保持可用。

#### Scenario: 在聊天面板上传文件

-   **WHEN** 用户在一个开启了文件上传的 v2 flow 的聊天面板中上传文件
-   **THEN** 文件按 v2 的完整文件上传处理,不会调用向量 upsert 接口
