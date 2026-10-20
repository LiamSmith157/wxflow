# Tasks

## 1. 抽取与覆盖率工具

-   [x] 1.1 新增 `packages/ui/scripts/extract-node-strings.js`:实例化 `packages/components/dist/nodes` 下全部节点,按类别输出去重后的英文清单;验证运行后得到约 2828 条、189 个节点无加载失败,并且结果可重复
-   [x] 1.2 在抽取脚本里标出应保持英文的候选(品牌/模型名/代码标识)和含 HTML/链接的描述;验证清单中这些条目有标记
-   [x] 1.3 新增 `nodes-coverage` 脚本:对比清单与 `locales/zh-CN/nodes.json`,输出各类别覆盖率和多余条目;验证对手工构造的缺失/多余条目能正确报告

## 2. 运行时基础设施

-   [x] 2.1 在 `i18n/index.js` 注册 `nodes` 命名空间,新增 `i18n/nodes.js`(`tn`、`useNodeT`)并创建空的 `locales/{en,zh-CN}/nodes.json`;单测验证有译文时返回译文,缺失时返回原文,切换语言后结果随之变化
-   [x] 2.2 调整现有 key 一致性测试,对 `nodes` 命名空间允许 `zh-CN` 只收录已翻译的子集,并校验无空值;验证 `pnpm --filter flowise-ui test` 通过

## 3. 渲染处接入

-   [x] 3.1 `AddNodes.jsx`:节点名、描述、分类名接入 `tn`,搜索同时匹配英文原文与译文;组件测试验证中文下显示译文、搜索两种语言都命中、节点数量与顺序不变
-   [x] 3.2 `NodeInputHandler.jsx`、`DocStoreInputHandler.jsx`、`ArrayRenderer.jsx`:参数名、描述、占位符接入 `tn`;组件测试验证中文显示与缺失回退
-   [x] 3.3 `ui-component/dropdown/*` 与相关选择器:选项名与选项描述接入 `tn`,核对没有用 `label` 做取值或比较;测试验证中文下选择选项后保存的值与英文一致
-   [x] 3.4 文档库相关页面(加载器、切分器、向量库、embedding 的选择与配置)接入 `tn`;人工在中文下走一遍文档库配置流程,确认无空白或 key 泄露

## 4. 第一批翻译(节点名、节点描述、参数名、常用下拉选项,约 1000 条)

-   [x] 4.1 生成 `nodes.json` 初稿:先翻译 186 个节点名和 176 条节点描述,沿用 `common` 的术语表,品牌名保持英文;验证覆盖率报告中这两类达到 100%(豁免除外)
-   [x] 4.2 翻译 734 条参数名;验证覆盖率达到 100%(豁免除外),`en` 与 `zh-CN` 的 key 集合符合 2.2 的规则
-   [x] 4.3 翻译常用下拉选项名称(出现在 Agent、LLM、Condition、Tool、Retriever 等 Agentflow v2 节点以及文档库组件中的选项);验证这些节点的选项在中文下无遗留英文
-   [x] 4.4 浏览器验证:用 `zh-CN`/`en` 各走一遍添加节点 → 配置 Agent/LLM 节点 → 文档库添加加载器,确认文案、搜索、保存与重新打开流程均符合 specs

## 5. 第二批翻译与收尾

-   [x] 5.1 翻译 597 条参数描述与 187 条占位符,保留描述中的标记原样;验证覆盖率报告中这两类达到 100%(豁免除外),并抽查含 HTML/链接的描述渲染正常
-   [x] 5.2 翻译其余选项名称(902 条中剩余部分)与 73 条选项描述;验证覆盖率报告总覆盖率(扣除豁免)达到 100%
-   [x] 5.3 运行 `pnpm --filter flowise-ui test`、`eslint` 与 `pnpm build`,记录构建后体积变化;验证全部通过,若体积增长明显则评估按需加载
-   [x] 5.4 在 `packages/ui/README.md` 与 `README-ZH.md` 补充节点文案翻译的维护方法(运行抽取、覆盖率脚本、更新 `nodes.json`);验证文档中的命令可按原样执行

## Workflow follow-up

-   评审通过后归档本 change,并把 `console-node-i18n` 同步为主 spec。
