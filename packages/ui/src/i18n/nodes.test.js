/**
 * @jest-environment <rootDir>/src/__test_utils__/jest-environment-jsdom.js
 */

const loadModules = (zhNodes) => {
    window.localStorage.clear()
    Object.defineProperty(window.navigator, 'languages', { value: ['en-US'], configurable: true })
    Object.defineProperty(window.navigator, 'language', { value: 'en-US', configurable: true })
    let modules
    jest.isolateModules(() => {
        const i18nModule = require('./index')
        i18nModule.default.addResourceBundle('zh-CN', 'nodes', zhNodes, true, true)
        modules = { ...require('./nodes'), i18n: i18nModule.default }
    })
    return modules
}

describe('tn', () => {
    const zhNodes = {
        Temperature: '温度',
        'Chat Models': '聊天模型',
        'Use {{ $input }} here': '在此使用 {{ $input }}',
        'Step 1: Configure.': '第 1 步:配置。'
    }

    it('returns the English text in en', () => {
        const { tn } = loadModules(zhNodes)
        expect(tn('Temperature')).toBe('Temperature')
    })

    it('returns the translation in zh-CN and follows language changes', async () => {
        const { tn, i18n } = loadModules(zhNodes)
        await i18n.changeLanguage('zh-CN')
        expect(tn('Temperature')).toBe('温度')
        await i18n.changeLanguage('en')
        expect(tn('Temperature')).toBe('Temperature')
    })

    it('falls back to the English text when there is no translation', async () => {
        const { tn, i18n } = loadModules(zhNodes)
        await i18n.changeLanguage('zh-CN')
        expect(tn('Unknown Param')).toBe('Unknown Param')
    })

    it('keeps placeholders, dots and colons in node text intact', async () => {
        const { tn, i18n } = loadModules(zhNodes)
        await i18n.changeLanguage('zh-CN')
        expect(tn('Use {{ $input }} here')).toBe('在此使用 {{ $input }}')
        expect(tn('Step 1: Configure.')).toBe('第 1 步:配置。')
        expect(tn('Unmapped {{ $webhook.body.* }} text. Really: yes')).toBe('Unmapped {{ $webhook.body.* }} text. Really: yes')
    })

    it('passes non-strings through unchanged', () => {
        const { tn } = loadModules(zhNodes)
        expect(tn(undefined)).toBeUndefined()
        expect(tn('')).toBe('')
    })

    it('matches search text against both the English text and the translation', async () => {
        const { matchesNodeText, i18n } = loadModules(zhNodes)
        await i18n.changeLanguage('zh-CN')
        expect(matchesNodeText('Chat Models', 'chat')).toBe(true)
        expect(matchesNodeText('Chat Models', '聊天')).toBe(true)
        expect(matchesNodeText('Chat Models', 'embedding')).toBe(false)
    })
})
