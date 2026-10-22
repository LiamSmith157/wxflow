// Pieces shared by the WeChat nodes. Nodes reach the channel only through options.channels (IChannelRuntime),
// never through the gateway or a WebSocket library, so they can be tested with a fake runtime.
import { DataSource } from 'typeorm'
import {
    IChannelRuntime,
    IChannelSendResult,
    ICommonObject,
    IDatabaseEntity,
    INodeData,
    INodeOptionsValue,
    INodeParams
} from '../../../src/Interface'

export const WECHAT_CHANNEL = 'wechat'
export const WECHAT_CATEGORY = 'WeChat'
export const WECHAT_COLOR = '#07C160'

/** The channel handle of this run; missing only when the flow runs outside the server */
export const getChannels = (options: ICommonObject): IChannelRuntime => {
    const channels = options.channels as IChannelRuntime | undefined
    if (!channels) throw new Error('微信渠道不可用:当前运行环境没有提供渠道支持')
    return channels
}

/** The conversation of the triggering WeChat event, if the run has one */
export const getEventTalker = (options: ICommonObject): string => {
    const talker = (options.agentflowRuntime?.wechat as ICommonObject | undefined)?.talker
    return typeof talker === 'string' ? talker.trim() : ''
}

export const text = (value: unknown): string => (value == null ? '' : String(value)).trim()

// ─── Shared parameters ───────────────────────────────────────────────────────

export const instanceParam: INodeParams = {
    label: 'Instance',
    name: 'wechatInstance',
    type: 'asyncOptions',
    loadMethod: 'listWechatInstances',
    description: 'The WeChat account to use. Leave empty to use the account that triggered the flow',
    optional: true,
    additionalParams: true
}

export const recipientParam: INodeParams = {
    label: 'Recipient',
    name: 'wechatTo',
    type: 'string',
    description: 'wxid or chatroom id to send to. Defaults to the conversation that triggered the flow',
    default: '{{ $wechat.talker }}',
    placeholder: '{{ $wechat.talker }}',
    acceptVariable: true
}

export const waitSecondsParam: INodeParams = {
    label: 'Wait for Result (seconds)',
    name: 'wechatWaitSeconds',
    type: 'number',
    description:
        'How long to wait for the final send result (default 30). When it is not known in time the node outputs "pending" and the flow continues',
    optional: true,
    additionalParams: true
}

/** Parameters every send node ends with */
export const sendTailParams: INodeParams[] = [instanceParam, waitSecondsParam]

/** Instance options for the parameter dropdown: only instances of the workspace in the search options */
export const listWechatInstances = async (_: INodeData, options: ICommonObject = {}): Promise<INodeOptionsValue[]> => {
    const appDataSource = options.appDataSource as DataSource
    const databaseEntities = options.databaseEntities as IDatabaseEntity
    if (!appDataSource || !databaseEntities?.['ChannelInstance']) return []
    const instances = await appDataSource
        .getRepository(databaseEntities['ChannelInstance'])
        .findBy({ ...(options.searchOptions || {}), channel: WECHAT_CHANNEL })
    return instances
        .map((i: any) => ({ label: i.displayName || i.instanceKey, name: i.instanceKey, description: i.instanceKey } as INodeOptionsValue))
        .sort((a: INodeOptionsValue, b: INodeOptionsValue) => a.label.localeCompare(b.label))
}

// ─── Send helper ─────────────────────────────────────────────────────────────

export interface SendContext {
    channels: IChannelRuntime
    instance: string
    /** Recipient (already resolved), empty when the node has none */
    to: string
    state: ICommonObject | undefined
}

export const prepareSend = async (nodeData: INodeData, options: ICommonObject, recipientInput?: string): Promise<SendContext> => {
    const channels = getChannels(options)
    const to = recipientInput === undefined ? '' : text(nodeData.inputs?.[recipientInput])
    if (recipientInput !== undefined && !to) {
        throw new Error('收件人为空:请填写收件人,或让流程由微信消息触发以默认回复触发会话')
    }
    const instance = await channels.resolveInstance(WECHAT_CHANNEL, text(nodeData.inputs?.wechatInstance))
    return { channels, instance, to, state: options.agentflowRuntime?.state as ICommonObject | undefined }
}

export const waitSeconds = (nodeData: INodeData): number | undefined => {
    const n = Number(nodeData.inputs?.wechatWaitSeconds)
    return Number.isFinite(n) && n > 0 ? n : undefined
}

/** The node result for a send: state (ok, fail, pending, rate_limited, skipped), jobId and error */
export const sendResult = (
    nodeData: INodeData,
    name: string,
    ctx: SendContext,
    input: ICommonObject,
    result: IChannelSendResult
): ICommonObject => ({
    id: nodeData.id,
    name,
    input,
    output: {
        state: result.state,
        jobId: result.jobId,
        error: result.error,
        instance: ctx.instance,
        to: ctx.to || undefined
    },
    state: ctx.state
})

/** Send one method call and shape the result; the common tail of every send node */
export const sendMethod = async (
    nodeData: INodeData,
    name: string,
    ctx: SendContext,
    method: string,
    params: Record<string, any>,
    input: ICommonObject
): Promise<ICommonObject> => {
    const result = await ctx.channels.send({
        channel: WECHAT_CHANNEL,
        instance: ctx.instance,
        method,
        params,
        waitSeconds: waitSeconds(nodeData)
    })
    return sendResult(nodeData, name, ctx, input, result)
}

/** Branch result for decision nodes: output handle N runs when conditions[N].isFulfilled */
export const branch = (count: number, selected: number): Array<{ isFulfilled: boolean }> =>
    Array.from({ length: count }, (_, i) => ({ isFulfilled: i === selected }))

// ─── Media send ──────────────────────────────────────────────────────────────

export const mediaParam = (label: string, description: string): INodeParams => ({
    label,
    name: 'wechatMedia',
    type: 'string',
    description,
    placeholder: 'D:\\media\\poster.jpg or https://example.com/a.jpg',
    acceptVariable: true
})

/**
 * Send a file-based message (image, file, video). The media parameter is a URL or the full path of a local file; the
 * DLL opens the resolved path as it is. A file downloaded for this send is removed afterwards, whatever the outcome.
 */
export const sendMedia = async (
    nodeData: INodeData,
    options: ICommonObject,
    name: string,
    method: string,
    extraParams: Record<string, any> = {}
): Promise<ICommonObject> => {
    const ctx = await prepareSend(nodeData, options, 'wechatTo')
    const mediaValue = text(nodeData.inputs?.wechatMedia)
    // resolving problems (missing file, unusable value, download refused) fail the node with the
    // operator-facing message from the runtime
    const media = await ctx.channels.resolveMedia(mediaValue)
    try {
        return await sendMethod(
            nodeData,
            name,
            ctx,
            method,
            { wxid: ctx.to, path: media.path, ...extraParams },
            { to: ctx.to, media: mediaValue, ...extraParams }
        )
    } finally {
        await ctx.channels.releaseMedia(media)
    }
}

// ─── Fetch helpers ───────────────────────────────────────────────────────────

/**
 * The message the node would fetch from, when it is the triggering message and its type is known to be wrong
 * (for example fetching an image of a text message): returns the reason, else undefined.
 */
export const triggerTypeProblem = (options: ICommonObject, svrid: string, expectedType: number, what: string): string | undefined => {
    const event = (options.agentflowRuntime?.wechat ?? {}) as ICommonObject
    if (event.event !== 'msg.insert' || !event.svrid || String(event.svrid) !== svrid) return undefined
    if (event.msgType === undefined || event.msgType === null || Number(event.msgType) === expectedType) return undefined
    return `触发消息不是${what}消息(消息类型 ${event.msgType})`
}

export const fetchBranchResult = (
    nodeData: INodeData,
    name: string,
    options: ICommonObject,
    input: ICommonObject,
    success: boolean,
    output: ICommonObject
): ICommonObject => ({
    id: nodeData.id,
    name,
    input,
    output: { ...output, success, conditions: branch(2, success ? 0 : 1) },
    state: options.agentflowRuntime?.state as ICommonObject
})
