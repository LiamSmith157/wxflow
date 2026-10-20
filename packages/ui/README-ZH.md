<!-- markdownlint-disable MD030 -->

# 流程界面

[English](./README.md) | 中文

wxflow 的 React 前端界面。

安装：

```bash
npm i wxflow-ui
```

## 国际化 (i18n)

控制台支持 **英文 (`en`)** 和 **简体中文 (`zh-CN`)**。初始语言跟随浏览器(非中文一律回退英文);在顶栏语言下拉菜单中选择的语言会保存在 `localStorage` 的 `lang` 键中。

翻译文件位于 `src/i18n/locales/<语言>/<命名空间>.json`,每个功能区一个命名空间(`common`、`menu`、`layout`、`components`、`agentflows`、`credentials` 等)。缺失的翻译会回退到英文。

在组件中新增或修改文案:

```jsx
import { useTranslation } from 'react-i18next'

const MyView = ({ name }) => {
    const { t } = useTranslation('credentials') // 当前功能区的命名空间
    return <Button>{t('common:save')}</Button> // `ns:key` 可读取其他命名空间
    // 动态内容请使用插值,不要拼接字符串:
    // t('deleteConfirm', { name })  ->  "确定删除 {{name}} 吗?"
}
```

新增语言或命名空间:

1. 创建 `src/i18n/locales/<语言>/<命名空间>.json`(各语言的 key 和 `{{占位符}}` 必须保持一致)。
2. 在 `src/i18n/index.js` 的 `resources` 中注册文件,并把语言加入 `SUPPORTED_LANGUAGES`。
3. 运行 `pnpm test`:`src/i18n/i18n.test.js` 会检查各语言的 key 与占位符是否一致,`src/i18n/keys.test.js` 会检查源码中使用的 key 是否都存在。

注意:

-   模块级配置(服务商表单、标签页列表等)在加载时无法调用 `t`。请在配置中保留英文文案,并在渲染处用 `useTranslatedConfig(config)` 或 `td(text)` 翻译(词条放在 `dynamic` 命名空间中,以英文原文为 key)。
-   agentflow 画布库和服务端错误消息不在翻译范围内。

### 节点目录文案

节点名称、描述、参数名/描述/占位符和下拉选项来自 `packages/components`,由 API 返回。它们在渲染时通过 `useNodeT()`(`src/i18n/nodes.js`)提供的 `tNode(text)` 翻译:以英文原文为 key 在 `nodes` 命名空间中查找,找不到就显示英文原文。只有显示文本经过它,节点的 `name` 和选项取值不会被翻译。

节点定义变化后更新翻译(先构建 `packages/components`):

```bash
pnpm --filter wxflow-ui i18n:nodes-coverage -- --list   # 列出未翻译的文案和多余的 key
pnpm --filter wxflow-ui i18n:extract-nodes out.json     # 导出带类别的英文文案全集
```

把译文加入 `src/i18n/locales/zh-CN/nodes.json`(`"English text": "中文"`,`en/nodes.json` 保持为空)。需要保持英文的品牌名和标识符记在 `scripts/node-keep-english.json`。CI 中可加 `--strict`,有未翻译或多余条目时失败。

## 许可证

本仓库中的源代码在[Apache License Version 2.0 许可证](../../LICENSE.md)下提供。
