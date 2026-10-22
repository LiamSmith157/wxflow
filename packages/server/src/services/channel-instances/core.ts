import { StatusCodes } from 'http-status-codes'
import { ChannelInstance } from '../../database/entities/ChannelInstance'
import { Workspace } from '../../enterprise/database/entities/workspace.entity'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import { ChannelInstanceRef } from '../../channels/types'

/** The slice of TypeORM's DataSource this service needs, so tests can run on an in-memory fake */
export interface InstanceDataSource {
    getRepository(entity: any): any
}

export interface Actor {
    workspaceId: string
    /** Holds channelInstances:manage */
    canManage: boolean
}

export interface InstanceView {
    id: string
    channel: string
    instanceKey: string
    displayName?: string
    workspaceId: string | null
    workspaceName?: string
    lastSeenAt?: Date
    online: boolean
}

export const createChannelInstanceService = (getDataSource: () => InstanceDataSource) => {
    /** channel -> instanceKeys currently online */
    const onlineByChannel = new Map<string, Set<string>>()

    const repo = () => getDataSource().getRepository(ChannelInstance)

    const isOnline = (channel: string, instanceKey: string) => onlineByChannel.get(channel)?.has(instanceKey) ?? false

    const toView = (i: ChannelInstance, workspaceNames?: Map<string, string>): InstanceView => ({
        id: i.id,
        channel: i.channel,
        instanceKey: i.instanceKey,
        displayName: i.displayName ?? undefined,
        workspaceId: i.workspaceId ?? null,
        workspaceName: i.workspaceId ? workspaceNames?.get(i.workspaceId) : undefined,
        lastSeenAt: i.lastSeenAt ?? undefined,
        online: isOnline(i.channel, i.instanceKey)
    })

    /**
     * Gateway pool changed: create records for new instances (unassigned), refresh name and last-seen time of the
     * ones that are online, stamp last-seen on the ones that dropped off. Workspace assignment is never touched.
     */
    const syncPool = async (channel: string, pool: ChannelInstanceRef[], now: Date = new Date()): Promise<void> => {
        const nowOnline = new Set(pool.filter((p) => p.online && p.instanceKey).map((p) => p.instanceKey as string))
        const previouslyOnline = onlineByChannel.get(channel) ?? new Set<string>()
        onlineByChannel.set(channel, nowOnline)
        const r = repo()
        for (const ref of pool) {
            if (!ref.online || !ref.instanceKey) continue
            const existing = await r.findOne({ where: { channel, instanceKey: ref.instanceKey } })
            if (existing) {
                existing.lastSeenAt = now
                if (ref.displayName) existing.displayName = ref.displayName
                await r.save(existing)
            } else {
                await r.save(
                    r.create({
                        channel,
                        instanceKey: ref.instanceKey,
                        displayName: ref.displayName ?? ref.instanceKey,
                        workspaceId: null,
                        lastSeenAt: now
                    })
                )
            }
        }
        for (const key of previouslyOnline) {
            if (nowOnline.has(key)) continue
            const existing = await r.findOne({ where: { channel, instanceKey: key } })
            if (existing) {
                existing.lastSeenAt = now
                await r.save(existing)
            }
        }
    }

    const workspaceNames = async (ids: string[]): Promise<Map<string, string>> => {
        const names = new Map<string, string>()
        for (const id of new Set(ids)) {
            const ws = await getDataSource().getRepository(Workspace).findOne({ where: { id } })
            if (ws) names.set(id, ws.name)
        }
        return names
    }

    /** The actor's workspace instances, plus unassigned ones for managers; nothing else */
    const listInstances = async (actor: Actor, channel?: string): Promise<InstanceView[]> => {
        const all: ChannelInstance[] = await repo().find({ where: channel ? { channel } : {}, order: { createdDate: 'ASC' } })
        const visible = all.filter((i) => i.workspaceId === actor.workspaceId || (actor.canManage && !i.workspaceId))
        const names = await workspaceNames(visible.map((i) => i.workspaceId).filter((x): x is string => !!x))
        return visible.map((i) => toView(i, names))
    }

    /** Instances of one workspace, for node parameter options and sending */
    const listWorkspaceInstances = async (workspaceId: string, channel: string): Promise<InstanceView[]> => {
        const all: ChannelInstance[] = await repo().find({ where: { channel, workspaceId } })
        return all.filter((i) => i.workspaceId === workspaceId).map((i) => toView(i))
    }

    /** Workspace an instance belongs to; null when unassigned or unknown */
    const getInstanceWorkspace = async (channel: string, instanceKey: string): Promise<string | null> => {
        const found: ChannelInstance | null = await repo().findOne({ where: { channel, instanceKey } })
        return found?.workspaceId ?? null
    }

    /**
     * Assign an instance to a workspace, move it to another one (workspaceId given) or unassign it (null).
     * A manager may take an unassigned instance or move one of their own workspace; instances of other workspaces
     * are out of reach.
     */
    const assignInstance = async (id: string, targetWorkspaceId: string | null, actor: Actor): Promise<InstanceView> => {
        if (!actor.canManage) throw new InternalFlowiseError(StatusCodes.FORBIDDEN, 'Forbidden')
        const r = repo()
        const instance: ChannelInstance | null = await r.findOne({ where: { id } })
        if (!instance) throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Channel instance ${id} not found`)
        if (instance.workspaceId && instance.workspaceId !== actor.workspaceId) {
            throw new InternalFlowiseError(StatusCodes.FORBIDDEN, 'This instance belongs to another workspace')
        }
        if (targetWorkspaceId) {
            const ws = await getDataSource()
                .getRepository(Workspace)
                .findOne({ where: { id: targetWorkspaceId } })
            if (!ws) throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Workspace ${targetWorkspaceId} not found`)
        }
        instance.workspaceId = targetWorkspaceId
        const saved = await r.save(instance)
        const names = await workspaceNames(saved.workspaceId ? [saved.workspaceId] : [])
        return toView(saved, names)
    }

    return { syncPool, listInstances, listWorkspaceInstances, getInstanceWorkspace, assignInstance, isOnline }
}

export type ChannelInstanceService = ReturnType<typeof createChannelInstanceService>
