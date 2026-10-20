import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import enCommon from './locales/en/common.json'
import enLayout from './locales/en/layout.json'
import enMenu from './locales/en/menu.json'
import enComponents from './locales/en/components.json'
import enDynamic from './locales/en/dynamic.json'
import enAgentflows from './locales/en/agentflows.json'
import enExecutions from './locales/en/executions.json'
import enCredentials from './locales/en/credentials.json'
import enVariables from './locales/en/variables.json'
import enApikey from './locales/en/apikey.json'
import enTools from './locales/en/tools.json'
import enDocstore from './locales/en/docstore.json'
import enEvaluations from './locales/en/evaluations.json'
import enAdmin from './locales/en/admin.json'
import enAuth from './locales/en/auth.json'
import enMisc from './locales/en/misc.json'
import zhCommon from './locales/zh-CN/common.json'
import zhLayout from './locales/zh-CN/layout.json'
import zhMenu from './locales/zh-CN/menu.json'
import zhComponents from './locales/zh-CN/components.json'
import zhDynamic from './locales/zh-CN/dynamic.json'
import zhAgentflows from './locales/zh-CN/agentflows.json'
import zhExecutions from './locales/zh-CN/executions.json'
import zhCredentials from './locales/zh-CN/credentials.json'
import zhVariables from './locales/zh-CN/variables.json'
import zhApikey from './locales/zh-CN/apikey.json'
import zhTools from './locales/zh-CN/tools.json'
import zhDocstore from './locales/zh-CN/docstore.json'
import zhEvaluations from './locales/zh-CN/evaluations.json'
import zhAdmin from './locales/zh-CN/admin.json'
import zhAuth from './locales/zh-CN/auth.json'
import zhMisc from './locales/zh-CN/misc.json'

export const FALLBACK_LANGUAGE = 'en'
export const LANGUAGE_STORAGE_KEY = 'lang'

// Languages offered in the header dropdown; each label is shown in its own language
export const SUPPORTED_LANGUAGES = [
    { code: 'en', label: 'English' },
    { code: 'zh-CN', label: '简体中文' }
]

export const resources = {
    en: {
        common: enCommon,
        menu: enMenu,
        layout: enLayout,
        components: enComponents,
        dynamic: enDynamic,
        agentflows: enAgentflows,
        executions: enExecutions,
        credentials: enCredentials,
        variables: enVariables,
        apikey: enApikey,
        tools: enTools,
        docstore: enDocstore,
        evaluations: enEvaluations,
        admin: enAdmin,
        auth: enAuth,
        misc: enMisc
    },
    'zh-CN': {
        common: zhCommon,
        menu: zhMenu,
        layout: zhLayout,
        components: zhComponents,
        dynamic: zhDynamic,
        agentflows: zhAgentflows,
        executions: zhExecutions,
        credentials: zhCredentials,
        variables: zhVariables,
        apikey: zhApikey,
        tools: zhTools,
        docstore: zhDocstore,
        evaluations: zhEvaluations,
        admin: zhAdmin,
        auth: zhAuth,
        misc: zhMisc
    }
}

/**
 * Map any detected language tag (zh, zh-Hans, zh-SG, en-US, fr...) to a supported language
 */
export const normalizeLanguage = (lng) => {
    if (typeof lng !== 'string') return FALLBACK_LANGUAGE
    const tag = lng.toLowerCase()
    // Traditional Chinese is not supported yet, so zh-TW / zh-HK / zh-Hant fall back to English
    if (tag === 'zh' || tag === 'zh-cn' || tag === 'zh-sg' || tag.startsWith('zh-hans')) return 'zh-CN'
    return FALLBACK_LANGUAGE
}

i18n.use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources,
        fallbackLng: FALLBACK_LANGUAGE,
        supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
        nonExplicitSupportedLngs: false,
        load: 'currentOnly',
        ns: Object.keys(resources.en),
        defaultNS: 'common',
        interpolation: { escapeValue: false },
        returnNull: false,
        detection: {
            order: ['localStorage', 'navigator'],
            lookupLocalStorage: LANGUAGE_STORAGE_KEY,
            caches: ['localStorage'],
            convertDetectedLanguage: normalizeLanguage
        }
    })

export default i18n
