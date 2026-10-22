/** Channel-agnostic contracts shared by every channel (WeChat now, WhatsApp later). */

export interface ChannelInstanceRef {
    /** Channel-specific identity (wxid for WeChat); null until the instance has identified itself */
    instanceKey: string | null
    displayName?: string
    online: boolean
}

export interface ChannelCallError {
    code: number
    message: string
}

export interface ChannelCallOutcome {
    ok: boolean
    result?: any
    error?: ChannelCallError
}

/** Terminal state of an asynchronous send job */
export interface ChannelJobResult {
    state: 'ok' | 'fail'
    error?: string
}

/** Unified event shape handed from an adapter to the channel layer */
export interface ChannelEvent {
    channel: string
    instance: string
    event: string
    data: any
}

export interface ChannelAdapter {
    readonly channel: string
    call(instance: string, method: string, params: Record<string, any>, timeoutMs?: number): Promise<ChannelCallOutcome>
    pool(): ChannelInstanceRef[]
    /** Register interest in a job so its terminal state can be delivered to waiters and the sink */
    trackJob(jobId: string, instance: string): void
    /** Resolve with the job's terminal state, or null if it does not arrive within timeoutMs */
    waitForJob(jobId: string, timeoutMs: number): Promise<ChannelJobResult | null>
    /** Fetch media bytes from the channel (WeChat voice goes through the voice.* two-frame protocol) */
    fetchMedia?(instance: string, kind: string, ref: string): Promise<ChannelCallOutcome & { data?: Buffer }>
}

/** What the channel layer receives from adapters */
export interface ChannelSink {
    onEvent(event: ChannelEvent): void
    onInstanceChange(channel: string, pool: ChannelInstanceRef[]): void
    onJobDone(channel: string, jobId: string, result: ChannelJobResult, instance: string): void
}
