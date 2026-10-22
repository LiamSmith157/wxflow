import net from 'net'
import { WebSocket } from 'ws'
import { ChannelHub } from '../ChannelHub'
import { ChannelRegistry } from '../ChannelRegistry'
import { getGatewayStatus, getWeChatGateway, startWeChatGateway, stopWeChatGateway } from './gatewayService'

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
const registry = new ChannelRegistry()
const sink = new ChannelHub()

const freePort = (): Promise<number> =>
    new Promise((resolve) => {
        const s = net.createServer().listen(0, '127.0.0.1', () => {
            const port = (s.address() as net.AddressInfo).port
            s.close(() => resolve(port))
        })
    })

const canConnect = (url: string): Promise<boolean> =>
    new Promise((resolve) => {
        const ws = new WebSocket(url)
        ws.once('open', () => {
            ws.terminate()
            resolve(true)
        })
        ws.once('error', () => resolve(false))
    })

afterEach(async () => {
    await stopWeChatGateway(registry)
    jest.clearAllMocks()
})

describe('startWeChatGateway', () => {
    it('listens on the configured host/port and registers the adapter', async () => {
        const port = await freePort()
        const status = await startWeChatGateway({ registry, sink, logger, env: { WECHAT_GATEWAY_PORT: String(port) } })
        expect(status).toEqual({ state: 'running', host: '127.0.0.1', port })
        expect(registry.get('wechat')).toBe(getWeChatGateway())
        expect(await canConnect(`ws://127.0.0.1:${port}`)).toBe(true)
        expect(getGatewayStatus().state).toBe('running')
    })

    it('does not start when the port is 0', async () => {
        const status = await startWeChatGateway({ registry, sink, logger, env: { WECHAT_GATEWAY_PORT: '0' } })
        expect(status.state).toBe('disabled')
        expect(registry.has('wechat')).toBe(false)
        expect(getWeChatGateway()).toBeUndefined()
    })

    it('does not start in queue mode and says why', async () => {
        const status = await startWeChatGateway({ registry, sink, logger, env: { MODE: 'queue', WECHAT_GATEWAY_PORT: '56233' } })
        expect(status.state).toBe('queue_mode')
        expect(status.reason).toBe('队列模式下不可用')
        expect(registry.has('wechat')).toBe(false)
        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('队列模式'))
    })

    it('logs a bind failure and keeps going instead of throwing', async () => {
        const port = await freePort()
        const blocker = net.createServer()
        await new Promise<void>((resolve) => blocker.listen(port, '127.0.0.1', () => resolve()))
        try {
            const status = await startWeChatGateway({ registry, sink, logger, env: { WECHAT_GATEWAY_PORT: String(port) } })
            expect(status.state).toBe('failed')
            expect(status.port).toBe(port)
            expect(status.reason).toContain('已被占用')
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(String(port)))
            expect(registry.has('wechat')).toBe(false)
        } finally {
            blocker.close()
        }
    })

    it('rejects an invalid port value as a failed status', async () => {
        const status = await startWeChatGateway({ registry, sink, logger, env: { WECHAT_GATEWAY_PORT: 'abc' } })
        expect(status.state).toBe('failed')
        expect(status.reason).toContain('WECHAT_GATEWAY_PORT')
    })

    it('uses 127.0.0.1:56233 by default (loopback only)', async () => {
        // default port may be taken on a dev machine; only assert the resolved configuration
        const status = await startWeChatGateway({ registry, sink, logger, env: {} })
        expect(status.host).toBe('127.0.0.1')
        expect(status.port).toBe(56233)
    })
})

describe('gateway status with media directory self-check', () => {
    it('keeps the server up and reports an unusable media directory in the status', async () => {
        const { setMediaDirCheck } = await import('./gatewayService')
        setMediaDirCheck({ ok: false, error: '媒体目录不可用: D:\\x(EACCES),请检查该目录的权限和磁盘空间' })
        try {
            const port = await freePort()
            const status = await startWeChatGateway({ registry, sink, logger, env: { WECHAT_GATEWAY_PORT: String(port) } })
            expect(status.state).toBe('running')
            expect(status.media?.ok).toBe(false)
            expect(status.media?.error).toContain('媒体目录不可用')
        } finally {
            setMediaDirCheck(undefined)
        }
    })
})
