import fs from 'fs'
import os from 'os'
import path from 'path'
import { ChannelRegistry } from './ChannelRegistry'
import { createChannelSender } from './ChannelSender'
import { ChannelConfig } from './config'
import { MediaResolver } from './media/resolver'
import { MockChannelAdapter } from './MockChannelAdapter'
import { createChannelRuntime } from './runtime'
import { GatewayStatus } from './wechat/gatewayService'

jest.mock('wxflow-components', () => ({ secureAxiosRequest: jest.fn() }))

let root: string
let status: GatewayStatus

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'wxflow-runtime-'))
    for (const d of ['assets', 'tmp', 'images', 'voice']) fs.mkdirSync(path.join(root, d))
    status = { state: 'running', host: '127.0.0.1', port: 56233 }
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

const setup = (
    opts: { register?: boolean; workspaceInstances?: string[]; settings?: { masterEnabled: boolean; sendRateLimitPerMinute: number } } = {}
) => {
    const adapter = new MockChannelAdapter()
    adapter.addInstance('wxid_a')
    adapter.addInstance('wxid_off', false)
    const registry = new ChannelRegistry()
    if (opts.register !== false) registry.register(adapter)
    const settings = opts.settings ?? { masterEnabled: true, sendRateLimitPerMinute: 20 }
    const config: ChannelConfig = {
        exchange: { dir: root, hostDir: 'C:\\wxflow\\exchange', mapped: true },
        maxDownloadBytes: 1024,
        sendWaitSeconds: 1,
        fetchedRetentionDays: 7
    }
    const deps = {
        registry,
        sender: createChannelSender({ registry, getSettings: async () => settings }),
        resolver: new MediaResolver(),
        config,
        listWorkspaceInstances: async (ws: string) =>
            (ws === 'wsA' ? opts.workspaceInstances ?? ['wxid_a', 'wxid_off'] : []).map((k) => ({ instanceKey: k, displayName: k })),
        gatewayStatus: () => status
    }
    const runtime = (event?: Record<string, any>, workspaceId = 'wsA') => createChannelRuntime(deps, { workspaceId, event })
    return { adapter, runtime }
}

describe('channel runtime handle', () => {
    it('exposes the workspace and the triggering event to nodes', () => {
        const { runtime } = setup()
        const rt = runtime({ channel: 'wechat', instance: 'wxid_a', event: 'msg.insert' })
        expect(rt.workspaceId).toBe('wsA')
        expect(rt.event).toMatchObject({ event: 'msg.insert' })
        expect(runtime().event).toBeUndefined()
        expect(runtime({}).event).toBeUndefined()
    })

    describe('resolveInstance', () => {
        it('defaults to the instance of the triggering event', async () => {
            const { runtime } = setup()
            await expect(runtime({ channel: 'wechat', instance: 'wxid_a' }).resolveInstance('wechat')).resolves.toBe('wxid_a')
        })

        it('prefers the instance the node asks for over the triggering one', async () => {
            const { runtime, adapter } = setup({ workspaceInstances: ['wxid_a', 'wxid_b'] })
            adapter.addInstance('wxid_b')
            await expect(runtime({ channel: 'wechat', instance: 'wxid_a' }).resolveInstance('wechat', 'wxid_b')).resolves.toBe('wxid_b')
        })

        it('fails when nothing says which instance to use', async () => {
            const { runtime } = setup()
            await expect(runtime().resolveInstance('wechat')).rejects.toThrow('没有可用的实例')
        })

        it('only accepts instances of the run workspace', async () => {
            const { runtime } = setup()
            await expect(runtime({ channel: 'wechat', instance: 'wxid_a' }, 'wsB').resolveInstance('wechat')).rejects.toThrow(
                '不属于当前工作区'
            )
            await expect(runtime(undefined, 'wsA').resolveInstance('wechat', 'wxid_stranger')).rejects.toThrow('不属于当前工作区')
        })

        it('fails with a clear message when the instance is offline', async () => {
            const { runtime } = setup()
            await expect(runtime(undefined).resolveInstance('wechat', 'wxid_off')).rejects.toThrow('离线')
        })

        it.each([
            ['queue_mode', '队列模式'],
            ['disabled', '已关闭'],
            ['failed', '端口已被占用']
        ] as const)('explains why the gateway is not running (%s)', async (state, text) => {
            const { runtime } = setup({ register: false })
            status = { state, host: '127.0.0.1', port: 56233, reason: '端口已被占用' }
            await expect(runtime({ channel: 'wechat', instance: 'wxid_a' }).resolveInstance('wechat')).rejects.toThrow(text)
        })
    })

    it('lists the workspace instances with their online state', async () => {
        const { runtime } = setup()
        expect(await runtime().listInstances('wechat')).toEqual([
            { instanceKey: 'wxid_a', displayName: 'wxid_a', online: true },
            { instanceKey: 'wxid_off', displayName: 'wxid_off', online: false }
        ])
        expect(await runtime(undefined, 'wsB').listInstances('wechat')).toEqual([])
    })

    describe('send', () => {
        it('sends through the adapter and reports the terminal state', async () => {
            const { runtime, adapter } = setup()
            const r = await runtime().send({
                channel: 'wechat',
                instance: 'wxid_a',
                method: 'send.text',
                params: { wxid: 'x', content: 'hi' }
            })
            expect(r).toMatchObject({ state: 'ok', jobId: 'job-1' })
            expect(adapter.calls[0]).toMatchObject({ instance: 'wxid_a', method: 'send.text' })
        })

        it('applies the master switch and the rate limit', async () => {
            const off = setup({ settings: { masterEnabled: false, sendRateLimitPerMinute: 20 } })
            expect((await off.runtime().send({ channel: 'wechat', instance: 'wxid_a', method: 'send.text', params: {} })).state).toBe(
                'skipped'
            )
            expect(off.adapter.calls).toEqual([])

            const limited = setup({ settings: { masterEnabled: true, sendRateLimitPerMinute: 1 } })
            const rt = limited.runtime()
            const req = { channel: 'wechat', instance: 'wxid_a', method: 'send.text', params: {} }
            expect((await rt.send(req)).state).toBe('ok')
            expect((await rt.send(req)).state).toBe('rate_limited')
            expect(limited.adapter.calls).toHaveLength(1)
        })

        it('reports a failed send when the gateway is not running', async () => {
            const { runtime } = setup({ register: false })
            status = { state: 'queue_mode', host: '127.0.0.1', port: 56233, reason: '队列模式下不可用' }
            const r = await runtime().send({ channel: 'wechat', instance: 'wxid_a', method: 'send.text', params: {} })
            expect(r.state).toBe('fail')
            expect(r.error).toContain('队列模式')
        })
    })

    it('forwards plain calls and media fetches to the adapter', async () => {
        const { runtime, adapter } = setup()
        adapter.responses.set('contacts.avatar', { ok: true, result: { nick: 'Alice' } })
        adapter.media.set('voice:123', Buffer.from('WAV'))
        const rt = runtime()
        expect((await rt.call('wechat', 'wxid_a', 'contacts.avatar', { wxid: 'w' })).result).toEqual({ nick: 'Alice' })
        expect((await rt.fetchMedia('wechat', 'wxid_a', 'voice', '123')).data?.toString()).toBe('WAV')
    })

    it('reports an unavailable gateway for calls and media instead of throwing', async () => {
        const { runtime } = setup({ register: false })
        status = { state: 'disabled', host: '127.0.0.1', port: 0 }
        expect((await runtime().call('wechat', 'wxid_a', 'contacts.list', {})).error?.message).toContain('已关闭')
        expect((await runtime().fetchMedia('wechat', 'wxid_a', 'voice', '1')).ok).toBe(false)
    })

    describe('media', () => {
        it('resolves an asset to its Windows path and keeps the file on release', async () => {
            const { runtime } = setup()
            fs.writeFileSync(path.join(root, 'assets', 'a.jpg'), 'x')
            const rt = runtime()
            const media = await rt.resolveMedia('a.jpg')
            expect(media.hostPath).toBe('C:\\wxflow\\exchange\\assets\\a.jpg')
            await rt.releaseMedia(media)
            expect(fs.existsSync(path.join(root, 'assets', 'a.jpg'))).toBe(true)
        })

        it('removes a temporary download on release', async () => {
            const { runtime } = setup()
            const tmp = path.join(root, 'tmp', 't.png')
            fs.writeFileSync(tmp, 'x')
            await runtime().releaseMedia({ path: tmp, hostPath: 'C:\\x', temporary: true })
            expect(fs.existsSync(tmp)).toBe(false)
        })

        it('reports a missing asset with the Windows folder to check', async () => {
            const { runtime } = setup()
            await expect(runtime().resolveMedia('海报/nope.jpg')).rejects.toThrow('请检查 `C:\\wxflow\\exchange\\assets` 目录')
        })

        it('maps directories and DLL paths between the two views', () => {
            const { runtime } = setup()
            const rt = runtime()
            expect(rt.mediaDir('images')).toEqual({ dir: path.join(root, 'images'), hostDir: 'C:\\wxflow\\exchange\\images' })
            expect(rt.fromHostPath('C:\\wxflow\\exchange\\images\\1.jpg')).toBe(path.join(root, 'images', '1.jpg'))
        })
    })
})
