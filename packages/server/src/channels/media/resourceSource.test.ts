import fs from 'fs'
import os from 'os'
import path from 'path'
import { MediaError } from './errors'
import { MediaResolver } from './resolver'
import { ResourceLookup, ResourceRecord, registerResourceSource } from './resourceSource'

jest.mock('wxflow-components', () => ({ secureAxiosRequest: jest.fn() }))

let root: string
let records: ResourceRecord[]

const lookup: ResourceLookup = {
    findById: async (workspaceId, id) => records.find((r) => r.workspaceId === workspaceId && r.id === id) ?? null,
    findByNameKey: async (workspaceId, nameKey) =>
        records.find((r) => r.workspaceId === workspaceId && r.name.toLowerCase() === nameKey) ?? null,
    pathOf: (r) => path.join(root, r.workspaceId, `${r.id}${r.ext}`)
}

/** A resource with its file on disk */
const add = (over: Partial<ResourceRecord> & { id: string; name: string }, withFile = true): ResourceRecord => {
    const record: ResourceRecord = { workspaceId: 'wsA', kind: 'image', ext: '.png', ...over }
    records.push(record)
    if (withFile) {
        const file = lookup.pathOf(record)
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, 'x')
    }
    return record
}

const resolver = () => {
    const r = new MediaResolver()
    registerResourceSource(r, lookup)
    return r
}
const ctx = (over: Record<string, unknown> = {}) => ({ mediaRoot: root, maxDownloadBytes: 1024, workspaceId: 'wsA', ...over })
const fail = async (p: Promise<unknown>): Promise<MediaError> => {
    const e = await p.catch((x) => x)
    expect(e).toBeInstanceOf(MediaError)
    return e as MediaError
}

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'wxflow-ressrc-'))
    records = []
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

describe('res:// media source', () => {
    it('is consulted after the URL and absolute-path sources', () => {
        expect(resolver().sourceNames()).toEqual(['url', 'absolute-path', 'resource'])
    })

    it('resolves res://id/<id> to the stored file and never marks it temporary', async () => {
        const r = add({ id: 'abc-1', name: '海报-北京' })
        const media = await resolver().resolve('res://id/abc-1', ctx())
        expect(media).toEqual({ path: lookup.pathOf(r), temporary: false })
    })

    it('keeps resolving by id after the resource was renamed', async () => {
        const r = add({ id: 'abc-1', name: '海报-北京' })
        r.name = '海报-北京-秋季'
        expect((await resolver().resolve('res://id/abc-1', ctx())).path).toBe(lookup.pathOf(r))
    })

    it('resolves res://name/<name> case-insensitively and ignores surrounding spaces', async () => {
        const r = add({ id: 'abc-1', name: 'Poster-BJ' })
        expect((await resolver().resolve('res://name/poster-bj', ctx())).path).toBe(lookup.pathOf(r))
        expect((await resolver().resolve('  res://name/ POSTER-BJ  ', ctx())).path).toBe(lookup.pathOf(r))
    })

    it('picks the resource named by a variable that was replaced before it got here', async () => {
        const shanghai = add({ id: 's', name: '海报-上海' })
        add({ id: 'b', name: '海报-北京' })
        expect((await resolver().resolve('res://name/海报-上海', ctx())).path).toBe(lookup.pathOf(shanghai))
    })

    it('says the resource may have been deleted when the id is unknown', async () => {
        const e = await fail(resolver().resolve('res://id/gone', ctx()))
        expect(e.message).toBe('资源不存在,可能已被删除(`res://id/gone`)')
    })

    it('names the missing resource when the name is unknown', async () => {
        const e = await fail(resolver().resolve('res://name/海报-拉萨', ctx()))
        expect(e.message).toBe('资源 `海报-拉萨` 不存在')
    })

    it('does not see resources of another workspace', async () => {
        add({ id: 'other', name: 'pic', workspaceId: 'wsB' })
        await fail(resolver().resolve('res://id/other', ctx()))
        await fail(resolver().resolve('res://name/pic', ctx()))
    })

    it('refuses a resource of the wrong kind and says what it is', async () => {
        add({ id: 'v1', name: '开业视频', kind: 'video', ext: '.mp4' })
        const e = await fail(resolver().resolve('res://name/开业视频', ctx({ resourceKinds: ['image'] })))
        expect(e.message).toBe('资源 `开业视频` 是视频,不能作为图片发送')
    })

    it('accepts the right kind, and any kind when the caller does not restrict', async () => {
        add({ id: 'v1', name: '开业视频', kind: 'video', ext: '.mp4' })
        add({ id: 'd1', name: '合同', kind: 'file', ext: '.pdf' })
        await expect(resolver().resolve('res://name/开业视频', ctx({ resourceKinds: ['video'] }))).resolves.toBeTruthy()
        await expect(resolver().resolve('res://name/合同', ctx())).resolves.toBeTruthy()
        await expect(resolver().resolve('res://name/合同', ctx({ resourceKinds: undefined }))).resolves.toBeTruthy()
    })

    it('asks for a new upload when the file is gone from the disk', async () => {
        add({ id: 'abc-1', name: '海报-北京' }, false)
        const e = await fail(resolver().resolve('res://id/abc-1', ctx()))
        expect(e.message).toBe('资源 `海报-北京` 的文件已丢失,请在"资源"页面重新上传')
    })

    it('needs a workspace', async () => {
        add({ id: 'abc-1', name: 'pic' })
        const e = await fail(resolver().resolve('res://id/abc-1', ctx({ workspaceId: undefined })))
        expect(e.message).toContain('没有所属工作区')
    })

    it('refuses other res:// forms and empty references', async () => {
        for (const value of ['res://logo', 'res://name/', 'res://name/   ', 'res://']) {
            const e = await fail(resolver().resolve(value, ctx()))
            expect(e.message).toMatch(/无法识别的资源引用|资源 `` 不存在/)
        }
        await fail(resolver().resolve('res://id/', ctx()))
    })

    it('leaves URLs and absolute paths alone', async () => {
        const file = path.join(root, 'plain.png')
        fs.writeFileSync(file, 'x')
        expect(await resolver().resolve(file, ctx())).toEqual({ path: file, temporary: false })
        await expect(resolver().resolve('海报/a.jpg', ctx())).rejects.toThrow('无法识别的媒体')
    })
})
