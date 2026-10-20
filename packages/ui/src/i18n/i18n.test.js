/**
 * @jest-environment <rootDir>/src/__test_utils__/jest-environment-jsdom.js
 */

// The language detector reads localStorage / navigator at init time, so every case loads a fresh module graph
const loadI18n = ({ browserLanguages = ['en-US'], stored } = {}) => {
    window.localStorage.clear()
    if (stored) window.localStorage.setItem('lang', stored)
    Object.defineProperty(window.navigator, 'languages', { value: browserLanguages, configurable: true })
    Object.defineProperty(window.navigator, 'language', { value: browserLanguages[0], configurable: true })

    let module
    jest.isolateModules(() => {
        module = require('./index')
    })
    return module
}

describe('i18n', () => {
    describe('normalizeLanguage', () => {
        const { normalizeLanguage } = loadI18n()

        it.each([
            ['zh', 'zh-CN'],
            ['zh-CN', 'zh-CN'],
            ['zh-cn', 'zh-CN'],
            ['zh-Hans', 'zh-CN'],
            ['zh-Hans-CN', 'zh-CN'],
            ['zh-SG', 'zh-CN'],
            ['zh-TW', 'en'],
            ['zh-Hant', 'en'],
            ['en-US', 'en'],
            ['fr', 'en'],
            [undefined, 'en']
        ])('maps %s to %s', (input, expected) => {
            expect(normalizeLanguage(input)).toBe(expected)
        })
    })

    describe('initial language', () => {
        it('follows a zh-CN browser', () => {
            expect(loadI18n({ browserLanguages: ['zh-CN'] }).default.language).toBe('zh-CN')
        })

        it('follows a zh-Hans browser', () => {
            expect(loadI18n({ browserLanguages: ['zh-Hans'] }).default.language).toBe('zh-CN')
        })

        it('falls back to en for other browser languages', () => {
            expect(loadI18n({ browserLanguages: ['fr'] }).default.language).toBe('en')
        })

        it('prefers the stored choice over the browser language', () => {
            expect(loadI18n({ browserLanguages: ['zh-CN'], stored: 'en' }).default.language).toBe('en')
            expect(loadI18n({ browserLanguages: ['en-US'], stored: 'zh-CN' }).default.language).toBe('zh-CN')
        })
    })

    describe('changeLanguage', () => {
        it('persists the choice to localStorage', async () => {
            const { default: i18n } = loadI18n()
            await i18n.changeLanguage('zh-CN')
            expect(window.localStorage.getItem('lang')).toBe('zh-CN')
        })

        it('translates menu titles per language', async () => {
            const { default: i18n } = loadI18n()
            await i18n.changeLanguage('en')
            expect(i18n.t('menu:executions')).toBe('Executions')
            await i18n.changeLanguage('zh-CN')
            expect(i18n.t('menu:executions')).toBe('执行记录')
        })
    })

    describe('fallback', () => {
        it('shows the English text when zh-CN lacks the key', async () => {
            const { default: i18n } = loadI18n()
            i18n.addResource('en', 'common', 'onlyEnglish', 'Only in English')
            await i18n.changeLanguage('zh-CN')
            expect(i18n.t('onlyEnglish')).toBe('Only in English')
        })

        it('interpolates dynamic values inside a whole sentence', async () => {
            const { default: i18n } = loadI18n()
            i18n.addResource('zh-CN', 'common', 'deleteConfirm', '确定要删除 {{name}} 吗?')
            await i18n.changeLanguage('zh-CN')
            expect(i18n.t('deleteConfirm', { name: '客服助手' })).toBe('确定要删除 客服助手 吗?')
        })
    })

    describe('resource parity', () => {
        const { resources } = loadI18n()

        // Nested resources are compared by their dotted key paths
        // plural variants (_one, _other...) differ per language, so only the base key has to exist
        const baseKey = (key) => key.replace(/_(zero|one|two|few|many|other)$/, '')
        const flatten = (obj, prefix = '') =>
            Object.entries(obj).flatMap(([key, value]) =>
                value && typeof value === 'object' ? flatten(value, `${prefix}${key}.`) : [[`${prefix}${key}`, value]]
            )

        // `nodes` is keyed by the English text itself and may be translated in part, see the dedicated test below
        it.each(Object.keys(resources.en).filter((ns) => ns !== 'nodes'))('%s has the same keys in en and zh-CN, none empty', (ns) => {
            const en = flatten(resources.en[ns])
            const zh = flatten(resources['zh-CN'][ns])
            expect([...new Set(zh.map(([k]) => baseKey(k)))].sort()).toEqual([...new Set(en.map(([k]) => baseKey(k)))].sort())
            // interpolation placeholders must survive translation so dynamic values land in whole sentences
            const placeholders = (text) => (text.match(/\{\{\s*\w+\s*\}\}/g) || []).sort()
            en.filter(([key]) => key in Object.fromEntries(zh)).forEach(([key, text]) =>
                expect([key, placeholders(Object.fromEntries(zh)[key])]).toEqual([key, placeholders(text)])
            )
            ;[...en, ...zh].forEach(([key, value]) => expect([key, typeof value === 'string' && value.length > 0]).toEqual([key, true]))
        })

        it('nodes translations are non-empty and keep interpolation placeholders', () => {
            const placeholders = (text) => (text.match(/\{\{\s*[^}]*\}\}/g) || []).sort()
            expect(Object.keys(resources.en.nodes)).toEqual([])
            Object.entries(resources['zh-CN'].nodes).forEach(([text, translated]) => {
                expect([text, typeof translated === 'string' && translated.trim().length > 0]).toEqual([text, true])
                expect([text, placeholders(translated)]).toEqual([text, placeholders(text)])
            })
        })
    })
})

describe('glossary', () => {
    const { resources } = loadI18n()
    const terms = resources['zh-CN'].common.terms
    const menu = resources['zh-CN'].menu

    it('keeps the menu wording consistent with the shared terms', () => {
        expect(menu.credentials).toContain(terms.credential)
        expect(menu.variables).toContain(terms.variable)
        expect(menu.tools).toContain(terms.tool)
        expect(menu.documentStores).toContain(terms.documentStore)
        expect(menu.workspaces).toContain(terms.workspace)
        expect(menu.roles).toContain(terms.role)
        expect(menu.users).toContain(terms.user)
        expect(menu.datasets).toContain(terms.dataset)
        expect(menu.evaluators).toContain(terms.evaluator)
        expect(menu.evaluations).toContain(terms.evaluation)
        expect(menu.executions).toContain(terms.execution)
    })
})
