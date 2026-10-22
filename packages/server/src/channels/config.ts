import { getExchangeConfig, ExchangeConfig } from './media/exchange'
import { parseRetentionDays } from './media/cleanup'

export const DEFAULT_MEDIA_MAX_MB = 50
export const DEFAULT_SEND_WAIT_SECONDS = 30

export interface ChannelConfig {
    exchange: ExchangeConfig
    maxDownloadBytes: number
    sendWaitSeconds: number
    fetchedRetentionDays: number
}

const positive = (raw: string | undefined, fallback: number): number => {
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? n : fallback
}

export const getChannelConfig = (env: NodeJS.ProcessEnv = process.env): ChannelConfig => ({
    exchange: getExchangeConfig(env),
    maxDownloadBytes: Math.round(positive(env.WECHAT_MEDIA_MAX_MB, DEFAULT_MEDIA_MAX_MB) * 1024 * 1024),
    sendWaitSeconds: positive(env.WECHAT_SEND_WAIT_SECONDS, DEFAULT_SEND_WAIT_SECONDS),
    fetchedRetentionDays: parseRetentionDays(env.WECHAT_FETCHED_RETENTION_DAYS)
})
