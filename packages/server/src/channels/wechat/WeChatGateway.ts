// WS server accepting AIHelpLib.dll reverse-dial connections. Implements the channel-agnostic ChannelAdapter:
// nodes and triggers only use it through ChannelRegistry, never through ws.
import { IncomingMessage } from 'http'
import { WebSocket, WebSocketServer } from 'ws'
import { ChannelAdapter, ChannelCallOutcome, ChannelInstanceRef, ChannelJobResult, ChannelSink } from '../types'
import { decodeMessageInsert } from './msgdecode'

export const WECHAT_CHANNEL = 'wechat'

export interface GatewayLogger {
    info(message: string): void
    warn(message: string): void
    error(message: string): void
}

const consoleLogger: GatewayLogger = {
    info: (m) => console.log(m),
    warn: (m) => console.warn(m),
    error: (m) => console.error(m)
}

export interface WeChatGatewayOptions {
    port: number
    host?: string
    logger?: GatewayLogger
    /** Wait for the binary frame of a voice.* response */
    binaryTimeoutMs?: number
    /** How long a terminal job state is remembered for waiters that register late */
    jobResultTtlMs?: number
}

interface ConnDiag {
    remote: string
    connectedAt: number
    pid: number | null
    wxid: string | null
    frames: number
    lastFrame: string
    closedAt?: number
}

interface ConnState {
    ws: WebSocket
    pid: number | null
    wxid: string | null
    identified: boolean
    lastSeen: number
    diag: ConnDiag
}

interface PendingBinary {
    resolve: (b: Buffer) => void
    timer: NodeJS.Timeout
}

export class WeChatGateway implements ChannelAdapter {
    readonly channel = WECHAT_CHANNEL
    /** Count of binary frames that matched no pending request, or whose request timed out */
    binaryDropped = 0
    binaryTimeoutMs: number

    private wss: WebSocketServer | null = null
    private conns = new Map<WebSocket, ConnState>()
    private rid = 0
    private pending = new Map<number, { resolve: (r: ChannelCallOutcome) => void; timer: NodeJS.Timeout }>()
    /** voice.* two-frame protocol: res declares binary:true, the next binary frame carries [8B LE id][bytes] */
    private pendingBinary = new Map<number, PendingBinary>()
    private sink: ChannelSink | null = null
    private diags: ConnDiag[] = []
    private silentPruneTimer: NodeJS.Timeout | null = null
    private connRateByIp = new Map<string, number[]>()
    private tracked = new Map<string, string>()
    private jobResults = new Map<string, { result: ChannelJobResult; at: number }>()
    private jobWaiters = new Map<string, Array<(r: ChannelJobResult) => void>>()
    private readonly log: GatewayLogger
    private readonly jobResultTtlMs: number

    constructor(private readonly options: WeChatGatewayOptions) {
        this.log = options.logger ?? consoleLogger
        this.binaryTimeoutMs = options.binaryTimeoutMs ?? 30_000
        this.jobResultTtlMs = options.jobResultTtlMs ?? 120_000
    }

    setSink(sink: ChannelSink): void {
        this.sink = sink
    }

    get port(): number {
        const addr = this.wss?.address()
        return addr && typeof addr === 'object' ? addr.port : this.options.port
    }

    get host(): string {
        return this.options.host ?? '127.0.0.1'
    }

    async start(): Promise<void> {
        const host = this.host
        await new Promise<void>((resolve, reject) => {
            const wss = new WebSocketServer({ host, port: this.options.port }, () => resolve())
            wss.on('error', (err: NodeJS.ErrnoException) => {
                if (err.code === 'EADDRINUSE') {
                    reject(new Error(`端口 ${this.options.port} 已被占用,请检查是否有其他程序(例如旧版 wx_workflow)在监听该端口`))
                } else {
                    reject(err)
                }
            })
            this.wss = wss
        })
        this.wss!.on('connection', (ws, req) => this.handleConn(ws, req))
        // anti-flood: terminate connections that never said hello within 60s
        this.silentPruneTimer = setInterval(() => this.pruneSilent(), 15_000)
        this.silentPruneTimer.unref?.()
    }

    stop(): Promise<void> {
        if (this.silentPruneTimer) clearInterval(this.silentPruneTimer)
        for (const [, p] of this.pending) clearTimeout(p.timer)
        this.pending.clear()
        for (const [, b] of this.pendingBinary) clearTimeout(b.timer)
        this.pendingBinary.clear()
        for (const [ws] of this.conns) {
            try {
                ws.terminate()
            } catch {
                /* ignore */
            }
        }
        this.conns.clear()
        return new Promise((resolve) => {
            if (!this.wss) return resolve()
            const t = setTimeout(resolve, 1000)
            t.unref?.()
            this.wss.close(() => {
                clearTimeout(t)
                resolve()
            })
        })
    }

    diag(): { live: ConnDiag[]; recent: ConnDiag[] } {
        return { live: [...this.conns.values()].map((c) => c.diag), recent: this.diags.slice(-50) }
    }

    // ---------- ChannelAdapter ----------

    pool(): ChannelInstanceRef[] {
        const seen = new Set<string>()
        const out: ChannelInstanceRef[] = []
        for (const c of this.conns.values()) {
            if (!c.identified || !c.wxid || seen.has(c.wxid)) continue
            seen.add(c.wxid)
            out.push({ instanceKey: c.wxid, online: true })
        }
        return out
    }

    trackJob(jobId: string, instance: string): void {
        // jobs whose job.done never arrives must not accumulate forever
        if (this.tracked.size >= 1000) this.tracked.delete(this.tracked.keys().next().value as string)
        this.tracked.set(jobId, instance)
    }

    waitForJob(jobId: string, timeoutMs: number): Promise<ChannelJobResult | null> {
        const done = this.jobResults.get(jobId)
        if (done) return Promise.resolve(done.result)
        return new Promise((resolve) => {
            const waiter = (r: ChannelJobResult) => {
                clearTimeout(timer)
                resolve(r)
            }
            const timer = setTimeout(() => {
                const list = (this.jobWaiters.get(jobId) ?? []).filter((w) => w !== waiter)
                if (list.length) this.jobWaiters.set(jobId, list)
                else this.jobWaiters.delete(jobId)
                resolve(null)
            }, timeoutMs)
            this.jobWaiters.set(jobId, [...(this.jobWaiters.get(jobId) ?? []), waiter])
        })
    }

    call(instance: string, method: string, params: Record<string, any>, timeoutMs = 15000): Promise<ChannelCallOutcome> {
        const conn = this.connFor(instance)
        if (!conn) {
            return Promise.resolve({ ok: false, error: { code: 503, message: '实例离线 (no_instance)' } })
        }
        const id = ++this.rid
        return new Promise<ChannelCallOutcome>((resolve) => {
            const timer = setTimeout(() => {
                this.pending.delete(id)
                resolve({ ok: false, error: { code: 504, message: `请求超时: ${method}` } })
            }, timeoutMs)
            this.pending.set(id, { resolve, timer })
            try {
                conn.ws.send(JSON.stringify({ type: 'req', id, method, params }))
            } catch (e) {
                clearTimeout(timer)
                this.pending.delete(id)
                resolve({ ok: false, error: { code: 502, message: `发送请求失败: ${(e as Error).message}` } })
            }
        })
    }

    /** voice.get via the two-frame binary protocol; other media kinds are not supported by the DLL */
    async fetchMedia(instance: string, kind: string, ref: string): Promise<ChannelCallOutcome & { data?: Buffer }> {
        if (kind !== 'voice') return { ok: false, error: { code: 400, message: `不支持的媒体类型: ${kind}` } }
        const res = await this.call(instance, 'voice.get', { svrid: ref }, 30_000)
        if (!res.ok) return res
        const data = (res.result as { data?: Buffer } | undefined)?.data
        if (!data || data.length === 0) {
            return { ok: false, error: { code: 504, message: '语音音频帧未到达(binary 超时或空载荷)' } }
        }
        return { ok: true, result: { contentType: (res.result as { contentType?: string }).contentType, size: data.length }, data }
    }

    // ---------- connection handling ----------

    private connFor(instance: string): ConnState | null {
        for (const c of this.conns.values()) {
            if (c.identified && c.wxid === instance) return c
        }
        return null
    }

    private pruneSilent(): void {
        const now = Date.now()
        let live = 0
        for (const [ws, c] of this.conns) {
            if (c.identified) continue
            if (now - c.lastSeen > 60_000) {
                this.log.info(`[wechat-gateway] prune silent conn ${c.diag.remote} (60s+ 无 hello)`)
                try {
                    ws.terminate()
                } catch {
                    /* ignore */
                }
                continue
            }
            live++
        }
        if (live > 16) {
            this.log.warn(`[wechat-gateway] 未识别连接过多 (${live}),全部断开等待重拨`)
            for (const [ws, c] of this.conns) {
                if (!c.identified) {
                    try {
                        ws.terminate()
                    } catch {
                        /* ignore */
                    }
                }
            }
        }
    }

    private handleConn(ws: WebSocket, req?: IncomingMessage): void {
        const remote = req?.socket ? `${req.socket.remoteAddress}:${req.socket.remotePort}` : '?'
        // rate fuse: at most 5 new connections per second per IP, so a client retry storm cannot exhaust ephemeral ports
        const ip = req?.socket?.remoteAddress ?? '?'
        const now = Date.now()
        const recent = (this.connRateByIp.get(ip) ?? []).filter((t) => now - t < 1000)
        if (recent.length >= 5) {
            this.log.warn(`[wechat-gateway] 速率保险丝: ${ip} 连接过快 (${recent.length}/s),拒绝`)
            try {
                ws.close(1013, 'rate limited')
            } catch {
                /* ignore */
            }
            return
        }
        recent.push(now)
        this.connRateByIp.set(ip, recent)

        const diag: ConnDiag = { remote, connectedAt: now, pid: null, wxid: null, frames: 0, lastFrame: '' }
        const conn: ConnState = { ws, pid: null, wxid: null, identified: false, lastSeen: now, diag }
        this.conns.set(ws, conn)
        this.log.info(`[wechat-gateway] +conn ${remote} (共 ${this.conns.size} 条)`)

        ws.on('message', (data, isBinary) => {
            diag.frames++
            if (isBinary) {
                diag.lastFrame = '<binary>'
                this.onBinaryFrame(data as Buffer)
                return
            }
            let msg: Record<string, any>
            try {
                msg = JSON.parse(data.toString())
            } catch {
                diag.lastFrame = '<invalid-json>'
                this.log.warn(`[wechat-gateway] ${remote} 非JSON帧,已忽略`)
                return
            }
            diag.lastFrame = String(msg.type ?? '?')
            conn.lastSeen = Date.now()
            this.handleFrame(conn, msg)
        })
        ws.on('close', (code) => {
            const wasOnline = conn.identified && conn.wxid
            this.conns.delete(ws)
            diag.closedAt = Date.now()
            this.diags.push(diag)
            if (this.diags.length > 200) this.diags.shift()
            this.log.info(`[wechat-gateway] -conn ${remote} code=${code} frames=${diag.frames} wxid=${diag.wxid ?? '?'}`)
            if (wasOnline) this.notifyPool()
        })
        ws.on('error', () => {
            /* close follows */
        })
    }

    private handleFrame(conn: ConnState, msg: Record<string, any>): void {
        switch (msg.type) {
            case 'hello':
                conn.pid = typeof msg.pid === 'number' ? msg.pid : null
                conn.identified = true
                conn.diag.pid = conn.pid
                this.log.info(`[wechat-gateway] hello pid=${conn.pid} version=${msg.version ?? '?'}`)
                return
            case 'identify':
                // The current handshake wins: identify always refreshes wxid, never reuses an old connection's mapping
                conn.wxid = typeof msg.wxid === 'string' && msg.wxid ? msg.wxid : null
                conn.diag.wxid = conn.wxid
                this.log.info(`[wechat-gateway] identify wxid=${conn.wxid} pid=${conn.pid ?? '?'}`)
                this.notifyPool()
                return
            case 'res':
                this.handleResponse(conn, msg)
                return
            case 'evt':
                this.handleEvent(conn, String(msg.event), msg.data)
                return
        }
    }

    private handleResponse(_conn: ConnState, msg: Record<string, any>): void {
        const id = Number(msg.id)
        const result = msg.result as { binary?: boolean; contentType?: string } | undefined
        const p = this.pending.get(id)
        if (!p) return
        this.pending.delete(id)
        clearTimeout(p.timer)
        if (msg.ok === true && result?.binary) {
            // two-frame protocol: hold the resolution until the binary frame arrives
            const timer = setTimeout(() => {
                const b = this.pendingBinary.get(id)
                if (b) {
                    this.pendingBinary.delete(id)
                    this.binaryDropped++
                    b.resolve(Buffer.alloc(0))
                }
            }, this.binaryTimeoutMs)
            timer.unref?.()
            this.pendingBinary.set(id, {
                timer,
                resolve: (buf) => p.resolve({ ok: true, result: { contentType: result.contentType, size: buf.length, data: buf } })
            })
            return
        }
        p.resolve(
            msg.ok === true ? { ok: true, result: msg.result } : { ok: false, error: msg.error ?? { code: 500, message: 'DLL 返回错误' } }
        )
    }

    /** Binary frame: [8B LE request id][payload] */
    private onBinaryFrame(data: Buffer): void {
        if (data.length < 8) {
            this.binaryDropped++
            return
        }
        const id = Number(data.readBigUInt64LE(0))
        const b = this.pendingBinary.get(id)
        if (!b) {
            this.binaryDropped++
            return
        }
        this.pendingBinary.delete(id)
        clearTimeout(b.timer)
        b.resolve(data.subarray(8))
    }

    private handleEvent(conn: ConnState, event: string, data: any): void {
        if (event === 'job.done') {
            this.handleJobDone(conn, data)
            return
        }
        const instance = conn.wxid
        if (!instance) {
            this.log.warn(`[wechat-gateway] 丢弃事件 ${event}: 连接尚未识别 wxid`)
            return
        }
        let payload: any = data
        if (event === 'msg.insert') {
            try {
                const decoded = decodeMessageInsert(data)
                if (!decoded.msg) {
                    this.log.warn(`[wechat-gateway] 丢弃无法解码的 msg.insert: ${decoded.warnings.join('; ') || '非消息操作'}`)
                    return
                }
                const { warnings, ...msg } = decoded.msg
                if (warnings.length) this.log.warn(`[wechat-gateway] msg.insert 解码警告: ${warnings.join('; ')}`)
                payload = msg
            } catch (e) {
                this.log.warn(`[wechat-gateway] 丢弃无法解码的 msg.insert: ${(e as Error).message}`)
                return
            }
        }
        try {
            this.sink?.onEvent({ channel: WECHAT_CHANNEL, instance, event, data: payload })
        } catch (e) {
            this.log.error(`[wechat-gateway] 事件处理失败 ${event}: ${(e as Error).message}`)
        }
    }

    private handleJobDone(conn: ConnState, data: any): void {
        if (!data || data.jobid === undefined) return
        const jobId = String(data.jobid)
        const result: ChannelJobResult =
            data.state === 'sent' ? { state: 'ok' } : { state: 'fail', error: data.error ? String(data.error) : undefined }
        const now = Date.now()
        this.jobResults.set(jobId, { result, at: now })
        for (const [k, v] of this.jobResults) {
            if (now - v.at > this.jobResultTtlMs) this.jobResults.delete(k)
        }
        for (const w of this.jobWaiters.get(jobId) ?? []) w(result)
        this.jobWaiters.delete(jobId)
        const instance = this.tracked.get(jobId) ?? conn.wxid ?? ''
        this.tracked.delete(jobId)
        try {
            this.sink?.onJobDone(WECHAT_CHANNEL, jobId, result, instance)
        } catch (e) {
            this.log.error(`[wechat-gateway] job.done 处理失败: ${(e as Error).message}`)
        }
    }

    private notifyPool(): void {
        try {
            this.sink?.onInstanceChange(WECHAT_CHANNEL, this.pool())
        } catch (e) {
            this.log.error(`[wechat-gateway] 实例变更处理失败: ${(e as Error).message}`)
        }
    }
}
