import express from 'express'
import http from 'http'
import { AddressInfo } from 'net'

jest.mock('../../controllers/chatflows', () => {
    const ok = (_req: unknown, res: { json: (body: unknown) => void }) => res.json({ ok: true })
    // every controller method answers 200, so only the permission guard decides the outcome
    return { __esModule: true, default: new Proxy({}, { get: () => ok }) }
})

import chatflowsRouter from './index'
import { Permissions } from '../../enterprise/rbac/Permissions'

type TestUser = { permissions: string[]; isOrganizationAdmin?: boolean }

describe('chatflows routes permissions', () => {
    let server: http.Server
    let baseUrl: string
    let currentUser: TestUser

    beforeAll(async () => {
        const app = express()
        app.use((req, _res, next) => {
            ;(req as any).user = currentUser
            next()
        })
        app.use('/chatflows', chatflowsRouter)
        await new Promise<void>((resolve) => {
            server = app.listen(0, resolve)
        })
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    })

    afterAll(async () => {
        await new Promise((resolve) => server.close(resolve))
    })

    const call = async (method: string, path: string, user: TestUser) => {
        currentUser = user
        const response = await fetch(baseUrl + path, { method, headers: { 'Content-Type': 'application/json' } })
        return response.status
    }

    it('lets a user with only agentflows:view list flows', async () => {
        expect(await call('GET', '/chatflows', { permissions: ['agentflows:view'] })).toBe(200)
    })

    it('does not let a user with only the removed chatflows:view permission list flows', async () => {
        expect(await call('GET', '/chatflows', { permissions: ['chatflows:view'] })).toBe(403)
    })

    it('rejects a user without any flow permission', async () => {
        expect(await call('GET', '/chatflows', { permissions: ['tools:view', 'variables:view'] })).toBe(403)
    })

    it('lets an organization admin through without explicit permissions', async () => {
        expect(await call('GET', '/chatflows', { permissions: [], isOrganizationAdmin: true })).toBe(200)
    })

    it('requires agentflows:create or agentflows:update to save a flow', async () => {
        expect(await call('POST', '/chatflows', { permissions: ['agentflows:view'] })).toBe(403)
        expect(await call('POST', '/chatflows', { permissions: ['agentflows:create'] })).toBe(200)
    })

    it('requires agentflows:delete to delete a flow', async () => {
        expect(await call('DELETE', '/chatflows/flow-1', { permissions: ['agentflows:update'] })).toBe(403)
        expect(await call('DELETE', '/chatflows/flow-1', { permissions: ['agentflows:delete'] })).toBe(200)
    })

    it('does not accept the removed assistants:delete permission for deleting flows', async () => {
        expect(await call('DELETE', '/chatflows/flow-1', { permissions: ['assistants:delete'] })).toBe(403)
    })
})

describe('permission catalog', () => {
    it('no longer lists the chatflows, assistants and templates categories', () => {
        const catalog = new Permissions().toJSON()

        for (const removed of ['chatflows', 'assistants', 'templates']) {
            expect(catalog).not.toHaveProperty(removed)
        }
        const keys = Object.values(catalog).flatMap((permissions) => permissions.map((permission) => permission.key))
        expect(keys.filter((key) => /^(chatflows|assistants|templates):/.test(key))).toEqual([])
    })

    it('still lists the agentflows category', () => {
        const catalog = new Permissions().toJSON()

        expect(catalog).toHaveProperty('agentflows')
        expect(catalog.agentflows.map((permission) => permission.key)).toEqual(
            expect.arrayContaining(['agentflows:view', 'agentflows:create', 'agentflows:update', 'agentflows:delete'])
        )
    })
})
