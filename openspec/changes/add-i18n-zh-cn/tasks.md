# Tasks

## 1. i18n 基础设施

-   [x] 1.1 在 `packages/ui` 添加 `i18next`、`react-i18next`、`i18next-browser-languagedetector` 依赖,验证 `pnpm install` 成功且 lockfile 已更新
-   [x] 1.2 新增 `src/i18n/index.js` 与 `locales/{en,zh-CN}/common.json`、`menu.json`:配置 `supportedLngs`、`fallbackLng: 'en'`、detector 顺序(localStorage → navigator)、`zh*` 映射到 `zh-CN`;编写 jest 单测,验证浏览器为 `zh-CN`/`zh-Hans`/`fr` 时分别得到 `zh-CN`/`zh-CN`/`en`,手动选择优先于浏览器语言,缺 key 回退英文
-   [x] 1.3 在 `index.jsx` 接入 i18n 初始化,在 `App.jsx` 按当前语言给 `createTheme` 传入 `zhCN` locale 并设置 `document.documentElement.lang`;验证切换语言后 MUI 分页文案变化(单测或手动检查)
-   [x] 1.4 新增 `Header/LanguageSwitcher` 下拉组件(English / 简体中文)并放入顶栏;验证切换即时生效、刷新后保持、当前语言处于选中状态(组件测试)

## 2. 导航与布局外壳

-   [x] 2.1 将 `menu-items/dashboard.js`、`agentsettings.js` 的 `title` 改为 i18n key,补全 `menu` 命名空间的中英文条目;验证菜单条目数量、顺序、`url` 与改动前一致(对比测试)
-   [x] 2.2 修改 `NavItem`、`NavGroup`、`NavCollapse` 与 `views/settings/index.jsx` 在渲染处翻译标题,空标题保持不渲染;验证中英文切换时侧边菜单立即更新(组件测试)
-   [x] 2.3 迁移 `layout/*`(顶栏、`ProfileSection`、`WorkspaceSwitcher`、面包屑、`ViewHeader`、公告栏)的文案;验证中文下这些区域无遗留英文
-   [x] 2.4 在 `common` 命名空间确定术语表并给出初版中文(Agentflow 保留英文,其余如 Credential、Variable、Document Store 等),在 PR 中列出供评审

## 3. 通用组件

-   [x] 3.1 迁移 `ui-component` 中的对话框、确认框 `ConfirmContextProvider`、空状态、表格表头/分页自定义文案;验证删除确认等含动态名称的文案使用插值整句翻译
-   [x] 3.2 迁移 snackbar 及 `utils/*` 中非组件代码的提示文案,使用 `i18n.t`;验证切换语言后新弹出的提示为当前语言
-   [x] 3.3 迁移表单类通用组件(输入框 label/placeholder、JSON/代码编辑器工具栏、文件上传提示等);验证对应组件无遗留硬编码英文(`rg` 检查)

## 4. 业务模块迁移(每个模块独立合入,缺 key 回退英文)

-   [x] 4.1 迁移 `views/agentflows` 与 `views/agentflowsv2` 中画布外的页面文案(列表、操作菜单、保存/配置对话框);验证列表页与新建流程在中文下完整可用,画布库内部界面仍为英文
-   [x] 4.2 迁移 `views/agentexecutions` 与 `views/chatmessage`、`views/chatbot`;验证执行列表、详情与聊天面板文案
-   [x] 4.3 迁移 `views/credentials`、`views/variables`、`views/apikey`、`views/tools`;验证各列表与新增/编辑对话框文案
-   [x] 4.4 迁移 `views/docstore`、`views/vectorstore`、`views/files`;验证文档库各步骤页面文案
-   [x] 4.5 迁移 `views/evaluations`、`views/evaluators`、`views/datasets`;验证创建评估对话框与结果页文案
-   [x] 4.6 迁移 `views/users`、`views/roles`、`views/workspace`、`views/organization`、`views/account`、`views/auth`;验证登录、注册、权限相关页面文案
-   [x] 4.7 迁移 `views/settings`、`views/serverlogs`、`views/schedule`、`views/webhooklistener`;验证各页面文案

## 5. 收尾与集成验证

-   [x] 5.1 编写 key 一致性检查脚本(或 jest 用例),验证 `en` 与 `zh-CN` 的每个命名空间 key 集合一致且无空值,并接入 `pnpm test`
-   [x] 5.2 用 `rg` 扫描 `packages/ui/src` 的 JSX 文本节点及 `label`/`placeholder`/`title`/`aria-label` 属性中遗留的硬编码英文,逐项处理或记录为范围外;输出清单
-   [x] 5.3 运行 `pnpm --filter flowise-ui test` 与 `pnpm build`(或对应 ui 构建命令),验证全部通过;在浏览器中以 `zh-CN`、`en` 各走一遍登录 → Agentflows 列表 → 新建 → 凭证 → 评估,确认语言切换与回退行为符合 specs
-   [x] 5.4 更新 `packages/ui/README.md`(及 `README-ZH.md`)说明新增语言与添加翻译的方法,验证文档中的步骤可按原样执行

## Workflow follow-up

-   评审通过后归档本 change,并把 `console-i18n` 同步为主 spec。
-   后续另立 change:为 `packages/agentflow` 增加 locale 接口、评估是否翻译节点目录文案。
