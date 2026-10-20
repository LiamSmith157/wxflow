## Why

管理后台(`packages/ui`)的所有文案都硬编码为英文,没有任何 i18n 基础设施,中文用户只能使用英文界面。现在要加入简体中文支持,并建立一套可持续扩展的多语言机制,让后续新增语言或新增页面时有统一的做法。

## What Changes

-   在 `packages/ui` 引入 `react-i18next` 与 `i18next-browser-languagedetector`,新增 `src/i18n/`(初始化代码 + `en` / `zh-CN` 两套按模块划分的命名空间资源)。
-   支持 `en` 与 `zh-CN` 两种界面语言:首次访问默认跟随浏览器语言,无匹配时回退 `en`;用户选择的语言保存在 localStorage,刷新后保持。
-   在顶栏增加语言切换下拉菜单,切换后无需刷新页面即时生效。
-   MUI 主题按当前语言注入 `zhCN` locale,使分页等 MUI 内置文案同步变为中文。
-   `menu-items/*.js` 中的菜单标题改为存放 i18n key,在渲染处(`NavItem` / `NavGroup` / `NavCollapse`)翻译。
-   文案迁移分批进行:先基础设施、布局、导航与通用组件(弹窗、确认框、snackbar、表格),再逐个 `views/*` 模块;拼接字符串改用 `t()` 的插值写法;缺失的 key 回退到英文,因此迁移中途的状态可用。
-   不在范围内:`packages/agentflow` 画布库、`packages/components` 节点目录文案、`packages/server` 返回的错误消息、繁体中文及其他语言、仓库根 `i18n/` 下的文档翻译。

## Capabilities

### New Capabilities

-   `console-i18n`: 管理后台的界面多语言机制,包括支持的语言、语言检测与持久化、顶栏切换入口、缺失翻译的回退、MUI 内置组件的本地化。

### Modified Capabilities

-   `console-navigation`: 侧边菜单标题需要随当前界面语言显示,菜单条目的集合与顺序保持不变。

## Impact

-   代码:`packages/ui/src/index.jsx`、`App.jsx`、`themes/index.js`、`layout/MainLayout/Header`、`layout/MainLayout/Sidebar/MenuList/*`、`menu-items/*`,以及 `ui-component/*` 与 `views/*` 下约 260 个 `.jsx` 中的硬编码文案。
-   依赖:`packages/ui` 新增 `i18next`、`react-i18next`、`i18next-browser-languagedetector`。
-   其他包与 API:无变化;server、components、agentflow 的行为不受影响。画布页(`views/agentflowsv2/Canvas.jsx` 内嵌的 agentflow 库界面)仍为英文,属已知的不完整本地化。
-   测试:涉及渲染文案的现有 UI 测试需要在英文语言下继续通过;新增语言切换与回退的测试。
