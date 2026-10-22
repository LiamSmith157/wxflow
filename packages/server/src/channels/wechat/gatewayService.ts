import { ChannelRegistry } from '../ChannelRegistry'
import { MediaDirCheck } from '../media/selfCheck'
import { ChannelSink } from '../types'
import { GatewayLogger, WeChatGateway, WECHAT_CHANNEL } from './WeChatGateway'

export const DEFAULT_WECHAT_GATEWAY_PORT = 56233
export const DEFAULT_WECHAT_GATEWAY_HOST = '127.0.0.1'

export type GatewayState = 'running' | 'disabled' | 'queue_mode' | 'failed' | 'not_started'

export interface GatewayStatus {
    state: GatewayState
    host: string
    port: number
    /** Why the gateway is not running (disabled, queue mode, bind failure) */
    reason?: string
    /** Result of the startup self-check of the media working directory */
    media?: MediaDirCheck
}

export interface StartGatewayOptions {
    registry: ChannelRegistry
    sink: ChannelSink
    logger: GatewayLogger
    env?: NodeJS.ProcessEnv
}

let gateway: WeChatGateway | undefined
let status: GatewayStatus = { state: 'not_started', host: DEFAULT_WECHAT_GATEWAY_HOST, port: DEFAULT_WECHAT_GATEWAY_PORT }

const parsePort = (raw: string | undefined): number => {
    if (raw === undefined || raw.trim() === '') return DEFAULT_WECHAT_GATEWAY_PORT
    const n = Number(raw)
    return Number.isInteger(n) && n >= 0 && n <= 65535 ? n : NaN
}

let mediaDirCheck: MediaDirCheck | undefined

export const setMediaDirCheck = (check: MediaDirCheck | undefined): void => {
    mediaDirCheck = check
}

export const getGatewayStatus = (): GatewayStatus => ({ ...status, ...(mediaDirCheck ? { media: mediaDirCheck } : {}) })

export const getWeChatGateway = (): WeChatGateway | undefined => gateway

/**
 * Create the WeChat gateway from environment and register it. Never throws: a gateway that cannot start
 * (port 0, queue mode, bind failure) is reported through the returned status and logged, the server keeps running.
 */
export const startWeChatGateway = async ({ registry, sink, logger, env = process.env }: StartGatewayOptions): Promise<GatewayStatus> => {
    const host = env.WECHAT_GATEWAY_HOST?.trim() || DEFAULT_WECHAT_GATEWAY_HOST
    const port = parsePort(env.WECHAT_GATEWAY_PORT)

    if (Number.isNaN(port)) {
        status = {
            state: 'failed',
            host,
            port: DEFAULT_WECHAT_GATEWAY_PORT,
            reason: `WECHAT_GATEWAY_PORT 无效: ${env.WECHAT_GATEWAY_PORT}`
        }
        logger.error(`[wechat-gateway] ${status.reason},微信网关未启动`)
        return getGatewayStatus()
    }
    if (env.MODE?.toLowerCase() === 'queue') {
        status = { state: 'queue_mode', host, port, reason: '队列模式下不可用' }
        logger.info('[wechat-gateway] 队列模式(MODE=QUEUE)下微信网关不启动:网关只能连接一个进程,worker 拿不到 WS 连接')
        return getGatewayStatus()
    }
    if (port === 0) {
        status = { state: 'disabled', host, port, reason: 'WECHAT_GATEWAY_PORT=0,网关已关闭' }
        logger.info('[wechat-gateway] WECHAT_GATEWAY_PORT=0,微信网关已关闭')
        return getGatewayStatus()
    }

    const candidate = new WeChatGateway({ port, host, logger })
    candidate.setSink(sink)
    try {
        await candidate.start()
    } catch (e) {
        status = { state: 'failed', host, port, reason: (e as Error).message }
        logger.error(`[wechat-gateway] 无法监听 ${host}:${port}: ${(e as Error).message}`)
        await candidate.stop().catch(() => {})
        return getGatewayStatus()
    }
    gateway = candidate
    registry.register(candidate)
    status = { state: 'running', host, port }
    logger.info(`[wechat-gateway] 已监听 ${host}:${port}(channel=${WECHAT_CHANNEL})`)
    return getGatewayStatus()
}

export const stopWeChatGateway = async (registry?: ChannelRegistry): Promise<void> => {
    const g = gateway
    gateway = undefined
    registry?.unregister(WECHAT_CHANNEL)
    if (g) await g.stop()
    status = { ...status, state: 'not_started', reason: undefined }
}
