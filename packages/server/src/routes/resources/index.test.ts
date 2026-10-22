/**
 * Route-level tests for /resources: permission checks, workspace isolation and the upload path, running the real
 * router, controller and service on an in-memory fake data source and a temporary resources folder.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import express, { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { ChatFlow } from '../../database/entities/ChatFlow'
import { Resource } from '../../database/entities/Resource'

class FakeRepo {
    rows: any[] = []
    private seq = 0
    create(p: any) {
        return { ...p }
    }
    async save(e: any) {
        if (!e.id) e.id = `id-${++this.seq}`
        if (!this.rows.includes(e)) {
            e.createdDate = new Date(1000 + this.seq)
            this.rows.push(e)
        }
        e.updatedDate = new Date()
        return e
    }
    async remove(e: any) {
        this.rows = this.rows.filter((r) => r !== e)
        return e
    }
    private match(r: any, where: Record<string, any> = {}) {
        return Object.entries(where).every(([k, v]) => r[k] === v)
    }
    async findOne({ where }: any) {
        return this.rows.find((r) => this.match(r, where)) ?? null
    }
    async find({ where }: any = {}) {
        return this.rows.filter((r) => this.match(r, where))
    }
}

const repos = new Map<any, FakeRepo>([
    [Resource, new FakeRepo()],
    [ChatFlow, new FakeRepo()]
])

jest.mock('../../utils/getRunningExpressApp', () => ({
    getRunningExpressApp: () => ({ AppDataSource: { getRepository: (entity: any) => repos.get(entity) } })
}))

let mockRoot = ''
let mockMaxBytes = 1024 * 1024
jest.mock('../../services/resources/config', () => ({
    ...jest.requireActual('../../services/resources/config'),
    getResourceConfig: () => ({ root: mockRoot, maxBytes: mockMaxBytes })
}))

let currentUser: any
const buildApp = () => {
    const router = require('./index').default
    const app = express()
    app.use(express.json())
    app.use((req: Request, _res: Response, next: NextFunction) => {
        req.user = currentUser
        next()
    })
    app.use('/resources', router)
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) =>
        res.status(err.statusCode || 500).json({ message: err.message })
    )
    return app
}

const user = (workspaceId: string, permissions: string[], isOrganizationAdmin = false) => ({
    activeWorkspaceId: workspaceId,
    permissions,
    isOrganizationAdmin
})
const ALL = ['resources:view', 'resources:create', 'resources:update', 'resources:delete']

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(56, 1)])
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom', 'latin1'), Buffer.alloc(52, 3)])
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n', 'latin1'), Buffer.alloc(50, 0x20)])
const EXE = Buffer.concat([Buffer.from('MZ\x90\x00', 'latin1'), Buffer.alloc(60, 4)])

let app: express.Application

const uploadAs = (who: any, buffer: Buffer, fileName: string, fields: Record<string, string> = {}) => {
    currentUser = who
    const req = request(app).post('/resources')
    for (const [k, v] of Object.entries(fields)) req.field(k, v)
    return req.attach('file', buffer, fileName)
}
const storedFiles = (ws: string) => (fs.existsSync(path.join(mockRoot, ws)) ? fs.readdirSync(path.join(mockRoot, ws)) : [])
const uploadLeftovers = () => (fs.existsSync(path.join(mockRoot, '.upload')) ? fs.readdirSync(path.join(mockRoot, '.upload')) : [])

beforeEach(() => {
    mockRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wxflow-res-route-'))
    mockMaxBytes = 1024 * 1024
    for (const r of repos.values()) r.rows = []
    app = buildApp()
})
afterEach(() => {
    delete process.env.STORAGE_TYPE
    fs.rmSync(mockRoot, { recursive: true, force: true })
})

describe('permissions', () => {
    it('is forbidden without resources:view and without any permission', async () => {
        currentUser = user('wsA', ['variables:view'])
        expect((await request(app).get('/resources')).status).toBe(403)
    })

    it('lists for a view-only user and for an organization admin', async () => {
        currentUser = user('wsA', ['resources:view'])
        expect((await request(app).get('/resources')).status).toBe(200)
        currentUser = user('wsA', [], true)
        expect((await request(app).get('/resources')).status).toBe(200)
    })

    it('rejects an upload without resources:create and stores nothing', async () => {
        const res = await uploadAs(user('wsA', ['resources:view']), PNG, 'a.png', { name: 'pic' })
        expect(res.status).toBe(403)
        expect(repos.get(Resource)!.rows).toEqual([])
        expect(storedFiles('wsA')).toEqual([])
    })

    it('rejects a view-only user who tries to delete and keeps the resource', async () => {
        const created = await uploadAs(user('wsA', ALL), PNG, 'a.png', { name: 'pic' })
        currentUser = user('wsA', ['resources:view'])
        const res = await request(app).delete(`/resources/${created.body.id}`)
        expect(res.status).toBe(403)
        expect(repos.get(Resource)!.rows).toHaveLength(1)
        expect(storedFiles('wsA')).toHaveLength(1)
    })

    it('needs resources:update to rename, replace and resources:delete to delete', async () => {
        const created = await uploadAs(user('wsA', ALL), PNG, 'a.png', { name: 'pic' })
        const id = created.body.id
        currentUser = user('wsA', ['resources:view', 'resources:create', 'resources:delete'])
        expect((await request(app).put(`/resources/${id}`).send({ name: 'x' })).status).toBe(403)
        expect((await request(app).put(`/resources/${id}/file`).attach('file', PNG, 'b.png')).status).toBe(403)
        currentUser = user('wsA', ['resources:view', 'resources:update'])
        expect((await request(app).delete(`/resources/${id}`)).status).toBe(403)
        expect((await request(app).put(`/resources/${id}`).send({ name: 'x' })).status).toBe(200)
    })
})

describe('upload', () => {
    it('creates an image resource and lists it', async () => {
        const res = await uploadAs(user('wsA', ALL), PNG, '海报 北京.png', { name: '海报-北京', groupName: '海报' })
        expect(res.status).toBe(201)
        expect(res.body).toMatchObject({ name: '海报-北京', groupName: '海报', kind: 'image', ext: '.png', originalName: '海报 北京.png' })
        expect(storedFiles('wsA')).toEqual([`${res.body.id}.png`])
        expect(uploadLeftovers()).toEqual([])
        currentUser = user('wsA', ['resources:view'])
        const list = await request(app).get('/resources')
        expect(list.body.map((r: any) => [r.name, r.usageCount])).toEqual([['海报-北京', 0]])
    })

    it('keeps the file on the local disk even when the blob storage is set to S3', async () => {
        process.env.STORAGE_TYPE = 's3'
        const res = await uploadAs(user('wsA', ALL), PNG, 'a.png', { name: 'pic' })
        expect(res.status).toBe(201)
        expect(fs.readFileSync(path.join(mockRoot, 'wsA', `${res.body.id}.png`))).toEqual(PNG)
    })

    it('answers 409 for a name that is taken and leaves no file behind', async () => {
        await uploadAs(user('wsA', ALL), PNG, 'a.png', { name: 'pic' })
        const res = await uploadAs(user('wsA', ALL), PNG, 'b.png', { name: 'PIC' })
        expect(res.status).toBe(409)
        expect(res.body.message).toContain('已被使用')
        expect(storedFiles('wsA')).toHaveLength(1)
        expect(uploadLeftovers()).toEqual([])
    })

    it('answers 415 for an unsupported file, whatever its extension', async () => {
        const res = await uploadAs(user('wsA', ALL), EXE, 'sneaky.jpg', { name: 'x' })
        expect(res.status).toBe(415)
        expect(storedFiles('wsA')).toEqual([])
        expect(uploadLeftovers()).toEqual([])
    })

    it('answers 413 for a file over the limit while receiving it, with nothing left on disk', async () => {
        mockMaxBytes = 100
        const res = await uploadAs(user('wsA', ALL), Buffer.concat([PNG, Buffer.alloc(500, 7)]), 'big.png', { name: 'big' })
        expect(res.status).toBe(413)
        expect(res.body.message).toContain('超过大小上限')
        expect(repos.get(Resource)!.rows).toEqual([])
        expect(storedFiles('wsA')).toEqual([])
        expect(uploadLeftovers()).toEqual([])
    })

    it('answers 400 when no file is sent', async () => {
        currentUser = user('wsA', ALL)
        const res = await request(app).post('/resources').field('name', 'x')
        expect(res.status).toBe(400)
    })
})

describe('workspace isolation', () => {
    it('hides resources from other workspaces and answers 404 for them', async () => {
        const created = await uploadAs(user('wsA', ALL), PNG, 'a.png', { name: 'pic' })
        currentUser = user('wsB', ALL)
        expect((await request(app).get('/resources')).body).toEqual([])
        for (const res of [
            await request(app).get(`/resources/${created.body.id}/file`),
            await request(app).get(`/resources/${created.body.id}/usages`),
            await request(app).put(`/resources/${created.body.id}`).send({ name: 'x' }),
            await request(app).delete(`/resources/${created.body.id}`)
        ]) {
            expect(res.status).toBe(404)
        }
        expect(storedFiles('wsA')).toHaveLength(1)
    })
})

describe('file', () => {
    it('shows an image inline and downloads on request', async () => {
        const created = await uploadAs(user('wsA', ALL), PNG, '海报.png', { name: 'pic' })
        currentUser = user('wsA', ['resources:view'])
        const inline = await request(app)
            .get(`/resources/${created.body.id}/file`)
            .buffer(true)
            .parse((r, cb) => {
                const chunks: Buffer[] = []
                r.on('data', (c: Buffer) => chunks.push(c))
                r.on('end', () => cb(null, Buffer.concat(chunks)))
            })
        expect(inline.status).toBe(200)
        expect(inline.headers['content-type']).toContain('image/png')
        expect(inline.headers['content-disposition']).toBeUndefined()
        expect(inline.headers['x-content-type-options']).toBe('nosniff')
        expect(inline.body).toEqual(PNG)

        const download = await request(app).get(`/resources/${created.body.id}/file?download=1`)
        expect(download.status).toBe(200)
        expect(download.headers['content-disposition']).toContain('attachment')
        expect(decodeURIComponent(download.headers['content-disposition'])).toContain('海报.png')
    })

    it('always sends documents as attachments', async () => {
        const created = await uploadAs(user('wsA', ALL), PDF, '合同.pdf', { name: '合同' })
        currentUser = user('wsA', ['resources:view'])
        const res = await request(app).get(`/resources/${created.body.id}/file`)
        expect(res.headers['content-disposition']).toContain('attachment')
        expect(res.headers['content-type']).toContain('application/pdf')
    })

    it('says so when the file is gone from the disk', async () => {
        const created = await uploadAs(user('wsA', ALL), MP4, 'v.mp4', { name: 'v' })
        fs.rmSync(path.join(mockRoot, 'wsA', `${created.body.id}.mp4`))
        currentUser = user('wsA', ['resources:view'])
        const res = await request(app).get(`/resources/${created.body.id}/file`)
        expect(res.status).toBe(404)
        expect(res.body.message).toContain('重新上传')
    })
})

describe('rename, replace, delete and usages', () => {
    it('renames, regroups and clears the group', async () => {
        const created = await uploadAs(user('wsA', ALL), PNG, 'a.png', { name: 'pic', groupName: 'g' })
        currentUser = user('wsA', ALL)
        const renamed = await request(app).put(`/resources/${created.body.id}`).send({ name: 'pic2', groupName: '' })
        expect(renamed.status).toBe(200)
        expect(renamed.body).toMatchObject({ name: 'pic2', groupName: null })
    })

    it('replaces the file through the API and refuses a different kind', async () => {
        const created = await uploadAs(user('wsA', ALL), PNG, 'a.png', { name: 'pic' })
        currentUser = user('wsA', ALL)
        const ok = await request(app)
            .put(`/resources/${created.body.id}/file`)
            .attach('file', Buffer.concat([PNG, Buffer.alloc(10)]), 'n.png')
        expect(ok.status).toBe(200)
        expect(ok.body.size).toBe(PNG.length + 10)
        const wrong = await request(app).put(`/resources/${created.body.id}/file`).attach('file', MP4, 'v.mp4')
        expect(wrong.status).toBe(400)
        expect(wrong.body.message).toBe('类型必须保持为图片,新文件是视频')
        expect(uploadLeftovers()).toEqual([])
    })

    it('deletes the resource and its file', async () => {
        const created = await uploadAs(user('wsA', ALL), PNG, 'a.png', { name: 'pic' })
        currentUser = user('wsA', ALL)
        expect((await request(app).delete(`/resources/${created.body.id}`)).status).toBe(204)
        expect(repos.get(Resource)!.rows).toEqual([])
        expect(storedFiles('wsA')).toEqual([])
    })

    it('reports the flows that use the resource, and those that break on rename', async () => {
        const created = await uploadAs(user('wsA', ALL), PNG, 'a.png', { name: 'pic' })
        const media = (m: string) => JSON.stringify({ nodes: [{ id: 'n', data: { inputs: { wechatMedia: m } } }] })
        repos
            .get(ChatFlow)!
            .rows.push(
                { id: 'f1', name: '按 ID', workspaceId: 'wsA', flowData: media(`res://id/${created.body.id}`) },
                { id: 'f2', name: '按名称', workspaceId: 'wsA', flowData: media('res://name/pic') }
            )
        currentUser = user('wsA', ['resources:view'])
        const all = await request(app).get(`/resources/${created.body.id}/usages`)
        expect(all.body.map((u: any) => [u.id, u.via])).toEqual([
            ['f1', 'id'],
            ['f2', 'name']
        ])
        const byName = await request(app).get(`/resources/${created.body.id}/usages?byName=1`)
        expect(byName.body.map((u: any) => u.id)).toEqual(['f2'])
        const list = await request(app).get('/resources')
        expect(list.body[0].usageCount).toBe(2)
    })
})

describe('list filters', () => {
    it('filters by kind, group and name through the query string', async () => {
        const who = user('wsA', ALL)
        await uploadAs(who, PNG, 'a.png', { name: '海报-北京', groupName: '海报' })
        await uploadAs(who, MP4, 'v.mp4', { name: '开业视频' })
        currentUser = who
        const names = async (qs: string) => (await request(app).get(`/resources${qs}`)).body.map((r: any) => r.name)
        expect(await names('?kind=video')).toEqual(['开业视频'])
        expect(await names('?groupName=海报')).toEqual(['海报-北京'])
        expect(await names('?ungrouped=1')).toEqual(['开业视频'])
        expect(await names('?search=北京')).toEqual(['海报-北京'])
        expect((await names('?kind=bogus')).length).toBe(2)
    })
})
