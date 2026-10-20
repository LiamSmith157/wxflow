# Design

## Context

`packages/ui` 是 React 18 + MUI 5 + redux + react-router 的 vite 应用,约 260 个 `.jsx`,文案全部硬编码为英文,没有任何 i18n 基础设施。已知的特殊点:

-   `menu-items/dashboard.js`、`agentsettings.js` 是模块级常量,标题是字符串,由 `Sidebar/MenuList/*`(`NavGroup`、`NavItem`、`NavCollapse`)渲染;`views/settings/index.jsx` 也消费 `menu-items`。
-   `App.jsx` 通过 `ThemeProvider theme={themes(customization)}` 提供主题,`customization` 来自 redux。
-   提示统一走 notistack 的 `enqueueSnackbar`(约 73 个文件),确认框走 `ConfirmContextProvider`。
-   测试框架是 jest(`packages/ui` 已有少量工具函数测试,无组件渲染测试基础)。
-   `agentflow` 画布库独立发布,不依赖 `ui`;server 与 components 的文案不在本期范围。动机与范围见 proposal.md。

## Goals / Non-Goals

**Goals:**

-   提供 `en` + `zh-CN` 的运行时切换,顶栏下拉入口,偏好持久化。
-   迁移可以分批、可以中途停止:任何时刻未迁移的文案仍显示英文,应用可用。
-   每个 view 迁移只改自己的资源文件,多人并行迁移时不产生冲突。

**Non-Goals:**

-   不翻译 agentflow 画布库、节点目录、服务端错误消息。
-   不做 RTL、复数规则复杂的语言、日期/数字的自定义格式化(沿用现有实现)。
-   不引入翻译管理平台或自动抽取流水线。

## Decisions

### 1. 使用 react-i18next + i18next-browser-languagedetector

React/MUI 生态里使用最广、文档最全,支持命名空间、插值、回退与运行时切换。

备选:`react-intl`(ICU 语法更强,但接入 JSX 的写法更重,且命名空间/懒加载需自行组织);自研轻量 `t()`(省依赖,但要自己处理插值、回退、变更订阅,收益不大)。

### 2. 资源文件按模块拆成命名空间,静态打包

目录:`src/i18n/index.js`(初始化)与 `src/i18n/locales/{en,zh-CN}/<namespace>.json`,命名空间如 `common`、`menu`、`agents`、`credentials`……。

-   JSON 随主 bundle 静态引入,不做按需网络加载。两种语言、体量小,避免首屏出现 key 闪烁与额外请求。
-   `fallbackLng: 'en'`,`defaultNS: 'common'`。每个 view 用 `useTranslation('<ns>')`,通用词(Save、Cancel、Delete)放 `common`。
-   key 用点分层的语义名(`list.empty`、`dialog.deleteConfirm`),不使用英文原句作 key,避免改文案导致 key 失效。

备选:单个大 JSON(并行迁移时必然冲突,且难以审阅)。

### 3. 语言检测与持久化

detector 顺序 `localStorage → navigator`,缓存到 localStorage 的 `lang` 键。`supportedLngs: ['en', 'zh-CN']`,并设置 `load: 'currentOnly'` 与 `nonExplicitSupportedLngs`,让 `zh`、`zh-Hans`、`zh-SG` 等映射为 `zh-CN`,其他语言落到 `en`。

### 4. 顶栏下拉与 MUI locale 联动

在 `layout/MainLayout/Header` 新增 `LanguageSwitcher`(放在 `ProfileSection` 旁),调用 `i18n.changeLanguage`。`App.jsx` 订阅当前语言(`useTranslation` 的 `i18n.language`),把 `zhCN`(`@mui/material/locale`)作为 `createTheme` 的第二个参数传入,语言变化时重建主题;同时设置 `document.documentElement.lang`。

### 5. 菜单存 key,渲染处翻译

`menu-items/*.js` 保持模块级常量,但 `title` 改为 i18n key(如 `menu:agentflows`);`NavItem`、`NavGroup`、`NavCollapse` 与 `views/settings` 在渲染时 `t(item.title)`。这样常量无需感知语言,切换时由组件重渲染完成。空标题(分组无标题)保持不渲染。

备选:把菜单做成函数 `getMenuItems(t)`——每次渲染都要重建对象,且改动所有消费方的调用方式。

### 6. 非组件代码中的文案

snackbar、`utils/*` 中的提示等不在组件体内的代码,直接使用 `import i18n from '@/i18n'` 的 `i18n.t(...)`。在组件内始终优先 `useTranslation`,以便语言切换时重渲染。

### 7. 迁移顺序与回退

1. 基础设施:依赖、`src/i18n`、`index.jsx` 接入、主题联动、`LanguageSwitcher`。
2. 外壳:`layout/*`、`menu-items`、`ui-component` 中的通用组件(对话框、确认框、表格、空状态、分页、snackbar)。
3. 逐个 `views/*` 模块(agentflows、agentexecutions、credentials、tools、variables、apikey、docstore、evaluations/evaluators/datasets、users/roles/workspace/organization/account、settings、auth、chatbot、serverlogs、schedule、webhooklistener 等)。
4. 清点:用脚本/`rg` 检查遗留的硬编码英文,对照两套 JSON 的 key 一致性。

缺 key 回退英文,所以步骤 3 可按模块分多次合入。

## Risks / Trade-offs

-   [约 260 个文件逐个改动,易遗漏] → 按模块分批并在 tasks 中逐模块勾选;最后用 `rg` 扫描 JSX 文本节点与常见 props(`label`、`placeholder`、`title`)作为查漏。
-   [翻译质量参差、术语不统一(Agentflow、Credential、Variable 等)] → 在 `common`/`glossary` 中先统一术语表,中文评审后再批量翻译;产品名 Agentflow 保留英文。
-   [模块级常量里的文案(菜单、表格列定义、选项数组)在模块加载时求值,不会随语言变化] → 约定常量里存 key 或使用 `i18n.t` 惰性函数,迁移时逐个检查此类写法。
-   [拼接字符串在中文下语序不通] → 一律整句 + 插值,review 时重点检查含 `+` 或模板字符串的 JSX 文本。
-   [画布页仍是英文,体验上"半中半英"] → 已在 proposal 与 spec 中声明为已知范围外内容,后续另立 change 处理 agentflow 库的 locale 接口。
-   [包体积增长] → 两种语言的 JSON 总量很小;`@mui/material/locale` 只引入 `zhCN`。

## Migration Plan

前端纯增量变更,无数据迁移。回滚即回退提交;语言偏好只存在浏览器 localStorage(`lang` 键),回退后该键被忽略,无副作用。未迁移完成就合入也是安全的(回退英文)。

## Open Questions

-   术语表(如 Credential 译为"凭证"、Variable 译为"变量"、Document Store 译为"文档库")需要产品侧评审;可在迁移 `common` 命名空间时一并确认,不影响 spec 与任务拆分。
