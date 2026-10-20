import { useCallback, useMemo } from 'react'
import { createFilterOptions } from '@mui/material/Autocomplete'
import { useTranslation } from 'react-i18next'

import i18n from './index'

/**
 * Translate a node catalog string (node, parameter or option label / description / placeholder) by looking the
 * exact English text up in the `nodes` namespace. Text without a translation is returned unchanged.
 * The lookup bypasses i18next interpolation and key parsing on purpose: node text may contain `{{ ... }}`,
 * `.` and `:` which must come back exactly as defined. Only display text goes through here, never `name` or values.
 */
export const tn = (text) => {
    if (typeof text !== 'string' || !text) return text
    const translated = i18n.getResource(i18n.resolvedLanguage || i18n.language, 'nodes', text, { keySeparator: false })
    return typeof translated === 'string' && translated ? translated : text
}

/** True when `query` matches the English text or its translation (case-insensitive). */
export const matchesNodeText = (text, query) => {
    if (typeof text !== 'string' || !query) return false
    const needle = query.toLowerCase()
    return text.toLowerCase().includes(needle) || tn(text).toLowerCase().includes(needle)
}

/**
 * Returns `tn` bound to the current language, so components re-render when the language changes.
 */
export const useNodeT = () => {
    const { i18n: instance } = useTranslation('nodes')
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return useCallback(tn, [instance.resolvedLanguage])
}

/**
 * Autocomplete props that show option labels in the current language while typing still matches the
 * English label too. Selection keeps using `option.name`, so saved values do not depend on the language.
 */
export const useNodeOptionProps = () => {
    const tNode = useNodeT()
    return useMemo(() => {
        const labelOf = (option) => (typeof option === 'string' ? option : option?.label)
        return {
            getOptionLabel: (option) => {
                const label = labelOf(option)
                return typeof label === 'string' ? tNode(label) : ''
            },
            filterOptions: createFilterOptions({
                stringify: (option) => {
                    const label = labelOf(option)
                    return typeof label === 'string' ? `${tNode(label)} ${label}` : ''
                }
            })
        }
    }, [tNode])
}
