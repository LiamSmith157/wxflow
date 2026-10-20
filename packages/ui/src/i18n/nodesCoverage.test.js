import { computeCoverage, looksLikeIdentifier, hasMarkup } from '../../scripts/lib/node-strings'

describe('node catalog coverage', () => {
    const strings = {
        Temperature: ['param.label'],
        'Model Name': ['param.label', 'option.label'],
        'gpt-4o': ['option.label'],
        'See <a href="https://example.com">docs</a>': ['param.description']
    }

    it('reports untranslated strings and exempts identifiers', () => {
        const { byCategory, missing } = computeCoverage(strings, { Temperature: '温度' })
        expect(missing.map((m) => m.text)).toEqual(['Model Name', 'See <a href="https://example.com">docs</a>'])
        expect(byCategory['param.label']).toEqual({ total: 2, translated: 1, exempt: 0 })
        expect(byCategory['option.label']).toEqual({ total: 2, translated: 0, exempt: 1 })
    })

    it('reports translation keys that no longer exist in the node definitions', () => {
        const { extra } = computeCoverage(strings, { Temperature: '温度', 'Removed Param': '已删除' })
        expect(extra).toEqual(['Removed Param'])
    })

    it('treats empty translations as missing and honours the keep-english list', () => {
        const { missing } = computeCoverage(strings, { Temperature: '  ' }, ['Model Name'])
        expect(missing.map((m) => m.text)).toContain('Temperature')
        expect(missing.map((m) => m.text)).not.toContain('Model Name')
    })

    it('classifies identifiers and markup', () => {
        expect(looksLikeIdentifier('gpt-4o')).toBe(true)
        expect(looksLikeIdentifier('{{ $input }}')).toBe(true)
        expect(looksLikeIdentifier('Use {{ $webhook.body }} here')).toBe(false)
        expect(looksLikeIdentifier('Temperature')).toBe(false)
        expect(hasMarkup('<a href="x">y</a>')).toBe(true)
        expect(hasMarkup('plain text')).toBe(false)
    })
})
