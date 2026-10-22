import { StatusCodes } from 'http-status-codes'
import { ChannelSetting } from '../../database/entities/ChannelSetting'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import { InstanceDataSource } from '../channel-instances/core'

export const DEFAULT_SEND_RATE_LIMIT_PER_MINUTE = 20
export const MAX_SEND_RATE_LIMIT_PER_MINUTE = 1000
const CACHE_TTL_MS = 5000

export interface ChannelSettings {
    masterEnabled: boolean
    sendRateLimitPerMinute: number
}

export const DEFAULT_CHANNEL_SETTINGS: ChannelSettings = { masterEnabled: true, sendRateLimitPerMinute: DEFAULT_SEND_RATE_LIMIT_PER_MINUTE }

/** Per-workspace master switch and send rate limit, with a short read cache because every event and send reads it */
export const createChannelSettingsService = (getDataSource: () => InstanceDataSource, now: () => number = Date.now) => {
    const cache = new Map<string, { at: number; value: ChannelSettings }>()
    const repo = () => getDataSource().getRepository(ChannelSetting)

    const getSettings = async (workspaceId: string): Promise<ChannelSettings> => {
        const hit = cache.get(workspaceId)
        if (hit && now() - hit.at < CACHE_TTL_MS) return hit.value
        const row: ChannelSetting | null = await repo().findOne({ where: { workspaceId } })
        const value = row
            ? { masterEnabled: !!row.masterEnabled, sendRateLimitPerMinute: row.sendRateLimitPerMinute }
            : { ...DEFAULT_CHANNEL_SETTINGS }
        cache.set(workspaceId, { at: now(), value })
        return value
    }

    const updateSettings = async (workspaceId: string, patch: Partial<ChannelSettings>): Promise<ChannelSettings> => {
        if (patch.masterEnabled !== undefined && typeof patch.masterEnabled !== 'boolean') {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'masterEnabled must be a boolean')
        }
        if (patch.sendRateLimitPerMinute !== undefined) {
            const n = patch.sendRateLimitPerMinute
            if (!Number.isInteger(n) || n < 1 || n > MAX_SEND_RATE_LIMIT_PER_MINUTE) {
                throw new InternalFlowiseError(
                    StatusCodes.BAD_REQUEST,
                    `sendRateLimitPerMinute must be an integer between 1 and ${MAX_SEND_RATE_LIMIT_PER_MINUTE}`
                )
            }
        }
        const r = repo()
        let row: ChannelSetting | null = await r.findOne({ where: { workspaceId } })
        if (!row) row = r.create({ workspaceId, ...DEFAULT_CHANNEL_SETTINGS })
        if (patch.masterEnabled !== undefined) row!.masterEnabled = patch.masterEnabled
        if (patch.sendRateLimitPerMinute !== undefined) row!.sendRateLimitPerMinute = patch.sendRateLimitPerMinute
        await r.save(row)
        cache.delete(workspaceId)
        return getSettings(workspaceId)
    }

    return { getSettings, updateSettings }
}

export type ChannelSettingsService = ReturnType<typeof createChannelSettingsService>
