<!-- markdownlint-disable MD030 -->

# wxflow UI

English | [中文](./README-ZH.md)

React frontend ui for wxflow.

Install:

```bash
npm i wxflow-ui
```

## Internationalization (i18n)

The console supports **English (`en`)** and **Simplified Chinese (`zh-CN`)**. The initial language follows the browser (anything that is not Chinese falls back to English); the choice made in the language dropdown of the top bar is saved in `localStorage` under the `lang` key.

Translations live in `src/i18n/locales/<language>/<namespace>.json`, one namespace per area (`common`, `menu`, `layout`, `components`, `agentflows`, `credentials`, ...). A missing translation falls back to English.

Add or change text in a component:

```jsx
import { useTranslation } from 'react-i18next'

const MyView = ({ name }) => {
    const { t } = useTranslation('credentials') // namespace of the area
    return <Button>{t('common:save')}</Button> // `ns:key` reads another namespace
    // dynamic values use interpolation, never string concatenation:
    // t('deleteConfirm', { name })  ->  "Delete {{name}}?"
}
```

Add a new language or namespace:

1. Create `src/i18n/locales/<language>/<namespace>.json` (keep the same keys in every language, and the same `{{placeholders}}`).
2. Register the files in `src/i18n/index.js` (`resources`) and add the language to `SUPPORTED_LANGUAGES`.
3. Run `pnpm test`: `src/i18n/i18n.test.js` checks that every language has the same keys and placeholders, and `src/i18n/keys.test.js` checks that every key used in the source exists.

Notes:

-   Module-level config (provider forms, tab lists...) cannot call `t` at load time. Keep the English text in the config and translate it where it is rendered with `useTranslatedConfig(config)` or `td(text)` (entries live in the `dynamic` namespace, keyed by the English text).
-   The agentflow canvas library and server error messages are not translated.

### Node catalog texts

Node names, descriptions, parameter labels/descriptions/placeholders and dropdown options come from `packages/components` through the API. They are translated at render time with `tNode(text)` from `useNodeT()` (`src/i18n/nodes.js`), which looks the exact English text up in the `nodes` namespace and falls back to the English text. Only display text goes through it, never a node `name` or an option value.

To update the translations after the node definitions change (build `packages/components` first):

```bash
pnpm --filter wxflow-ui i18n:nodes-coverage -- --list   # untranslated strings and stale keys
pnpm --filter wxflow-ui i18n:extract-nodes out.json     # full English catalog with categories
```

Add the translation to `src/i18n/locales/zh-CN/nodes.json` (`"English text": "中文"`; `en/nodes.json` stays empty). Brand names and identifiers that should stay English go in `scripts/node-keep-english.json`. Use `--strict` in CI to fail on untranslated or stale entries.

## License

Source code in this repository is made available under the [Apache License Version 2.0](../../LICENSE.md).
