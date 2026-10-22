import { ChannelAdapter, ChannelCallOutcome, ChannelEvent, ChannelInstanceRef, ChannelJobResult, ChannelSink } from './types'

export interface RecordedCall {
    instance: string
    method: string
    params: Record<string, any>
}

/**
 * In-memory adapter for tests: records calls, answers with scripted outcomes, simulates job terminal
 * states and pushes events into a sink. Nodes and triggers can be tested with it alone.
 */
export class MockChannelAdapter implements ChannelAdapter {
    calls: RecordedCall[] = []
    instances: ChannelInstanceRef[] = []
    /** Per-method override of the default outcome (a function may return a different outcome per call) */
    responses = new Map<string, ChannelCallOutcome | ((call: RecordedCall) => ChannelCallOutcome)>()
    /** Terminal states keyed by jobId; jobs without an entry never finish (simulates a timeout) */
    private jobResults = new Map<string, ChannelJobResult>()
    private waiters = new Map<string, Array<(r: ChannelJobResult | null) => void>>()
    private sink?: ChannelSink
    private nextJob = 1
    /** Terminal state assigned to every job created by call(); undefined = never finishes */
    autoJobResult: ChannelJobResult | undefined = { state: 'ok' }
    media = new Map<string, Buffer>()

    constructor(public readonly channel: string = 'wechat') {}

    setSink(sink: ChannelSink): void {
        this.sink = sink
    }

    addInstance(instanceKey: string, online = true, displayName?: string): void {
        this.instances = this.instances.filter((i) => i.instanceKey !== instanceKey)
        this.instances.push({ instanceKey, online, displayName })
        this.sink?.onInstanceChange(this.channel, this.pool())
    }

    setOnline(instanceKey: string, online: boolean): void {
        const inst = this.instances.find((i) => i.instanceKey === instanceKey)
        if (inst) inst.online = online
        this.sink?.onInstanceChange(this.channel, this.pool())
    }

    pool(): ChannelInstanceRef[] {
        return this.instances.map((i) => ({ ...i }))
    }

    async call(instance: string, method: string, params: Record<string, any>): Promise<ChannelCallOutcome> {
        const call = { instance, method, params }
        this.calls.push(call)
        if (!this.instances.some((i) => i.instanceKey === instance && i.online)) {
            return { ok: false, error: { code: 503, message: '实例离线 (no_instance)' } }
        }
        const scripted = this.responses.get(method)
        if (scripted) return typeof scripted === 'function' ? scripted(call) : scripted
        const jobid = `job-${this.nextJob++}`
        if (this.autoJobResult) this.finishJob(jobid, this.autoJobResult)
        return { ok: true, result: { jobid } }
    }

    trackJob(): void {}

    waitForJob(jobId: string, timeoutMs: number): Promise<ChannelJobResult | null> {
        const done = this.jobResults.get(jobId)
        if (done) return Promise.resolve(done)
        return new Promise((resolve) => {
            const timer = setTimeout(() => resolve(null), timeoutMs)
            const list = this.waiters.get(jobId) ?? []
            list.push((r) => {
                clearTimeout(timer)
                resolve(r)
            })
            this.waiters.set(jobId, list)
        })
    }

    /** Simulate job.done */
    finishJob(jobId: string, result: ChannelJobResult, instance = ''): void {
        this.jobResults.set(jobId, result)
        for (const w of this.waiters.get(jobId) ?? []) w(result)
        this.waiters.delete(jobId)
        this.sink?.onJobDone(this.channel, jobId, result, instance)
    }

    async fetchMedia(_instance: string, kind: string, ref: string): Promise<ChannelCallOutcome & { data?: Buffer }> {
        const data = this.media.get(`${kind}:${ref}`)
        if (!data) return { ok: false, error: { code: 404, message: 'media not found' } }
        return { ok: true, result: { size: data.length }, data }
    }

    /** Simulate the channel pushing an event to the sink */
    emit(instance: string, event: string, data: any): void {
        const e: ChannelEvent = { channel: this.channel, instance, event, data }
        this.sink?.onEvent(e)
    }
}
