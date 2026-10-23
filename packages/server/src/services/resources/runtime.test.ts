import fs from 'fs'
import os from 'os'
import path from 'path'
import { MediaError } from '../../channels/media/errors'
import { ResourceLookup, ResourceRecord } from '../../channels/media/resourceSource'
import { toNameKey } from './naming'
import { createResourceRuntime } from './runtime'

jest.mock('wxflow-components', () => ({ secureAxiosRequest: jest.fn() }))

let root: string
let records: ResourceRecord[]

const lookup: ResourceLookup = {
    findById: async (workspaceId, id) => records.find((r) => r.workspaceId === workspaceId && r.id === id) ?? null,
    findByNameKey: async (workspaceId, nameKey) =>
        records.find((r) => r.workspaceId === workspaceId && toNameKey(r.name) === nameKey) ?? null,
    pathOf: (r) => path.join(root, r.workspaceId, `${r.id}${r.ext}`)
}

const add = (over: Partial<ResourceRecord> & { id: string; name: string }, withFile = true): ResourceRecord => {
    const record: ResourceRecord = { workspaceId: 'wsA', kind: 'file', ext: '.pdf', mimeType: 'application/pdf', size: 1, ...over }
    records.push(record)
    if (withFile) {
        const file = lookup.pathOf(record)
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, 'x')
    }
    return record
}

const runtime = (workspaceId = 'wsA') => createResourceRuntime(lookup, workspaceId)
const fail = async (p: Promise<unknown>): Promise<MediaError> => {
    const e = await p.catch((x) => x)
    expect(e).toBeInstanceOf(MediaError)
    return e as MediaError
}

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'wxflow-resrt-'))
    records = []
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

describe('resource runtime', () => {
    it('loads by id with the details of the resource and the local path', async () => {
        const r = add({ id: 'abc', name: '产品手册', groupName: '手册' })
        expect(await runtime().load('res://id/abc')).toEqual({
            id: 'abc',
            name: '产品手册',
            groupName: '手册',
            kind: 'file',
            mimeType: 'application/pdf',
            ext: '.pdf',
            size: 1,
            path: lookup.pathOf(r),
            ref: 'res://id/abc'
        })
    })

    it('loads by name, ignoring case and surrounding spaces', async () => {
        add({ id: 'abc', name: 'Manual' })
        expect((await runtime().load('  res://name/ manual ')).id).toBe('abc')
    })

    it('does not see the resources of another workspace', async () => {
        add({ id: 'abc', name: '产品手册', workspaceId: 'wsB' })
        expect((await fail(runtime('wsA').load('res://id/abc'))).message).toContain('资源不存在')
        expect((await fail(runtime('wsA').load('res://name/产品手册'))).message).toContain('产品手册')
    })

    it('refuses a kind that is not accepted and names the actual kind', async () => {
        add({ id: 'v', name: '开业视频', kind: 'video', ext: '.mp4' })
        const e = await fail(runtime().load('res://id/v', { kinds: ['image', 'file'] }))
        expect(e.message).toContain('开业视频')
        expect(e.message).toContain('是视频')
        expect(e.message).toContain('使用')
        expect(e.message).not.toContain('发送')
    })

    it('reports a resource whose file is gone', async () => {
        add({ id: 'abc', name: '产品手册' }, false)
        expect((await fail(runtime().load('res://id/abc'))).message).toContain('文件已丢失')
    })

    it.each(['C:datasecret.txt', '/etc/passwd', 'https://example.com/a.pdf', '', 'manual.pdf'])(
        'refuses %p because only library resources are allowed',
        async (value) => {
            const e = await fail(runtime().load(value))
            expect(e.message).toContain('只能使用资源库中的资源')
        }
    )
})
