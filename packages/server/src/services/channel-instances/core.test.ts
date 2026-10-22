import { ChannelInstance } from '../../database/entities/ChannelInstance'
import { Workspace } from '../../enterprise/database/entities/workspace.entity'
import { createChannelInstanceService } from './core'

/** Minimal in-memory repository: equality-only `where`, enough for the service */
class FakeRepo<T extends Record<string, any> = any> {
    rows: T[] = []
    private seq = 0
    create(partial: Partial<T>): T {
        return { ...partial } as T
    }
    async save(entity: T): Promise<T> {
        const e = entity as any
        if (!e.id) {
            e.id = `id-${++this.seq}`
            e.createdDate = new Date(this.seq)
            this.rows.push(entity)
        }
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

const setup = () => {
    const instances = new FakeRepo<any>()
    const workspaces = new FakeRepo<any>()
    workspaces.rows.push({ id: 'wsA', name: 'Workspace A' }, { id: 'wsB', name: 'Workspace B' })
    const ds = {
        getRepository: (entity: any) => (entity === Workspace ? workspaces : entity === ChannelInstance ? instances : (undefined as any))
    }
    return { service: createChannelInstanceService(() => ds), instances }
}

const manager = (workspaceId: string) => ({ workspaceId, canManage: true })
const viewer = (workspaceId: string) => ({ workspaceId, canManage: false })

describe('channel instance service', () => {
    describe('recording discovered instances', () => {
        it('creates an unassigned, online record for a new instance', async () => {
            const { service, instances } = setup()
            await service.syncPool('wechat', [{ instanceKey: 'wxid_a', online: true, displayName: 'Alice' }])
            expect(instances.rows).toHaveLength(1)
            expect(instances.rows[0]).toMatchObject({ channel: 'wechat', instanceKey: 'wxid_a', displayName: 'Alice', workspaceId: null })
            expect(instances.rows[0].lastSeenAt).toBeInstanceOf(Date)
            const list = await service.listInstances(manager('wsA'))
            expect(list).toHaveLength(1)
            expect(list[0]).toMatchObject({ instanceKey: 'wxid_a', online: true, workspaceId: null })
        })

        it('keeps the workspace of an assigned instance when it comes back online', async () => {
            const { service, instances } = setup()
            await service.syncPool('wechat', [{ instanceKey: 'wxid_a', online: true }])
            await service.assignInstance(instances.rows[0].id, 'wsA', manager('wsA'))
            await service.syncPool('wechat', [])
            expect(service.isOnline('wechat', 'wxid_a')).toBe(false)
            await service.syncPool('wechat', [{ instanceKey: 'wxid_a', online: true, displayName: 'Renamed' }], new Date('2030-01-01'))
            expect(instances.rows).toHaveLength(1)
            expect(instances.rows[0]).toMatchObject({ workspaceId: 'wsA', displayName: 'Renamed' })
            expect(instances.rows[0].lastSeenAt).toEqual(new Date('2030-01-01'))
            expect(service.isOnline('wechat', 'wxid_a')).toBe(true)
        })

        it('marks an instance offline and stamps the last-seen time when it drops from the pool', async () => {
            const { service, instances } = setup()
            await service.syncPool('wechat', [{ instanceKey: 'wxid_a', online: true }], new Date('2030-01-01'))
            await service.syncPool('wechat', [], new Date('2030-01-02'))
            expect(service.isOnline('wechat', 'wxid_a')).toBe(false)
            expect(instances.rows[0].lastSeenAt).toEqual(new Date('2030-01-02'))
            const list = await service.listInstances(manager('wsA'))
            expect(list[0].online).toBe(false)
        })

        it('ignores pool entries that have not identified themselves', async () => {
            const { service, instances } = setup()
            await service.syncPool('wechat', [{ instanceKey: null, online: true }])
            expect(instances.rows).toHaveLength(0)
        })
    })

    describe('assignment', () => {
        it('assigns an unassigned instance to a workspace', async () => {
            const { service, instances } = setup()
            await service.syncPool('wechat', [{ instanceKey: 'wxid_a', online: true }])
            const view = await service.assignInstance(instances.rows[0].id, 'wsA', manager('wsA'))
            expect(view).toMatchObject({ workspaceId: 'wsA', workspaceName: 'Workspace A' })
            expect(await service.getInstanceWorkspace('wechat', 'wxid_a')).toBe('wsA')
        })

        it('moves an instance of the actor workspace to another workspace', async () => {
            const { service, instances } = setup()
            await service.syncPool('wechat', [{ instanceKey: 'wxid_a', online: true }])
            await service.assignInstance(instances.rows[0].id, 'wsA', manager('wsA'))
            await service.assignInstance(instances.rows[0].id, 'wsB', manager('wsA'))
            expect(await service.getInstanceWorkspace('wechat', 'wxid_a')).toBe('wsB')
        })

        it('unassigns an instance', async () => {
            const { service, instances } = setup()
            await service.syncPool('wechat', [{ instanceKey: 'wxid_a', online: true }])
            await service.assignInstance(instances.rows[0].id, 'wsA', manager('wsA'))
            await service.assignInstance(instances.rows[0].id, null, manager('wsA'))
            expect(await service.getInstanceWorkspace('wechat', 'wxid_a')).toBeNull()
        })

        it('rejects a user without manage permission and leaves the assignment unchanged', async () => {
            const { service, instances } = setup()
            await service.syncPool('wechat', [{ instanceKey: 'wxid_a', online: true }])
            await expect(service.assignInstance(instances.rows[0].id, 'wsA', viewer('wsA'))).rejects.toMatchObject({ statusCode: 403 })
            expect(instances.rows[0].workspaceId).toBeNull()
        })

        it('rejects touching an instance that belongs to another workspace', async () => {
            const { service, instances } = setup()
            await service.syncPool('wechat', [{ instanceKey: 'wxid_a', online: true }])
            await service.assignInstance(instances.rows[0].id, 'wsB', manager('wsB'))
            await expect(service.assignInstance(instances.rows[0].id, 'wsA', manager('wsA'))).rejects.toMatchObject({ statusCode: 403 })
            expect(instances.rows[0].workspaceId).toBe('wsB')
        })

        it('rejects an unknown instance or workspace', async () => {
            const { service, instances } = setup()
            await service.syncPool('wechat', [{ instanceKey: 'wxid_a', online: true }])
            await expect(service.assignInstance('nope', 'wsA', manager('wsA'))).rejects.toMatchObject({ statusCode: 404 })
            await expect(service.assignInstance(instances.rows[0].id, 'ghost', manager('wsA'))).rejects.toMatchObject({ statusCode: 404 })
        })
    })

    describe('visibility', () => {
        const seed = async () => {
            const ctx = setup()
            await ctx.service.syncPool('wechat', [
                { instanceKey: 'a', online: true },
                { instanceKey: 'b', online: true },
                { instanceKey: 'c', online: true }
            ])
            await ctx.service.assignInstance(ctx.instances.rows[0].id, 'wsA', manager('wsA'))
            await ctx.service.assignInstance(ctx.instances.rows[1].id, 'wsB', manager('wsB'))
            return ctx // c stays unassigned
        }

        it('shows a view-only user just the instances of their workspace', async () => {
            const { service } = await seed()
            const list = await service.listInstances(viewer('wsA'))
            expect(list.map((i) => i.instanceKey)).toEqual(['a'])
        })

        it('shows managers their workspace plus unassigned instances, but not other workspaces', async () => {
            const { service } = await seed()
            const list = await service.listInstances(manager('wsA'))
            expect(list.map((i) => i.instanceKey).sort()).toEqual(['a', 'c'])
        })

        it('lists only the workspace instances for node options', async () => {
            const { service } = await seed()
            expect((await service.listWorkspaceInstances('wsB', 'wechat')).map((i) => i.instanceKey)).toEqual(['b'])
            expect(await service.listWorkspaceInstances('wsA', 'whatsapp')).toEqual([])
        })

        it('resolves an unassigned or unknown instance to no workspace', async () => {
            const { service } = await seed()
            expect(await service.getInstanceWorkspace('wechat', 'c')).toBeNull()
            expect(await service.getInstanceWorkspace('wechat', 'zzz')).toBeNull()
        })
    })
})
