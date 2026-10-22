import { WebSocket } from 'ws'
import { ChannelEvent, ChannelInstanceRef, ChannelJobResult } from '../types'
import { WeChatGateway } from './WeChatGateway'

const silentLogger = { info: () => {}, warn: () => {}, error: () => {} }

interface Harness {
    gateway: WeChatGateway
    events: ChannelEvent[]
    pools: ChannelInstanceRef[][]
    jobs: Array<[string, ChannelJobResult, string]>
}

const clients: WebSocket[] = []
const gateways: WeChatGateway[] = []

const startGateway = async (opts: { binaryTimeoutMs?: number; jobResultTtlMs?: number } = {}): Promise<Harness> => {
    const gateway = new WeChatGateway({ port: 0, host: '127.0.0.1', logger: silentLogger, ...opts })
    const h: Harness = { gateway, events: [], pools: [], jobs: [] }
    gateway.setSink({
        onEvent: (e) => h.events.push(e),
        onInstanceChange: (_c, pool) => h.pools.push(pool),
        onJobDone: (_c, id, r, inst) => h.jobs.push([id, r, inst])
    })
    await gateway.start()
    gateways.push(gateway)
    return h
}

const connect = (port: number): Promise<WebSocket> =>
    new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}`)
        clients.push(ws)
        ws.once('open', () => resolve(ws))
        ws.once('error', reject)
    })

const send = (ws: WebSocket, obj: unknown) => ws.send(JSON.stringify(obj))

const nextMessage = (ws: WebSocket, timeoutMs = 3000): Promise<any> =>
    new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('等待消息超时')), timeoutMs)
        ws.once('message', (data) => {
            clearTimeout(t)
            resolve(JSON.parse(data.toString()))
        })
    })

const waitFor = async (cond: () => boolean, timeoutMs = 2000) => {
    const start = Date.now()
    while (!cond()) {
        if (Date.now() - start > timeoutMs) throw new Error('waitFor 超时')
        await new Promise((r) => setTimeout(r, 10))
    }
}

/** A simulated DLL: connects, says hello and identifies itself */
const dial = async (h: Harness, wxid: string, pid = 1000): Promise<WebSocket> => {
    const dll = await connect(h.gateway.port)
    send(dll, { type: 'hello', pid, version: '0.23.0' })
    send(dll, { type: 'identify', wxid })
    await waitFor(() => h.gateway.pool().some((i) => i.instanceKey === wxid))
    return dll
}

afterEach(async () => {
    for (const c of clients.splice(0)) c.terminate()
    for (const g of gateways.splice(0)) await g.stop()
})

describe('WeChatGateway', () => {
    it('reports a port conflict with guidance', async () => {
        const h = await startGateway()
        const g2 = new WeChatGateway({ port: h.gateway.port, host: '127.0.0.1', logger: silentLogger })
        await expect(g2.start()).rejects.toThrow(/已被占用/)
        await g2.stop()
    })

    it('marks an instance online after hello+identify and offline on disconnect', async () => {
        const h = await startGateway()
        const dll = await dial(h, 'wxid_test')
        expect(h.gateway.pool()).toEqual([{ instanceKey: 'wxid_test', online: true }])
        expect(h.pools[h.pools.length - 1]).toEqual([{ instanceKey: 'wxid_test', online: true }])
        dll.close()
        await waitFor(() => h.gateway.pool().length === 0)
        expect(h.pools[h.pools.length - 1]).toEqual([])
        const res = await h.gateway.call('wxid_test', 'send.text', {})
        expect(res.ok).toBe(false)
        expect(res.error!.message).toContain('实例离线')
    })

    it('does not carry a wxid over to a reconnect', async () => {
        const h = await startGateway()
        const dll = await dial(h, 'wxid_old', 1)
        dll.close()
        await waitFor(() => h.gateway.pool().length === 0)
        const dll2 = await connect(h.gateway.port)
        send(dll2, { type: 'hello', pid: 2 })
        await new Promise((r) => setTimeout(r, 80))
        expect(h.gateway.pool()).toEqual([])
    })

    it('answers a call with the DLL result (jobid)', async () => {
        const h = await startGateway()
        const dll = await dial(h, 'wxid_test')
        const p = h.gateway.call('wxid_test', 'send.text', { wxid: 'filehelper', content: 'hi' })
        const req = await nextMessage(dll)
        expect(req).toMatchObject({ type: 'req', method: 'send.text', params: { wxid: 'filehelper', content: 'hi' } })
        send(dll, { type: 'res', id: req.id, ok: true, result: { jobid: 'j1' } })
        await expect(p).resolves.toEqual({ ok: true, result: { jobid: 'j1' } })
    })

    it('returns the DLL error as a failed outcome', async () => {
        const h = await startGateway()
        const dll = await dial(h, 'wxid_test')
        const p = h.gateway.call('wxid_test', 'send.text', {})
        const req = await nextMessage(dll)
        send(dll, { type: 'res', id: req.id, ok: false, error: { code: 400, message: 'bad' } })
        await expect(p).resolves.toEqual({ ok: false, error: { code: 400, message: 'bad' } })
    })

    it('times out a call that gets no response', async () => {
        const h = await startGateway()
        await dial(h, 'wxid_test')
        const res = await h.gateway.call('wxid_test', 'status.get', {}, 150)
        expect(res.ok).toBe(false)
        expect(res.error!.code).toBe(504)
        expect(res.error!.message).toContain('超时')
    })

    it('delivers the terminal state of a tracked job to a waiter and the sink', async () => {
        const h = await startGateway()
        const dll = await dial(h, 'wxid_test')
        h.gateway.trackJob('j9', 'wxid_test')
        const waiting = h.gateway.waitForJob('j9', 2000)
        send(dll, { type: 'evt', seq: 1, event: 'job.done', data: { jobid: 'j9', state: 'sent' } })
        await expect(waiting).resolves.toEqual({ state: 'ok' })
        expect(h.jobs).toEqual([['j9', { state: 'ok' }, 'wxid_test']])
    })

    it('reports a failed job with its error, and remembers results for late waiters', async () => {
        const h = await startGateway()
        const dll = await dial(h, 'wxid_test')
        send(dll, { type: 'evt', seq: 1, event: 'job.done', data: { jobid: 7, state: 'failed', error: '对方不是好友' } })
        await waitFor(() => h.jobs.length === 1)
        await expect(h.gateway.waitForJob('7', 50)).resolves.toEqual({ state: 'fail', error: '对方不是好友' })
    })

    it('returns null when no terminal state arrives in time', async () => {
        const h = await startGateway()
        await expect(h.gateway.waitForJob('never', 50)).resolves.toBeNull()
    })

    it('forwards events with the instance attribution', async () => {
        const h = await startGateway()
        const dll = await dial(h, 'wxid_test')
        send(dll, { type: 'evt', seq: 1, event: 'session.switch', data: { from: '', to: 'filehelper' } })
        await waitFor(() => h.events.length === 1)
        expect(h.events[0]).toEqual({
            channel: 'wechat',
            instance: 'wxid_test',
            event: 'session.switch',
            data: { from: '', to: 'filehelper' }
        })
    })

    it('decodes a compressed msg.insert into the unified event structure', async () => {
        const h = await startGateway()
        const dll = await dial(h, 'wxid_test')
        send(dll, {
            type: 'evt',
            seq: 2,
            event: 'msg.insert',
            data: {
                op: 'insert',
                table: 'Msg_abcd',
                talker: 'wxid_friend',
                sender: 'wxid_friend',
                direction: 'in',
                row: {
                    local_id: '1',
                    server_id: '8970001234567890123',
                    local_type: '1',
                    sort_seq: '1754300000123',
                    message_content: { b64: Buffer.from('报价多少', 'utf-8').toString('base64'), enc: 'raw', n: 12 }
                }
            }
        })
        await waitFor(() => h.events.length === 1)
        const e = h.events[0]
        expect(e.channel).toBe('wechat')
        expect(e.instance).toBe('wxid_test')
        expect(e.event).toBe('msg.insert')
        expect(e.data).toMatchObject({
            talker: 'wxid_friend',
            sender: 'wxid_friend',
            msgType: 1,
            content: '报价多少',
            direction: 'in',
            svrid: '8970001234567890123'
        })
    })

    it('drops an undecodable msg.insert and keeps the connection', async () => {
        const h = await startGateway()
        const dll = await dial(h, 'wxid_test')
        send(dll, { type: 'evt', seq: 3, event: 'msg.insert', data: 'garbage' })
        send(dll, { type: 'evt', seq: 4, event: 'msg.insert', data: { op: 'insert' } })
        dll.send('this is not json')
        send(dll, { type: 'evt', seq: 5, event: 'session.switch', data: { to: 'x' } })
        await waitFor(() => h.events.length === 1)
        expect(h.events.map((e) => e.event)).toEqual(['session.switch'])
        expect(h.gateway.pool()).toEqual([{ instanceKey: 'wxid_test', online: true }])
    })

    describe('fetchMedia (voice.* two-frame protocol)', () => {
        it('returns the audio bytes of a voice message', async () => {
            const h = await startGateway()
            const dll = await dial(h, 'wxid_test')
            const wav = Buffer.from('RIFF-FAKE-WAV-DATA')
            const p = h.gateway.fetchMedia('wxid_test', 'voice', '88001122')
            const req = await nextMessage(dll)
            expect(req.method).toBe('voice.get')
            expect(req.params.svrid).toBe('88001122')
            const binId = Buffer.alloc(8)
            binId.writeBigUInt64LE(BigInt(req.id))
            dll.send(
                JSON.stringify({ type: 'res', id: req.id, ok: true, result: { binary: true, contentType: 'audio/wav', size: wav.length } })
            )
            dll.send(Buffer.concat([binId, wav]))
            const res = await p
            expect(res.ok).toBe(true)
            expect(res.data!.toString()).toBe('RIFF-FAKE-WAV-DATA')
            expect((res.result as any).contentType).toBe('audio/wav')
            expect(h.gateway.binaryDropped).toBe(0)
        })

        it('fails when the DLL reports an error', async () => {
            const h = await startGateway()
            const dll = await dial(h, 'wxid_test')
            const p = h.gateway.fetchMedia('wxid_test', 'voice', 'missing')
            const req = await nextMessage(dll)
            send(dll, { type: 'res', id: req.id, ok: false, error: { code: 404, message: '无此记录' } })
            const res = await p
            expect(res.ok).toBe(false)
            expect(res.error!.code).toBe(404)
        })

        it('fails when the binary frame never arrives, and drops unmatched frames', async () => {
            const h = await startGateway({ binaryTimeoutMs: 200 })
            const dll = await dial(h, 'wxid_test')
            dll.send(Buffer.concat([Buffer.alloc(8), Buffer.from('junk')]))
            await waitFor(() => h.gateway.binaryDropped === 1)
            const p = h.gateway.fetchMedia('wxid_test', 'voice', 'ghost')
            const req = await nextMessage(dll)
            send(dll, { type: 'res', id: req.id, ok: true, result: { binary: true, contentType: 'audio/wav', size: 10 } })
            const res = await p
            expect(res.ok).toBe(false)
            expect(res.error!.message).toContain('binary')
            expect(h.gateway.binaryDropped).toBe(2)
        })

        it('rejects unsupported media kinds', async () => {
            const h = await startGateway()
            const res = await h.gateway.fetchMedia('wxid_test', 'image', 'x')
            expect(res.ok).toBe(false)
        })
    })
})
