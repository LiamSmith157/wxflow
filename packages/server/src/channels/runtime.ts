import { IChannelCallOutcome, IChannelInstanceInfo, IChannelMedia, IChannelRuntime, IChannelSendResult } from 'wxflow-components'
import { ChannelRegistry } from './ChannelRegistry'
import { ChannelSender } from './ChannelSender'
import { ChannelConfig } from './config'
import { exchangeSubdir, fromHostPath, hostSubdir } from './media/exchange'
import { removeTemporary } from './media/cleanup'
import { MediaResolver } from './media/resolver'
import { GatewayStatus } from './wechat/gatewayService'

export interface ChannelRuntimeDeps {
    registry: ChannelRegistry
    sender: ChannelSender
    resolver: MediaResolver
    config: ChannelConfig
    listWorkspaceInstances(workspaceId: string, channel: string): Promise<Array<{ instanceKey: string; displayName?: string }>>
    gatewayStatus(): GatewayStatus
}

export interface ChannelRuntimeContext {
    workspaceId: string
    /** The channel event that started the run */
    event?: Record<string, any>
}

const unavailableReason = (status: GatewayStatus): string => {
    switch (status.state) {
        case 'queue_mode':
            return '微信网关在队列模式(MODE=QUEUE)下不可用,请改用非队列模式部署'
        case 'disabled':
            return '微信网关已关闭(WECHAT_GATEWAY_PORT=0),请启用后再使用微信节点'
        case 'failed':
            return `微信网关未运行: ${status.reason ?? '启动失败'}`
        default:
            return '微信网关未运行'
    }
}

/** The IChannelRuntime handed to nodes for one run; everything is scoped to the run's workspace */
export const createChannelRuntime = (deps: ChannelRuntimeDeps, ctx: ChannelRuntimeContext): IChannelRuntime => {
    const { registry, sender, resolver, config } = deps
    const mediaContext = { exchange: config.exchange, maxDownloadBytes: config.maxDownloadBytes }

    const notAvailable = (channel: string): { ok: false; error: { code: number; message: string } } => ({
        ok: false,
        error: { code: 503, message: channel === 'wechat' ? unavailableReason(deps.gatewayStatus()) : `渠道 ${channel} 未运行` }
    })

    return {
        workspaceId: ctx.workspaceId,
        event: ctx.event && Object.keys(ctx.event).length ? ctx.event : undefined,
        sendWaitSeconds: config.sendWaitSeconds,

        async listInstances(channel: string): Promise<IChannelInstanceInfo[]> {
            const instances = await deps.listWorkspaceInstances(ctx.workspaceId, channel)
            const online = new Set(
                registry.has(channel)
                    ? registry
                          .get(channel)
                          .pool()
                          .filter((p) => p.online && p.instanceKey)
                          .map((p) => p.instanceKey as string)
                    : []
            )
            return instances.map((i) => ({ instanceKey: i.instanceKey, displayName: i.displayName, online: online.has(i.instanceKey) }))
        },

        async resolveInstance(channel: string, requested?: string): Promise<string> {
            if (!registry.has(channel)) throw new Error(notAvailable(channel).error.message)
            const fromEvent = ctx.event?.channel === channel && typeof ctx.event.instance === 'string' ? ctx.event.instance : ''
            const key = (requested ?? '').trim() || fromEvent
            if (!key) throw new Error('没有可用的实例:当前流程不是由该渠道的事件触发,请在节点中选择一个实例')
            const instances = await deps.listWorkspaceInstances(ctx.workspaceId, channel)
            if (!instances.some((i) => i.instanceKey === key)) {
                throw new Error(`实例 ${key} 不属于当前工作区,或尚未分配给工作区,请在"渠道实例"页面检查`)
            }
            const online = registry
                .get(channel)
                .pool()
                .some((p) => p.online && p.instanceKey === key)
            if (!online) throw new Error(`实例 ${key} 当前离线,请确认该微信已登录并连接到网关`)
            return key
        },

        async send(req): Promise<IChannelSendResult> {
            if (!registry.has(req.channel)) return { state: 'fail', error: notAvailable(req.channel).error.message }
            const waitMs = (req.waitSeconds && req.waitSeconds > 0 ? req.waitSeconds : config.sendWaitSeconds) * 1000
            return sender.send({
                channel: req.channel,
                instance: req.instance,
                workspaceId: ctx.workspaceId,
                method: req.method,
                params: req.params,
                waitMs
            })
        },

        async call(channel, instance, method, params, timeoutMs): Promise<IChannelCallOutcome> {
            if (!registry.has(channel)) return notAvailable(channel)
            return registry.get(channel).call(instance, method, params, timeoutMs)
        },

        async fetchMedia(channel, instance, kind, ref) {
            if (!registry.has(channel)) return notAvailable(channel)
            const adapter = registry.get(channel)
            if (!adapter.fetchMedia) return { ok: false, error: { code: 501, message: `渠道 ${channel} 不支持获取媒体` } }
            return adapter.fetchMedia(instance, kind, ref)
        },

        async resolveMedia(value: string): Promise<IChannelMedia> {
            return resolver.resolve(value, mediaContext)
        },

        async releaseMedia(media: IChannelMedia): Promise<void> {
            await removeTemporary(media)
        },

        mediaDir(kind) {
            return { dir: exchangeSubdir(config.exchange, kind), hostDir: hostSubdir(config.exchange, kind) }
        },

        fromHostPath(hostPath: string): string {
            return fromHostPath(config.exchange, hostPath)
        }
    }
}
