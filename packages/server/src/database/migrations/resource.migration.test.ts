import fs from 'fs'
import path from 'path'
import sqlite3 from 'sqlite3'
import { QueryRunner } from 'typeorm'
import { AddResourceEntity1792000000000 } from './sqlite/1792000000000-AddResourceEntity'

// The jest setup replaces `typeorm` with decorator stubs, so the sqlite migration is run for real against an
// in-memory database through a tiny QueryRunner that only knows `query()`.
let db: sqlite3.Database
const exec = (sql: string): Promise<void> => new Promise((resolve, reject) => db.exec(sql, (e) => (e ? reject(e) : resolve())))
const all = (sql: string): Promise<any[]> => new Promise((resolve, reject) => db.all(sql, (e, rows) => (e ? reject(e) : resolve(rows))))
const runner = { query: (sql: string) => exec(sql) } as unknown as QueryRunner

const insert = (id: string, workspaceId: string, nameKey: string) =>
    exec(
        `INSERT INTO "resource" ("id", "workspaceId", "name", "nameKey", "kind", "mimeType", "ext", "size", "originalName")
         VALUES ('${id}', '${workspaceId}', '${nameKey}', '${nameKey}', 'image', 'image/png', '.png', 12, 'a.png')`
    )

describe('resource migration (sqlite)', () => {
    beforeEach(async () => {
        db = new sqlite3.Database(':memory:')
        await new AddResourceEntity1792000000000().up(runner)
    })
    afterEach(() => new Promise<void>((resolve) => db.close(() => resolve())))

    it('creates the table with every column of the entity', async () => {
        const columns = (await all(`PRAGMA table_info("resource")`)).map((c) => c.name)
        expect(columns).toEqual([
            'id',
            'workspaceId',
            'name',
            'nameKey',
            'groupName',
            'kind',
            'mimeType',
            'ext',
            'size',
            'originalName',
            'createdDate',
            'updatedDate'
        ])
    })

    it('fills the timestamps and leaves the group empty by default', async () => {
        await insert('r1', 'w1', 'poster')
        const [row] = await all(`SELECT * FROM "resource"`)
        expect(row.groupName).toBeNull()
        expect(row.createdDate).toBeTruthy()
        expect(row.updatedDate).toBeTruthy()
    })

    it('keeps a name unique within a workspace but not across workspaces', async () => {
        await insert('r1', 'w1', 'poster')
        await expect(insert('r2', 'w1', 'poster')).rejects.toThrow(/UNIQUE/i)
        await expect(insert('r3', 'w2', 'poster')).resolves.toBeUndefined()
    })

    it('can run twice and be rolled back', async () => {
        await new AddResourceEntity1792000000000().up(runner)
        await new AddResourceEntity1792000000000().down(runner)
        expect(await all(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'resource'`)).toEqual([])
    })
})

describe('resource migrations across databases', () => {
    const source = (db: string) => fs.readFileSync(path.join(__dirname, db, '1792000000000-AddResourceEntity.ts'), 'utf8')
    // a column line starts with the (optionally quoted or escaped-quoted) name followed by its SQL type
    const columns = (db: string): string[] => {
        const sql = source(db)
        const body = sql.slice(sql.indexOf('CREATE TABLE'), sql.indexOf('CREATE UNIQUE INDEX'))
        return [...body.matchAll(/^\s*(?:\\`|")?([A-Za-z]+)(?:\\`|")?\s+(?:varchar|uuid|integer|int|datetime|timestamp)\b/gm)].map(
            (m) => m[1]
        )
    }

    it.each(['postgres', 'mysql', 'mariadb'])('%s defines the same columns as sqlite', (db) => {
        expect(columns(db)).toEqual(columns('sqlite'))
        expect(columns('sqlite')).toHaveLength(12)
    })

    it.each(['sqlite', 'postgres', 'mysql', 'mariadb'])('%s creates the unique (workspaceId, nameKey) index', (db) => {
        expect(source(db)).toMatch(/UNIQUE INDEX[^\n]*IDX_resource_workspaceId_nameKey/)
    })

    it.each(['sqlite', 'postgres', 'mysql', 'mariadb'])('%s is registered in the migration list', (db) => {
        expect(fs.readFileSync(path.join(__dirname, db, 'index.ts'), 'utf8')).toContain('AddResourceEntity1792000000000')
    })
})
