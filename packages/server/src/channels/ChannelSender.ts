import { ChannelRegistry } from './ChannelRegistry'

export type SendState = 'ok' | 'fail' | 'pending' | 'rate_limited' | 'skipped'

export interface SendResult {
    state: SendState
    jobId?: string
    error?: string
    /** Raw result of the channel call, when it was made */
    result?: any
}

export interface SendRequest {
    channel: string
    instance: string
    workspaceId: string
    method: string
    params: Record<string, any>
    /** How long to wait for the asynchronous terminal state */
    waitMs: number
    callTimeoutMs?: number
}

export interface SenderSettings {
    masterEnabled: boolean
    sendRateLimitPerMinute: number
}

export interface ChannelSenderDeps {
    registry: ChannelRegistry
    getSettings(workspaceId: string): Promise<SenderSettings>
    now?: () => number
}

const WINDOW_MS = 60_000

/**
 * The single path for sending through a channel. It applies the two safety valves every channel shares:
 * the workspace master switch (off: nothing is sent, the result is "skipped") and the per-instance send rate
 * limit (exceeded: nothing is sent, the result is "rate_limited"). Neither is an error, the flow carries on.
 */
export const createChannelSender = ({ registry, getSettings, now = Date.now }: ChannelSenderDeps) => {
    /** channel:instance -> send timestamps within the last minute */
    const sent = new Map<string, number[]>()

    const takeSlot = (key: string, limit: number): boolean => {
        const t = now()
        const recent = (sent.get(key) ?? []).filter((ts) => t - ts < WINDOW_MS)
        if (recent.length >= limit) {
            sent.set(key, recent)
            return false
        }
        recent.push(t)
        sent.set(key, recent)
        return true
    }

    const send = async (req: SendRequest): Promise<SendResult> => {
        const settings = await getSettings(req.workspaceId)
        if (!settings.masterEnabled) return { state: 'skipped', error: '渠道总闸已关闭,未发送' }
        if (!takeSlot(`${req.channel}:${req.instance}`, settings.sendRateLimitPerMinute)) {
            return { state: 'rate_limited', error: `发送过于频繁,已超过每分钟 ${settings.sendRateLimitPerMinute} 次的限制,未发送` }
        }
        const adapter = registry.get(req.channel)
        const outcome = await adapter.call(req.instance, req.method, req.params, req.callTimeoutMs)
        if (!outcome.ok) return { state: 'fail', error: outcome.error?.message ?? `${req.method} 调用失败` }
        const jobId = outcome.result?.jobid !== undefined && outcome.result?.jobid !== null ? String(outcome.result.jobid) : undefined
        if (!jobId) return { state: 'ok', result: outcome.result }
        adapter.trackJob(jobId, req.instance)
        const terminal = await adapter.waitForJob(jobId, req.waitMs)
        if (!terminal) return { state: 'pending', jobId, result: outcome.result }
        return terminal.state === 'ok'
            ? { state: 'ok', jobId, result: outcome.result }
            : { state: 'fail', jobId, error: terminal.error ?? '发送失败', result: outcome.result }
    }

    return { send }
}

export type ChannelSender = ReturnType<typeof createChannelSender>
