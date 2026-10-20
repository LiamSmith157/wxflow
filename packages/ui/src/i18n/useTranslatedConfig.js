import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { td } from './dynamic'

const TRANSLATED_KEYS = ['label', 'description', 'text']

const translateConfig = (value) => {
    if (Array.isArray(value)) return value.map(translateConfig)
    if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
        return Object.fromEntries(
            Object.entries(value).map(([key, v]) => [
                key,
                TRANSLATED_KEYS.includes(key) && typeof v === 'string' ? td(v) : translateConfig(v)
            ])
        )
    }
    return value
}

/**
 * Returns a copy of a module-level config (provider forms, tab lists, example prompts...) whose
 * `label`, `description` and `text` strings are translated through the `dynamic` namespace.
 * The copy is rebuilt when the language changes, so the config follows the language switcher.
 */
export const useTranslatedConfig = (config) => {
    const { i18n } = useTranslation()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return useMemo(() => translateConfig(config), [config, i18n.resolvedLanguage])
}

export { translateConfig }
