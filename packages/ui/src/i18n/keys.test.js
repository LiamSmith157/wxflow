import fs from 'fs'
import path from 'path'

import { resources } from './index'

const SRC = path.resolve(__dirname, '..')

const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full)
        return /\.(jsx?)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : []
    })

const lookup = (lng, ns, key) => {
    const bucket = resources[lng][ns]
    if (!bucket) return false
    const read = (k) => k.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), bucket)
    // plural variants are stored as key_one / key_other
    return [key, `${key}_one`, `${key}_other`].some((k) => typeof read(k) === 'string')
}

describe('translation keys used in source', () => {
    const missing = []

    walk(SRC).forEach((file) => {
        const source = fs.readFileSync(file, 'utf8')
        const defaultNs = (source.match(/useTranslation\(\s*'([\w-]+)'\s*\)/) || [])[1] || 'common'
        const calls = [
            ...[...source.matchAll(/(?<![\w.])t\(\s*'([^'$]+)'/g)].map((m) => ({ raw: m[1], ns: defaultNs })),
            ...[...source.matchAll(/i18n\.t\(\s*'([^'$]+)'/g)].map((m) => ({ raw: m[1], ns: 'common' })),
            ...[...source.matchAll(/i18nKey='([^']+)'/g)].map((m) => ({ raw: m[1], ns: defaultNs }))
        ]
        calls.forEach(({ raw, ns }) => {
            const [maybeNs, ...rest] = raw.split(':')
            const [useNs, key] = rest.length ? [maybeNs, rest.join(':')] : [ns, raw]
            ;['en', 'zh-CN'].forEach((lng) => {
                if (!lookup(lng, useNs, key)) missing.push(`${path.relative(SRC, file)}: ${lng} ${useNs}:${key}`)
            })
        })
    })

    it('exist in both languages', () => {
        expect(missing).toEqual([])
    })
})
