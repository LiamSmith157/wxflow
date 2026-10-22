/**
 * Route-level tests for /channel-instances: permission checks and workspace visibility,
 * running the real router, controller and services on an in-memory fake data source.
 */
import express, { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { ChannelInstance } from '../../database/entities/ChannelInstance'
import { ChannelSetting } from '../../database/entities/ChannelSetting'
import { Workspace } from '../../enterprise/database/entities/workspace.entity'

class FakeRepo {
    rows: any[] = []
    private seq = 0
    create(p: any) {
        return { ...p }
    }
    async save(e: any) {
        if (!e.id) {
            e.id = `id-${++this.seq}`
            e.createdDate = new Date(this.seq)
        }
        if (!this.rows.includes(e)) this.rows.push(e)
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
    [ChannelInstance, new FakeRepo()],
    [ChannelSetting, new FakeRepo()],
    [Workspace, new FakeRepo()]
])

jest.mock('../../utils/getRunningExpressApp', () => ({
    getRunningExpressApp: () => ({ AppDataSource: { getRepository: (entity: any) => repos.get(entity) } })
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
    app.use('/channel-instances', router)
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

let app: express.Application
let instanceIds: Record<string, string>

beforeEach(() => {
    for (const r of repos.values()) r.rows = []
    repos.get(Workspace)!.rows.push({ id: 'wsA', name: 'A' }, { id: 'wsB', name: 'B' })
    const instances = repos.get(ChannelInstance)!
    instanceIds = {}
    for (const [key, ws] of [
        ['a1', 'wsA'],
        ['b1', 'wsB'],
        ['free', null]
    ] as const) {
        const row: any = { channel: 'wechat', instanceKey: key, displayName: key, workspaceId: ws }
        instances.rows.push(row)
        row.id = `inst-${key}`
        instanceIds[key] = row.id
    }
    app = buildApp()
})

describe('GET /channel-instances', () => {
    it('shows a view-only user only their own workspace instances', async () => {
        currentUser = user('wsA', ['channelInstances:view'])
        const res = await request(app).get('/channel-instances')
        expect(res.status).toBe(200)
        expect(res.body.map((i: any) => i.instanceKey)).toEqual(['a1'])
    })

    it('adds unassigned instances for a manager', async () => {
        currentUser = user('wsA', ['channelInstances:view', 'channelInstances:manage'])
        const res = await request(app).get('/channel-instances')
        expect(res.body.map((i: any) => i.instanceKey).sort()).toEqual(['a1', 'free'])
    })

    it('is forbidden without the view permission', async () => {
        currentUser = user('wsA', ['variables:view'])
        expect((await request(app).get('/channel-instances')).status).toBe(403)
    })

    it('lets an organization admin through', async () => {
        currentUser = user('wsA', [], true)
        expect((await request(app).get('/channel-instances')).status).toBe(200)
    })
})

describe('PUT /channel-instances/:id/assignment', () => {
    it('rejects a view-only user and keeps the assignment', async () => {
        currentUser = user('wsA', ['channelInstances:view'])
        const res = await request(app).put(`/channel-instances/${instanceIds.free}/assignment`).send({ workspaceId: 'wsA' })
        expect(res.status).toBe(403)
        expect(repos.get(ChannelInstance)!.rows.find((r) => r.instanceKey === 'free').workspaceId).toBeNull()
    })

    it('lets a manager assign an unassigned instance', async () => {
        currentUser = user('wsA', ['channelInstances:manage'])
        const res = await request(app).put(`/channel-instances/${instanceIds.free}/assignment`).send({ workspaceId: 'wsA' })
        expect(res.status).toBe(200)
        expect(res.body.workspaceId).toBe('wsA')
    })

    it('does not let a manager take an instance of another workspace', async () => {
        currentUser = user('wsA', ['channelInstances:manage'])
        const res = await request(app).put(`/channel-instances/${instanceIds.b1}/assignment`).send({ workspaceId: 'wsA' })
        expect(res.status).toBe(403)
    })

    it('requires workspaceId (or null) in the body', async () => {
        currentUser = user('wsA', ['channelInstances:manage'])
        expect((await request(app).put(`/channel-instances/${instanceIds.free}/assignment`).send({})).status).toBe(412)
        expect((await request(app).put(`/channel-instances/${instanceIds.free}/assignment`).send({ workspaceId: 5 })).status).toBe(400)
    })

    it('unassigns with null', async () => {
        currentUser = user('wsA', ['channelInstances:manage'])
        const res = await request(app).put(`/channel-instances/${instanceIds.a1}/assignment`).send({ workspaceId: null })
        expect(res.status).toBe(200)
        expect(res.body.workspaceId).toBeNull()
    })
})

describe('settings and gateway status', () => {
    it('returns defaults, lets a manager update, and refuses a viewer', async () => {
        currentUser = user('wsA', ['channelInstances:view'])
        expect((await request(app).get('/channel-instances/settings')).body).toEqual({ masterEnabled: true, sendRateLimitPerMinute: 20 })
        expect((await request(app).put('/channel-instances/settings').send({ masterEnabled: false })).status).toBe(403)

        currentUser = user('wsA', ['channelInstances:view', 'channelInstances:manage'])
        const res = await request(app)
            .put('/channel-instances/settings')
            .send({ masterEnabled: false, sendRateLimitPerMinute: 5, workspaceId: 'wsB' })
        expect(res.status).toBe(200)
        expect(res.body).toEqual({ masterEnabled: false, sendRateLimitPerMinute: 5 })
        expect(repos.get(ChannelSetting)!.rows.map((r) => r.workspaceId)).toEqual(['wsA'])
        expect((await request(app).put('/channel-instances/settings').send({ sendRateLimitPerMinute: 0 })).status).toBe(400)
    })

    it('exposes the gateway status to viewers', async () => {
        currentUser = user('wsA', ['channelInstances:view'])
        const res = await request(app).get('/channel-instances/gateway-status')
        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty('state')
        expect(res.body).toHaveProperty('port')
    })
})

describe('POST /channel-instances/:id/test-image', () => {
    it('requires manage permission', async () => {
        currentUser = user('wsA', ['channelInstances:view'])
        expect((await request(app).post(`/channel-instances/${instanceIds.a1}/test-image`).send({ to: 'x' })).status).toBe(403)
    })

    it('requires a recipient and a visible instance', async () => {
        currentUser = user('wsA', ['channelInstances:manage'])
        expect((await request(app).post(`/channel-instances/${instanceIds.a1}/test-image`).send({})).status).toBe(412)
        expect((await request(app).post(`/channel-instances/${instanceIds.b1}/test-image`).send({ to: 'x' })).status).toBe(404)
    })

    it('refuses an offline instance', async () => {
        currentUser = user('wsA', ['channelInstances:manage'])
        const res = await request(app).post(`/channel-instances/${instanceIds.a1}/test-image`).send({ to: 'x' })
        expect(res.status).toBe(409)
    })
})
