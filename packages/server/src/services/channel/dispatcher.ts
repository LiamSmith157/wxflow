import { ChannelEvent } from '../../channels/types'
import { ChannelSettings } from './settings'
import { matchesFilters } from './matching'
import { SubscriptionView, ALL_INSTANCES } from './subscriptions'

export interface DispatcherLogger {
    debug(message: string): void
    info(message: string): void
    warn(message: string): void
    error(message: string): void
}

export interface DispatcherDeps {
    getInstanceWorkspace(channel: string, instanceKey: string): Promise<string | null>
    getSettings(workspaceId: string): Promise<ChannelSettings>
    findEnabled(workspaceId: string, channel: string, eventType: string): Promise<SubscriptionView[]>
    /** Start one run of the subscribed flow for the event; failures are caught by the dispatcher */
    runFlow(subscription: SubscriptionView, event: ChannelEvent, workspaceId: string): Promise<unknown>
    logger: DispatcherLogger
    /** Pending events kept per instance; the oldest are dropped beyond this */
    maxPendingPerInstance?: number
    /** Events of one instance processed at the same time */
    concurrencyPerInstance?: number
}

export const DEFAULT_MAX_PENDING_PER_INSTANCE = 200
export const DEFAULT_CONCURRENCY_PER_INSTANCE = 5

interface InstanceQueue {
    pending: ChannelEvent[]
    active: number
}

/**
 * Turns channel events into flow runs: instance -> workspace -> master switch -> enabled subscriptions -> filters ->
 * one run per matching flow. Events of each instance go through a bounded queue so a slow flow cannot make memory
 * grow without limit.
 */
export const createChannelDispatcher = (deps: DispatcherDeps) => {
    const maxPending = deps.maxPendingPerInstance ?? DEFAULT_MAX_PENDING_PER_INSTANCE
    const concurrency = deps.concurrencyPerInstance ?? DEFAULT_CONCURRENCY_PER_INSTANCE
    const queues = new Map<string, InstanceQueue>()
    const idleWaiters: Array<() => void> = []
    const { logger } = deps

    /** Process one event; resolves when every matching flow has finished */
    const processEvent = async (event: ChannelEvent): Promise<number> => {
        const workspaceId = await deps.getInstanceWorkspace(event.channel, event.instance)
        if (!workspaceId) {
            logger.debug(`[channel] 丢弃事件 ${event.event}: 实例 ${event.instance} 未分配工作区`)
            return 0
        }
        const settings = await deps.getSettings(workspaceId)
        if (!settings.masterEnabled) {
            logger.debug(`[channel] 丢弃事件 ${event.event}: 工作区 ${workspaceId} 的渠道总闸已关闭`)
            return 0
        }
        const subscriptions = await deps.findEnabled(workspaceId, event.channel, event.event)
        const matched = subscriptions.filter(
            (s) =>
                (s.instanceScope === ALL_INSTANCES || s.instanceScope === event.instance) &&
                matchesFilters(event.event, s.filters, event.data)
        )
        logger.debug(`[channel] 事件 ${event.event}@${event.instance}: ${matched.length}/${subscriptions.length} 个流程命中`)
        await Promise.all(
            matched.map(async (s) => {
                try {
                    await deps.runFlow(s, event, workspaceId)
                } catch (e) {
                    // one failing flow must not stop the others
                    logger.error(`[channel] 流程 ${s.chatflowId} 运行失败: ${(e as Error).message}`)
                }
            })
        )
        return matched.length
    }

    const notifyIdle = () => {
        if ([...queues.values()].some((q) => q.active > 0 || q.pending.length > 0)) return
        for (const resolve of idleWaiters.splice(0)) resolve()
    }

    const drain = (key: string, q: InstanceQueue) => {
        while (q.active < concurrency && q.pending.length > 0) {
            const next = q.pending.shift()!
            q.active++
            processEvent(next)
                .catch((e) => logger.error(`[channel] 处理事件 ${next.event}@${key} 失败: ${(e as Error).message}`))
                .finally(() => {
                    q.active--
                    if (q.pending.length === 0 && q.active === 0) queues.delete(key)
                    else drain(key, q)
                    notifyIdle()
                })
        }
    }

    /** Entry point for the channel hub; returns immediately */
    const handleEvent = (event: ChannelEvent): void => {
        const key = `${event.channel}:${event.instance}`
        let q = queues.get(key)
        if (!q) {
            q = { pending: [], active: 0 }
            queues.set(key, q)
        }
        if (q.pending.length >= maxPending) {
            const dropped = q.pending.shift()!
            logger.warn(`[channel] 实例 ${key} 事件积压超过 ${maxPending},丢弃最早的事件 ${dropped.event}`)
        }
        q.pending.push(event)
        drain(key, q)
    }

    /** Resolves when every queue is empty and idle (for tests and shutdown) */
    const whenIdle = (): Promise<void> =>
        [...queues.values()].some((q) => q.active > 0 || q.pending.length > 0)
            ? new Promise((resolve) => idleWaiters.push(resolve))
            : Promise.resolve()

    return { handleEvent, processEvent, whenIdle }
}

export type ChannelDispatcher = ReturnType<typeof createChannelDispatcher>
