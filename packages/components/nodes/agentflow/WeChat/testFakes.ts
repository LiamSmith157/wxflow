// In-memory IChannelRuntime for unit tests of the WeChat nodes (no gateway, no WebSocket).
import os from 'os'
import path from 'path'
import {
    IChannelCallOutcome,
    IChannelInstanceInfo,
    IChannelMedia,
    IChannelRuntime,
    IChannelSendResult,
    ICommonObject
} from '../../../src/Interface'

export interface FakeSend {
    channel: string
    instance: string
    method: string
    params: Record<string, any>
    waitSeconds?: number
}

export interface FakeChannels extends IChannelRuntime {
    instances: IChannelInstanceInfo[]
    sends: FakeSend[]
    calls: Array<{ instance: string; method: string; params: Record<string, any>; timeoutMs?: number }>
    released: IChannelMedia[]
    /** The `kinds` each resolveMedia() call asked for */
    resolveKinds: Array<Array<'image' | 'video' | 'file'> | undefined>
    /** Result returned by send(); a function can answer per call */
    sendOutcome: IChannelSendResult | ((req: FakeSend) => IChannelSendResult)
    /** Scripted results of call(), by method */
    callResults: Record<string, IChannelCallOutcome>
    /** Scripted results of fetchMedia(), by ref */
    mediaResults: Record<string, IChannelCallOutcome & { data?: Buffer }>
    /** Media resolution table: value -> resolved media or an error to throw */
    mediaFiles: Record<string, IChannelMedia | Error>
    dirs: { images: string; voice: string }
}

export const createFakeChannels = (
    over: { workspaceId?: string; event?: ICommonObject; instances?: IChannelInstanceInfo[]; mediaRoot?: string } = {}
): FakeChannels => {
    const root = over.mediaRoot ?? path.join(os.tmpdir(), 'wxflow-fake-media')
    const fake: FakeChannels = {
        workspaceId: over.workspaceId ?? 'ws',
        event: over.event,
        instances: over.instances ?? [{ instanceKey: 'wxid_bot', displayName: 'Bot', online: true }],
        sends: [],
        calls: [],
        released: [],
        resolveKinds: [],
        sendOutcome: { state: 'ok', jobId: 'job-1' },
        callResults: {},
        mediaResults: {},
        mediaFiles: {},
        dirs: { images: path.join(root, 'images'), voice: path.join(root, 'voice') },
        sendWaitSeconds: 30,

        async listInstances() {
            return fake.instances
        },
        async resolveInstance(_channel, requested) {
            const key = (requested ?? '').trim() || (fake.event?.channel === 'wechat' ? String(fake.event.instance ?? '') : '')
            if (!key) throw new Error('没有可用的实例:当前流程不是由该渠道的事件触发,请在节点中选择一个实例')
            const found = fake.instances.find((i) => i.instanceKey === key)
            if (!found) throw new Error(`实例 ${key} 不属于当前工作区,或尚未分配给工作区`)
            if (!found.online) throw new Error(`实例 ${key} 当前离线`)
            return key
        },
        async send(req) {
            fake.sends.push(req)
            return typeof fake.sendOutcome === 'function' ? fake.sendOutcome(req) : fake.sendOutcome
        },
        async call(_channel, instance, method, params, timeoutMs) {
            fake.calls.push({ instance, method, params, timeoutMs })
            return fake.callResults[method] ?? { ok: true, result: {} }
        },
        async fetchMedia(_channel, _instance, _kind, ref) {
            return fake.mediaResults[ref] ?? { ok: false, error: { code: 404, message: 'media not found' } }
        },
        async resolveMedia(value, mediaOptions) {
            fake.resolveKinds.push(mediaOptions?.kinds)
            const found = fake.mediaFiles[value]
            if (!found) throw new Error(`文件 \`${value}\` 不存在,请检查路径`)
            if (found instanceof Error) throw found
            return found
        },
        async releaseMedia(media) {
            fake.released.push(media)
        },
        mediaDir(kind) {
            return fake.dirs[kind]
        }
    }
    return fake
}

export const messageEvent = (over: ICommonObject = {}): ICommonObject => ({
    channel: 'wechat',
    instance: 'wxid_bot',
    event: 'msg.insert',
    talker: 'wxid_friend',
    sender: 'wxid_friend',
    direction: 'in',
    isGroup: false,
    msgType: 1,
    content: '你好',
    svrid: '8970001234567890123',
    ...over
})

/** Options as the flow engine passes them to a node's run() */
export const runOptions = (channels: FakeChannels, extra: ICommonObject = {}): ICommonObject => ({
    channels,
    chatflowid: 'flow-1',
    agentflowRuntime: { state: {}, wechat: channels.event ?? {} },
    ...extra
})
