import { normalizeGroup, normalizeName } from './naming'

const statusOf = (fn: () => unknown): { status: number; message: string } => {
    try {
        fn()
    } catch (e: any) {
        return { status: e.statusCode, message: e.message }
    }
    throw new Error('expected an error')
}

describe('normalizeName', () => {
    it('trims the name and lower-cases the lookup key', () => {
        expect(normalizeName('  Poster-北京 ')).toEqual({ name: 'Poster-北京', nameKey: 'poster-北京' })
    })

    it('rejects an empty or blank name', () => {
        expect(statusOf(() => normalizeName('   '))).toMatchObject({ status: 400, message: '资源名称不能为空' })
        expect(statusOf(() => normalizeName(undefined))).toMatchObject({ status: 400 })
    })

    it.each(['/', '\\', '{', '}'])('rejects a name containing %s and says which character', (c) => {
        const r = statusOf(() => normalizeName(`海报${c}北京`))
        expect(r.status).toBe(400)
        expect(r.message).toBe(`资源名称不能包含 ${c}`)
    })

    it('allows up to 100 characters and rejects 101', () => {
        expect(normalizeName('a'.repeat(100)).name).toHaveLength(100)
        expect(statusOf(() => normalizeName('a'.repeat(101)))).toMatchObject({ status: 400 })
    })

    it('treats names that differ only in case as the same key', () => {
        expect(normalizeName('LOGO').nameKey).toBe(normalizeName('logo').nameKey)
    })
})

describe('normalizeGroup', () => {
    it('treats nothing, blank and null as "no group"', () => {
        expect(normalizeGroup(undefined)).toBeNull()
        expect(normalizeGroup(null)).toBeNull()
        expect(normalizeGroup('  ')).toBeNull()
    })

    it('trims a group name and caps its length', () => {
        expect(normalizeGroup(' 海报 ')).toBe('海报')
        expect(statusOf(() => normalizeGroup('g'.repeat(101)))).toMatchObject({ status: 400 })
    })
})
