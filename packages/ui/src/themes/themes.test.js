import theme from './index'

// The scss variables are not available under jest, any valid colour is enough for building a theme
jest.mock(
    '@/assets/scss/_themes-vars.module.scss',
    () => new Proxy({}, { get: (_, key) => (key === '__esModule' ? undefined : '#336699') })
)

const customization = { isDarkMode: false }

describe('theme locale', () => {
    it('keeps MUI built-in text in English by default', () => {
        const t = theme(customization, 'en')
        expect(t.components.MuiTablePagination).toBeUndefined()
        expect(t.components.MuiAutocomplete.defaultProps).toBeUndefined()
    })

    it('localises MUI built-in text for zh-CN', () => {
        const t = theme(customization, 'zh-CN')
        expect(t.components.MuiTablePagination.defaultProps.labelRowsPerPage).toBe('每页行数:')
        expect(t.components.MuiAutocomplete.defaultProps.noOptionsText).toBe('没有可用选项')
    })

    it('keeps the project component overrides when a locale is applied', () => {
        const en = theme(customization, 'en')
        const zh = theme(customization, 'zh-CN')
        expect(zh.components.MuiPaper.defaultProps).toEqual(en.components.MuiPaper.defaultProps)
        expect(Object.keys(zh.components)).toEqual(expect.arrayContaining(Object.keys(en.components)))
    })
})
