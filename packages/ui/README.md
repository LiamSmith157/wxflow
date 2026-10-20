<!-- markdownlint-disable MD030 -->

# Flowise UI

English | [中文](./README-ZH.md)

React frontend ui for Flowise.

![Flowise](https://github.com/FlowiseAI/Flowise/blob/main/images/flowise_agentflow.gif?raw=true)

Install:

```bash
npm i flowise-ui
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
-   The agentflow canvas library, node catalog texts and server error messages are not translated.

## License

Source code in this repository is made available under the [Apache License Version 2.0](https://github.com/FlowiseAI/Flowise/blob/master/LICENSE.md).
