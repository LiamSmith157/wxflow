import fs from 'fs'
import path from 'path'
import { databaseEntities } from './databaseEntities'

const COMPONENTS_ROOT = path.resolve(__dirname, '../../../components')

const sourceFiles = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name === 'dist' ? [] : sourceFiles(full)
        return /\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [full] : []
    })

/** Every entity name a component looks up as databaseEntities['X'] or databaseEntities?.['X'] */
const entitiesReadByComponents = (): string[] => {
    const names = new Set<string>()
    for (const file of [...sourceFiles(path.join(COMPONENTS_ROOT, 'src')), ...sourceFiles(path.join(COMPONENTS_ROOT, 'nodes'))]) {
        for (const match of fs.readFileSync(file, 'utf8').matchAll(/databaseEntities\??\.?\[\s*['"](\w+)['"]\s*\]/g)) {
            names.add(match[1])
        }
    }
    return [...names].sort()
}

describe('databaseEntities', () => {
    it('includes Resource, which the resource dropdowns of the send, Load Resource, LLM and Agent nodes read', () => {
        expect(databaseEntities.Resource).toBeDefined()
    })

    it('includes every entity a component node looks up', () => {
        const read = entitiesReadByComponents()
        // the scan itself must find the lookups, or this test would pass for nothing
        expect(read).toEqual(expect.arrayContaining(['ChatFlow', 'ChannelInstance', 'Resource']))
        expect(read.filter((name) => !databaseEntities[name])).toEqual([])
    })
})
