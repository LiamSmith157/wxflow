import { StatusCodes } from 'http-status-codes'
import { ChannelSubscription } from '../../database/entities/ChannelSubscription'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import { InstanceDataSource } from '../channel-instances/core'

/** Start node input type that makes a flow listen to WeChat events */
export const WECHAT_START_INPUT_TYPE = 'wechatEvent'
export const WECHAT_CHANNEL_ID = 'wechat'
export const ALL_INSTANCES = 'all'

export interface WechatFilters {
    // msg.insert
    direction?: 'in' | 'out' | 'any'
    talkers?: string[]
    chatScope?: 'any' | 'group' | 'c2c'
    msgTypes?: string[]
    // quickkey.hit
    keys?: string[]
    // session.switch
    to?: string[]
    // msg.media
    media?: string
    // msg.pay
    kinds?: string[]
    payDirection?: 'any' | 'in' | 'out'
}

export interface ExtractedSubscription {
    channel: string
    eventType: string
    instanceScope: string
    filters: WechatFilters
}

/** "a, b ,c" or ["a","b"] or '["a","b"]' (multiOptions values) -> ["a","b","c"] */
export const parseList = (value: unknown): string[] => {
    if (value == null || value === '') return []
    let list: unknown = value
    if (typeof value === 'string') {
        const trimmed = value.trim()
        if (trimmed.startsWith('[')) {
            try {
                list = JSON.parse(trimmed)
            } catch {
                list = trimmed.split(',')
            }
        } else {
            list = trimmed.split(',')
        }
    }
    if (!Array.isArray(list)) return []
    return list.map((x) => String(x).trim()).filter(Boolean)
}

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(value as T) ? (value as T) : fallback

/** Read the subscription a Start node describes; null when the flow does not start from a WeChat event */
export const extractSubscription = (flowData: string | undefined): ExtractedSubscription | null => {
    if (!flowData) return null
    let parsed: any
    try {
        parsed = JSON.parse(flowData)
    } catch {
        return null
    }
    const startNode = (parsed?.nodes ?? []).find((n: any) => n?.data?.name === 'startAgentflow')
    const inputs = startNode?.data?.inputs
    if (!inputs || inputs.startInputType !== WECHAT_START_INPUT_TYPE) return null

    const eventType = typeof inputs.wechatEventType === 'string' && inputs.wechatEventType ? inputs.wechatEventType : 'msg.insert'
    const instanceScope = inputs.wechatInstanceScope === 'specific' && inputs.wechatInstance ? String(inputs.wechatInstance) : ALL_INSTANCES

    let filters: WechatFilters = {}
    switch (eventType) {
        case 'msg.insert':
            filters = {
                direction: oneOf(inputs.wechatDirection, ['in', 'out', 'any'] as const, 'in'),
                talkers: parseList(inputs.wechatTalkers),
                chatScope: oneOf(inputs.wechatChatScope, ['any', 'group', 'c2c'] as const, 'any'),
                // a flow that never touched the field keeps the default of text messages only
                msgTypes: inputs.wechatMsgTypes === undefined ? ['1'] : parseList(inputs.wechatMsgTypes)
            }
            break
        case 'quickkey.hit':
            filters = { keys: parseList(inputs.wechatQuickKeys) }
            break
        case 'session.switch':
            filters = { to: parseList(inputs.wechatSwitchTo) }
            break
        case 'msg.media':
            filters = { media: oneOf(inputs.wechatMediaType, ['any', 'image', 'video', 'file'] as const, 'any') }
            break
        case 'msg.pay':
            filters = {
                kinds: parseList(inputs.wechatPayKinds),
                payDirection: oneOf(inputs.wechatPayDirection, ['any', 'in', 'out'] as const, 'any')
            }
            break
    }
    return { channel: WECHAT_CHANNEL_ID, eventType, instanceScope, filters }
}

export interface SubscriptionView extends Omit<ChannelSubscription, 'filters'> {
    filters: WechatFilters
}

const toView = (row: ChannelSubscription): SubscriptionView => {
    let filters: WechatFilters = {}
    try {
        filters = row.filters ? JSON.parse(row.filters) : {}
    } catch {
        filters = {}
    }
    return { ...row, filters }
}

export const createChannelSubscriptionService = (getDataSource: () => InstanceDataSource) => {
    const repo = () => getDataSource().getRepository(ChannelSubscription)

    /**
     * Bring the subscription of a flow in line with its Start node. A new subscription starts disabled and an
     * existing one keeps its enabled flag, so saving a half-finished flow never starts it replying to messages.
     * A flow that no longer starts from a WeChat event loses its subscription.
     */
    const syncForChatflow = async (
        chatflowId: string,
        workspaceId: string,
        flowData: string | undefined
    ): Promise<SubscriptionView | null> => {
        const r = repo()
        const extracted = extractSubscription(flowData)
        const existing: ChannelSubscription | null = await r.findOne({ where: { chatflowId, workspaceId } })
        if (!extracted) {
            if (existing) await r.delete({ chatflowId, workspaceId })
            return null
        }
        const row: ChannelSubscription = existing ?? r.create({ chatflowId, workspaceId, enabled: false })
        row.channel = extracted.channel
        row.eventType = extracted.eventType
        row.instanceScope = extracted.instanceScope
        row.filters = JSON.stringify(extracted.filters)
        return toView(await r.save(row))
    }

    const deleteForChatflow = async (chatflowId: string, workspaceId: string): Promise<void> => {
        await repo().delete({ chatflowId, workspaceId })
    }

    const getForChatflow = async (chatflowId: string, workspaceId: string): Promise<SubscriptionView | null> => {
        const row: ChannelSubscription | null = await repo().findOne({ where: { chatflowId, workspaceId } })
        return row ? toView(row) : null
    }

    const setEnabled = async (chatflowId: string, workspaceId: string, enabled: boolean): Promise<SubscriptionView> => {
        const r = repo()
        const row: ChannelSubscription | null = await r.findOne({ where: { chatflowId, workspaceId } })
        if (!row) {
            throw new InternalFlowiseError(
                StatusCodes.NOT_FOUND,
                'This flow does not start from a WeChat event; there is nothing to enable'
            )
        }
        row.enabled = enabled
        return toView(await r.save(row))
    }

    /** Enabled subscriptions of a workspace for one event; filters are applied by the dispatcher */
    const findEnabled = async (workspaceId: string, channel: string, eventType: string): Promise<SubscriptionView[]> => {
        const rows: ChannelSubscription[] = await repo().find({ where: { workspaceId, channel, eventType, enabled: true } })
        return rows.map(toView)
    }

    return { syncForChatflow, deleteForChatflow, getForChatflow, setEnabled, findEnabled }
}

export type ChannelSubscriptionService = ReturnType<typeof createChannelSubscriptionService>
