import { ChannelRegistry } from './ChannelRegistry'
import { createChannelSender } from './ChannelSender'
import { MockChannelAdapter } from './MockChannelAdapter'

const setup = (settings = { masterEnabled: true, sendRateLimitPerMinute: 20 }) => {
    const adapter = new MockChannelAdapter()
    adapter.addInstance('wxid_a')
    adapter.addInstance('wxid_b')
    const registry = new ChannelRegistry()
    registry.register(adapter)
    let t = 1_000_000
    const sender = createChannelSender({ registry, getSettings: async () => settings, now: () => t })
    const req = (instance = 'wxid_a') => ({
        channel: 'wechat',
        instance,
        workspaceId: 'ws',
        method: 'send.text',
        params: { wxid: 'x', content: 'hi' },
        waitMs: 50
    })
    return { adapter, sender, req, settings, advance: (ms: number) => (t += ms) }
}

describe('ChannelSender', () => {
    it('sends and reports ok with the job id once the terminal state arrives', async () => {
        const { adapter, sender, req } = setup()
        const r = await sender.send(req())
        expect(r).toMatchObject({ state: 'ok', jobId: 'job-1' })
        expect(adapter.calls).toHaveLength(1)
    })

    it('reports a failed terminal state with its reason', async () => {
        const { adapter, sender, req } = setup()
        adapter.autoJobResult = { state: 'fail', error: '对方不是好友' }
        expect(await sender.send(req())).toMatchObject({ state: 'fail', error: '对方不是好友' })
    })

    it('reports pending when the terminal state does not arrive in time', async () => {
        const { adapter, sender, req } = setup()
        adapter.autoJobResult = undefined
        expect(await sender.send(req())).toMatchObject({ state: 'pending', jobId: 'job-1' })
    })

    it('reports a failed call (offline instance) without throwing', async () => {
        const { adapter, sender, req } = setup()
        adapter.setOnline('wxid_a', false)
        const r = await sender.send(req())
        expect(r.state).toBe('fail')
        expect(r.error).toContain('实例离线')
    })

    it('reports ok when the call returns no job id', async () => {
        const { adapter, sender, req } = setup()
        adapter.responses.set('send.text', { ok: true, result: {} })
        expect(await sender.send(req())).toMatchObject({ state: 'ok' })
    })

    describe('master switch', () => {
        it('skips every send while the switch is off and never calls the DLL', async () => {
            const { adapter, sender, req } = setup({ masterEnabled: false, sendRateLimitPerMinute: 20 })
            const r = await sender.send(req())
            expect(r.state).toBe('skipped')
            expect(adapter.calls).toEqual([])
        })
    })

    describe('send rate limit', () => {
        it('lets the limit through and rate-limits the next send without calling the DLL', async () => {
            const { adapter, sender, req } = setup({ masterEnabled: true, sendRateLimitPerMinute: 3 })
            for (let i = 0; i < 3; i++) expect((await sender.send(req())).state).toBe('ok')
            const over = await sender.send(req())
            expect(over.state).toBe('rate_limited')
            expect(over.error).toContain('3')
            expect(adapter.calls).toHaveLength(3)
        })

        it('counts per instance', async () => {
            const { sender, req } = setup({ masterEnabled: true, sendRateLimitPerMinute: 1 })
            expect((await sender.send(req('wxid_a'))).state).toBe('ok')
            expect((await sender.send(req('wxid_b'))).state).toBe('ok')
            expect((await sender.send(req('wxid_a'))).state).toBe('rate_limited')
        })

        it('frees the slots once a minute has passed', async () => {
            const { sender, req, advance } = setup({ masterEnabled: true, sendRateLimitPerMinute: 1 })
            expect((await sender.send(req())).state).toBe('ok')
            expect((await sender.send(req())).state).toBe('rate_limited')
            advance(60_001)
            expect((await sender.send(req())).state).toBe('ok')
        })

        it('does not count a skipped send', async () => {
            const { sender, req, settings } = setup({ masterEnabled: false, sendRateLimitPerMinute: 1 })
            await sender.send(req())
            settings.masterEnabled = true
            expect((await sender.send(req())).state).toBe('ok')
        })
    })
})
