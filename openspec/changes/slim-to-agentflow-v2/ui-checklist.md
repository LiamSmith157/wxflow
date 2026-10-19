# UI 人工验收清单

阶段 6 改动了大量界面代码。构建、lint、单元测试和后端冒烟都通过了,但这台机器没有浏览器,下面这些需要在浏览器里点一遍。每一项对应 `specs/console-navigation/spec.md` 的场景,或是本阶段改过的地方。

启动方式见 `baseline.md` 的"运行方式"。登录后按顺序检查。

## 菜单与路由

-   [ ] 侧边菜单里有 Agentflows、Executions、Tools、Credentials、Variables、API Keys、Document Stores;**没有** Chatflows、Assistants、Marketplaces
-   [ ] 登录后(或访问 `/`)直接看到 Agentflows 列表
-   [ ] 浏览器地址栏输入 `/chatflows`、`/marketplaces`、`/assistants`、`/canvas`、`/agentcanvas`:页面不渲染任何已删除的功能,表现和访问任意不存在的路径一致
-   [ ] 左上角 logo 点击后回到 Agentflows

## Agentflows 列表页

-   [ ] 页面上**没有** V1/V2 切换按钮,也没有"V1 已废弃"的提示条
-   [ ] 点 Add New 进入 `/v2/agentcanvas`
-   [ ] 卡片视图和列表视图都能切换,点击某个 flow 进入 `/v2/agentcanvas/<id>`
-   [ ] 列表视图每行的"..."菜单里**没有** Save As Template;有重命名、Starter Prompts、Feedback、Allowed Domains、Speech To Text、复制、导出、删除
-   [ ] 菜单里的"复制"会在新标签页打开 `/v2/agentcanvas`

## v2 画布

-   [ ] 节点面板(左上角 +)只列出 Agent Flows 节点,没有 LangChain / LlamaIndex / Utilities 页签
-   [ ] 右上角设置菜单里**没有** Save As Template 和 Upsert History;有 View Messages、View Leads、Configuration、复制、导入、导出、删除
-   [ ] 点 `</>`(API)打开 API 代码对话框,能切换 Embed / Python / JavaScript / cURL / Share Chatbot
-   [ ] 保存新 flow、再次保存、重命名都正常
-   [ ] 聊天面板能发消息;文件上传按钮只在开启了"文件上传"配置时出现
-   [ ] View Messages 里删除消息的确认框里**没有** "Remove messages from 3rd party Memory Node" 勾选框
-   [ ] 画布里代码编辑器放大后,点"Execute"能运行 JS 并显示结果

## 其他页面

-   [ ] Tools:打开某个自定义工具的编辑框,没有 Save As Template 按钮,也没有 Use Template 模式
-   [ ] Document Stores:详情页里"被哪些 flow 使用"的标签点击后进入 `/v2/agentcanvas/<id>`;Upsert 历史侧边栏能打开
-   [ ] 设置 → 角色:新建/编辑角色时权限列表里**没有** Chatflows、Assistants、Templates 三个分类
-   [ ] API Keys:新建 Key 时权限列表同上
-   [ ] Executions:列表和详情正常;详情里如果有文件附件,点击能下载
-   [ ] 公开分享链接(Share Chatbot 里的链接)能打开聊天页

## 评估(需要 enterprise 许可才有入口)

-   [ ] 新建评估时,"选择要评估的 flows"下拉里只有 Agentflows,没有类型勾选框,也没有重复条目
-   [ ] 评估结果页里 flow 名称的链接指向 `/v2/agentcanvas/<id>`
