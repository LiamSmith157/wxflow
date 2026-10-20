import i18n from './index'

/**
 * Translate a data-driven English string (labels and descriptions kept in module-level
 * config objects) by looking the exact text up in the `dynamic` namespace.
 * Unknown text is returned unchanged, so untranslated config keeps working.
 * Call it from a component that uses `useTranslation` so it re-renders on language change.
 */
export const td = (text) =>
    typeof text === 'string' && text ? i18n.t(text, { ns: 'dynamic', keySeparator: false, nsSeparator: false, defaultValue: text }) : text
