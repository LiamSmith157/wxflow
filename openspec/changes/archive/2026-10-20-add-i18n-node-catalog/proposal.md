## Why

管理后台界面已支持简体中文,但画布节点列表、节点参数表单、文档库的加载器/向量库配置里显示的节点名称、描述、参数名、占位符和下拉选项,都来自 `packages/components` 的节点定义并经 API 原样返回,仍然是英文。这些是用户配置流程时最常看的文案,中文界面里夹着大量英文,体验不完整。

## What Changes

-   从已构建的 `packages/components/dist/nodes` 抽取节点目录文案的脚本,输出去重后的英文清单(当前约 2828 条:节点名 186、节点描述 176、参数名 734、参数描述 597、占位符 187、选项名 902、选项描述 73)。
-   在 `packages/ui` 新增 `nodes` 命名空间(`locales/{en,zh-CN}/nodes.json`),以英文原文为 key;新增 `tn()` 与配套 hook,在渲染处翻译节点名、描述、参数名、参数描述、占位符、选项名和选项描述,缺失时回退英文原文。
-   在节点列表(`AddNodes`)、节点参数表单(`NodeInputHandler`、`DocStoreInputHandler`、`ArrayRenderer`、下拉组件)和文档库相关配置页接入 `tn()`。只翻译显示文本,不改变节点的 `name`、选项 `name`(取值)和保存到流程里的数据。
-   分两批提供中文:第一批为节点名、节点描述、参数名和常用下拉选项(约 1000 条);第二批为参数描述与占位符。品牌名、模型名、协议名、代码标识保持英文。术语沿用 `common` 命名空间已有的词表,不单独做产品评审。
-   新增 key 覆盖与回退测试;提供可重复运行的覆盖率报告,显示每类文案已翻译的比例。
-   不在范围内:`packages/components`、`packages/server` 与 `packages/agentflow` 的代码;agentflow 画布库内部界面;服务端返回的错误消息;其他语言。

## Capabilities

### New Capabilities

-   `console-node-i18n`: 节点目录文案(节点名称与描述、参数名称/描述/占位符、下拉选项名称/描述)按界面语言显示,翻译缺失时回退英文,且不影响节点数据与已保存的流程。

### Modified Capabilities

(无;`console-i18n` 与 `console-navigation` 属于尚未归档的 `add-i18n-zh-cn`,本 change 不修改它们的要求。)

## Impact

-   代码:`packages/ui/src/i18n/`(新增 `nodes.js` helper 与 `locales/*/nodes.json`)、`views/agentflowsv2/AddNodes.jsx`、`ui-component/input-handlers/NodeInputHandler.jsx`、`views/docstore/DocStoreInputHandler.jsx`、`ui-component/array/ArrayRenderer.jsx`、`ui-component/dropdown/*`,以及抽取与覆盖率脚本。
-   依赖:无新增。
-   其他包与 API:无变化;节点定义、server 响应和已保存的流程数据不受影响。
-   体积:`nodes.json` 约 2800 条,每种语言预计几百 KB 以内;随主包静态打包,必要时可改为按需加载。
-   前置:本 change 依赖 `add-i18n-zh-cn` 提供的 i18n 基础设施(同一分支 `feat/i18n-zh-cn` 之上)。
