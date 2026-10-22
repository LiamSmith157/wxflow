import fs from 'fs'
import os from 'os'
import path from 'path'
import { ChatFlow } from '../../database/entities/ChatFlow'
import { Resource } from '../../database/entities/Resource'
import { createResourceService } from './core'
import { uploadDir } from './store'

/** Minimal in-memory repository: equality-only `where`, enough for the service */
class FakeRepo<T extends Record<string, any> = any> {
    rows: T[] = []
    private seq = 0
    create(partial: Partial<T>): T {
        return { ...partial } as T
    }
    async save(entity: T): Promise<T> {
        const e = entity as any
        if (!e.id) e.id = `id-${++this.seq}`
        if (!this.rows.includes(entity)) {
            e.createdDate = new Date(1000 + this.seq)
            this.rows.push(entity)
        }
        e.updatedDate = new Date()
        return entity
    }
    async remove(entity: T): Promise<T> {
        this.rows = this.rows.filter((r) => r !== entity)
        return entity
    }
    private match(row: T, where: Record<string, any> = {}) {
        return Object.entries(where).every(([k, v]) => row[k] === v)
    }
    async findOne({ where }: { where: Record<string, any> }): Promise<T | null> {
        return this.rows.find((r) => this.match(r, where)) ?? null
    }
    async find({ where }: { where?: Record<string, any> } = {}): Promise<T[]> {
        return this.rows.filter((r) => this.match(r, where))
    }
}

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(56, 1)])
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 2)])
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom', 'latin1'), Buffer.alloc(52, 3)])
const EXE = Buffer.concat([Buffer.from('MZ\x90\x00', 'latin1'), Buffer.alloc(60, 4)])

let root: string
let seq = 0

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'wxflow-resources-'))
})
afterEach(() => {
    jest.restoreAllMocks()
    fs.rmSync(root, { recursive: true, force: true })
})

const setup = (maxBytes = 1024 * 1024) => {
    const resources = new FakeRepo<any>()
    const chatflows = new FakeRepo<any>()
    const ds = { getRepository: (entity: any) => (entity === Resource ? resources : entity === ChatFlow ? chatflows : (undefined as any)) }
    const service = createResourceService({ getDataSource: () => ds, config: () => ({ root, maxBytes }) })
    return { service, resources, chatflows }
}

/** What multer leaves behind: a file in the upload folder */
const upload = (content: Buffer, originalName: string) => {
    const dir = uploadDir(root)
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, `upload-${++seq}`)
    fs.writeFileSync(file, content)
    return { path: file, originalName }
}

const A = { workspaceId: 'wsA' }
const B = { workspaceId: 'wsB' }
const leftovers = () => (fs.existsSync(uploadDir(root)) ? fs.readdirSync(uploadDir(root)) : [])
const storedFiles = (ws: string) => (fs.existsSync(path.join(root, ws)) ? fs.readdirSync(path.join(root, ws)) : [])

const flowWith = (id: string, name: string, workspaceId: string, ...media: string[]) => ({
    id,
    name,
    workspaceId,
    flowData: JSON.stringify({
        nodes: media.map((m, i) => ({ id: `n${i}`, data: { name: 'wechatSendImageAgentflow', inputs: { wechatMedia: m } } }))
    })
})

describe('resource service: upload', () => {
    it('stores an image, names the file by id and removes the upload', async () => {
        const { service } = setup()
        const view = await service.create(A, upload(PNG, '海报 北京.png'), { name: '海报-北京', groupName: '海报' })
        expect(view).toMatchObject({
            name: '海报-北京',
            groupName: '海报',
            kind: 'image',
            mimeType: 'image/png',
            ext: '.png',
            size: PNG.length
        })
        expect(view.originalName).toBe('海报 北京.png')
        const stored = service.pathOf({ workspaceId: 'wsA', id: view.id, ext: view.ext })
        expect(fs.readFileSync(stored)).toEqual(PNG)
        expect(path.basename(stored)).toBe(`${view.id}.png`)
        expect(leftovers()).toEqual([])
    })

    it('defaults the name to the file name without extension', async () => {
        const { service } = setup()
        expect((await service.create(A, upload(PNG, 'logo.png'))).name).toBe('logo')
    })

    it('refuses a name that is already used, case-insensitively, and leaves nothing behind', async () => {
        const { service, resources } = setup()
        await service.create(A, upload(PNG, 'a.png'), { name: '海报-北京' })
        const err: any = await service.create(A, upload(PNG, 'b.png'), { name: '海报-北京 ' }).catch((e) => e)
        expect(err.statusCode).toBe(409)
        expect(err.message).toContain('已被使用')
        const err2: any = await service
            .create(A, upload(PNG, 'c.png'), { name: 'LOGO' })
            .then(() => service.create(A, upload(PNG, 'd.png'), { name: 'logo' }))
            .catch((e) => e)
        expect(err2.statusCode).toBe(409)
        expect(resources.rows).toHaveLength(2)
        expect(leftovers()).toEqual([])
        expect(storedFiles('wsA')).toHaveLength(2)
    })

    it('allows the same name in different workspaces', async () => {
        const { service } = setup()
        await service.create(A, upload(PNG, 'a.png'), { name: 'logo' })
        await expect(service.create(B, upload(PNG, 'a.png'), { name: 'logo' })).resolves.toMatchObject({ name: 'logo' })
    })

    it('refuses an invalid name before touching the file', async () => {
        const { service } = setup()
        const err: any = await service.create(A, upload(PNG, 'a.png'), { name: '海报/北京' }).catch((e) => e)
        expect(err.statusCode).toBe(400)
        expect(err.message).toBe('资源名称不能包含 /')
        expect(leftovers()).toEqual([])
    })

    it('refuses an unsupported type, even with an image extension', async () => {
        const { service, resources } = setup()
        for (const name of ['setup.exe', 'sneaky.jpg']) {
            const err: any = await service.create(A, upload(EXE, name), { name: name.replace('.', '-') }).catch((e) => e)
            expect(err.statusCode).toBe(415)
            expect(err.message).toContain('不支持这种文件类型')
        }
        expect(resources.rows).toEqual([])
        expect(leftovers()).toEqual([])
        expect(storedFiles('wsA')).toEqual([])
    })

    it('refuses a file over the size limit and leaves no file behind', async () => {
        const { service, resources } = setup(32)
        const err: any = await service.create(A, upload(PNG, 'big.png'), { name: 'big' }).catch((e) => e)
        expect(err.statusCode).toBe(413)
        expect(err.message).toContain('超过大小上限')
        expect(resources.rows).toEqual([])
        expect(leftovers()).toEqual([])
        expect(storedFiles('wsA')).toEqual([])
    })

    it('refuses an empty file', async () => {
        const { service } = setup()
        const err: any = await service.create(A, upload(Buffer.alloc(0), 'a.png'), { name: 'x' }).catch((e) => e)
        expect(err.statusCode).toBe(400)
        expect(leftovers()).toEqual([])
    })

    it('removes the stored file again when saving the record fails', async () => {
        const { service, resources } = setup()
        jest.spyOn(resources, 'save').mockRejectedValueOnce(new Error('db down'))
        await expect(service.create(A, upload(PNG, 'a.png'), { name: 'x' })).rejects.toThrow('db down')
        expect(storedFiles('wsA')).toEqual([])
        expect(leftovers()).toEqual([])
    })
})

describe('resource service: list, rename and groups', () => {
    it('only lists the resources of the workspace and filters by kind, group and name', async () => {
        const { service } = setup()
        await service.create(A, upload(PNG, 'a.png'), { name: '海报-北京', groupName: '海报' })
        await service.create(A, upload(MP4, 'v.mp4'), { name: '开业视频' })
        await service.create(A, upload(JPEG, 'b.jpg'), { name: '产品图', groupName: '产品' })
        await service.create(B, upload(PNG, 'c.png'), { name: '别人的' })

        expect((await service.list(A)).map((r) => r.name).sort()).toEqual(['产品图', '开业视频', '海报-北京'].sort())
        expect((await service.list(A, { kind: 'image' })).map((r) => r.name).sort()).toEqual(['产品图', '海报-北京'].sort())
        expect((await service.list(A, { groupName: '海报' })).map((r) => r.name)).toEqual(['海报-北京'])
        expect((await service.list(A, { ungrouped: true })).map((r) => r.name)).toEqual(['开业视频'])
        expect((await service.list(A, { search: '北京' })).map((r) => r.name)).toEqual(['海报-北京'])
        expect((await service.list(B)).map((r) => r.name)).toEqual(['别人的'])
    })

    it('renames and regroups, checking the new name against the others', async () => {
        const { service } = setup()
        const a = await service.create(A, upload(PNG, 'a.png'), { name: 'one' })
        await service.create(A, upload(PNG, 'b.png'), { name: 'two' })
        expect(await service.update(A, a.id, { name: 'One Renamed', groupName: '新分组' })).toMatchObject({
            name: 'One Renamed',
            groupName: '新分组'
        })
        const clash: any = await service.update(A, a.id, { name: 'TWO' }).catch((e) => e)
        expect(clash.statusCode).toBe(409)
        expect(await service.update(A, a.id, { name: 'ONE RENAMED' })).toMatchObject({ name: 'ONE RENAMED' })
        expect(await service.update(A, a.id, { groupName: '' })).toMatchObject({ groupName: null })
    })

    it('does not touch resources of another workspace', async () => {
        const { service } = setup()
        const a = await service.create(A, upload(PNG, 'a.png'), { name: 'one' })
        for (const call of [
            () => service.get(B, a.id),
            () => service.update(B, a.id, { name: 'x' }),
            () => service.remove(B, a.id),
            () => service.usages(B, a.id)
        ]) {
            const err: any = await call().catch((e: any) => e)
            expect(err.statusCode).toBe(404)
        }
    })
})

describe('resource service: replace and delete', () => {
    it('replaces the file and keeps id, name and group', async () => {
        const { service } = setup()
        const a = await service.create(A, upload(PNG, 'a.png'), { name: '海报-北京', groupName: '海报' })
        const replaced = await service.replaceFile(A, a.id, upload(Buffer.concat([PNG, Buffer.alloc(100, 9)]), 'new.png'))
        expect(replaced).toMatchObject({ id: a.id, name: '海报-北京', groupName: '海报', size: PNG.length + 100, originalName: 'new.png' })
        expect(fs.statSync(service.pathOf({ workspaceId: 'wsA', id: a.id, ext: '.png' })).size).toBe(PNG.length + 100)
        expect(leftovers()).toEqual([])
    })

    it('moves to the new extension and removes the old file when the format changes', async () => {
        const { service } = setup()
        const a = await service.create(A, upload(PNG, 'a.png'), { name: 'pic' })
        const replaced = await service.replaceFile(A, a.id, upload(JPEG, 'a.jpg'))
        expect(replaced).toMatchObject({ ext: '.jpg', mimeType: 'image/jpeg' })
        expect(storedFiles('wsA')).toEqual([`${a.id}.jpg`])
    })

    it('refuses a replacement of another kind and keeps the old file', async () => {
        const { service } = setup()
        const a = await service.create(A, upload(PNG, 'a.png'), { name: 'pic' })
        const err: any = await service.replaceFile(A, a.id, upload(MP4, 'v.mp4')).catch((e) => e)
        expect(err.statusCode).toBe(400)
        expect(err.message).toBe('类型必须保持为图片,新文件是视频')
        expect(fs.readFileSync(service.pathOf({ workspaceId: 'wsA', id: a.id, ext: '.png' }))).toEqual(PNG)
        expect(leftovers()).toEqual([])
    })

    it('reports a file that is in use and leaves the old one untouched', async () => {
        const { service } = setup()
        const a = await service.create(A, upload(PNG, 'a.png'), { name: 'pic' })
        jest.spyOn(fs.promises, 'rename').mockRejectedValueOnce(Object.assign(new Error('busy'), { code: 'EBUSY' }))
        const err: any = await service.replaceFile(A, a.id, upload(PNG, 'b.png')).catch((e) => e)
        expect(err.statusCode).toBe(409)
        expect(err.message).toBe('文件正在被使用,请稍后重试')
        expect(fs.readFileSync(service.pathOf({ workspaceId: 'wsA', id: a.id, ext: '.png' }))).toEqual(PNG)
        expect(leftovers()).toEqual([])
    })

    it('deletes the record and the file', async () => {
        const { service, resources } = setup()
        const a = await service.create(A, upload(PNG, 'a.png'), { name: 'pic' })
        await service.remove(A, a.id)
        expect(resources.rows).toEqual([])
        expect(storedFiles('wsA')).toEqual([])
    })

    it('keeps the record when the file cannot be deleted because it is in use', async () => {
        const { service, resources } = setup()
        const a = await service.create(A, upload(PNG, 'a.png'), { name: 'pic' })
        jest.spyOn(fs.promises, 'rm').mockRejectedValueOnce(Object.assign(new Error('busy'), { code: 'EPERM' }))
        const err: any = await service.remove(A, a.id).catch((e) => e)
        expect(err.statusCode).toBe(409)
        expect(resources.rows).toHaveLength(1)
    })

    it('deletes a resource that flows still point at: references only produce a hint, not a block', async () => {
        const { service, chatflows } = setup()
        const a = await service.create(A, upload(PNG, 'a.png'), { name: 'pic' })
        chatflows.rows.push(flowWith('f1', '促销', 'wsA', `res://id/${a.id}`))
        await expect(service.remove(A, a.id)).resolves.toBeUndefined()
    })
})

describe('resource service: usages', () => {
    it('finds flows by id and by a fixed name, case-insensitively', async () => {
        const { service, chatflows } = setup()
        const a = await service.create(A, upload(PNG, 'a.png'), { name: 'Poster-BJ' })
        chatflows.rows.push(
            flowWith('f1', '按 ID', 'wsA', `res://id/${a.id}`),
            flowWith('f2', '按名称', 'wsA', 'res://name/Poster-BJ'),
            flowWith('f3', '大小写和空白', 'wsA', '  res://name/POSTER-bj '),
            flowWith('f4', '两种都有', 'wsA', `res://id/${a.id}`, 'res://name/Poster-BJ'),
            flowWith('f5', '无关', 'wsA', 'https://example.com/a.png', 'D:\\a.png')
        )
        const found = await service.usages(A, a.id)
        expect(found.map((u) => [u.id, u.via])).toEqual([
            ['f1', 'id'],
            ['f2', 'name'],
            ['f3', 'name'],
            ['f4', 'both']
        ])
    })

    it('does not count a reference whose name is built with a variable', async () => {
        const { service, chatflows } = setup()
        const a = await service.create(A, upload(PNG, 'a.png'), { name: '海报-上海' })
        chatflows.rows.push(flowWith('f1', '变量', 'wsA', 'res://name/海报-{{ $wechat.city }}'))
        expect(await service.usages(A, a.id)).toEqual([])
        expect((await service.list(A))[0].usageCount).toBe(0)
    })

    it('does not count flows of other workspaces', async () => {
        const { service, chatflows } = setup()
        const a = await service.create(A, upload(PNG, 'a.png'), { name: 'pic' })
        chatflows.rows.push(flowWith('f1', '别人的流程', 'wsB', `res://id/${a.id}`, 'res://name/pic'))
        expect(await service.usages(A, a.id)).toEqual([])
    })

    it('lists only the flows that break on rename when asked for name references', async () => {
        const { service, chatflows } = setup()
        const a = await service.create(A, upload(PNG, 'a.png'), { name: 'pic' })
        chatflows.rows.push(
            flowWith('f1', '按 ID', 'wsA', `res://id/${a.id}`),
            flowWith('f2', '按名称', 'wsA', 'res://name/pic'),
            flowWith('f3', '两种', 'wsA', `res://id/${a.id}`, 'res://name/pic')
        )
        expect((await service.usages(A, a.id, { byNameOnly: true })).map((u) => u.id)).toEqual(['f2', 'f3'])
    })

    it('counts usages for the whole list with one pass over the flows', async () => {
        const { service, chatflows } = setup()
        const a = await service.create(A, upload(PNG, 'a.png'), { name: 'one' })
        const b = await service.create(A, upload(PNG, 'b.png'), { name: 'two' })
        chatflows.rows.push(
            flowWith('f1', 'x', 'wsA', `res://id/${a.id}`, 'res://name/two'),
            flowWith('f2', 'y', 'wsA', `res://id/${a.id}`)
        )
        const find = jest.spyOn(chatflows, 'find')
        const counts = Object.fromEntries((await service.list(A)).map((r) => [r.name, r.usageCount]))
        expect(counts).toEqual({ one: 2, two: 1 })
        expect(find).toHaveBeenCalledTimes(1)
        expect(b.id).toBeTruthy()
    })

    it('ignores flows whose data cannot be read', async () => {
        const { service, chatflows } = setup()
        const a = await service.create(A, upload(PNG, 'a.png'), { name: 'pic' })
        chatflows.rows.push(
            { id: 'f1', name: 'broken', workspaceId: 'wsA', flowData: '{not json' },
            { id: 'f2', name: 'empty', workspaceId: 'wsA', flowData: null }
        )
        expect(await service.usages(A, a.id)).toEqual([])
    })
})
