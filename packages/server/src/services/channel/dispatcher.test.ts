import { ChannelHub } from '../../channels/ChannelHub'
import { MockChannelAdapter } from '../../channels/MockChannelAdapter'
import { ChannelEvent } from '../../channels/types'
import { createChannelDispatcher } from './dispatcher'
import { matchesFilters } from './matching'
import { SubscriptionView } from './subscriptions'

const sub = (over: Partial<SubscriptionView> & { chatflowId: string }): SubscriptionView =>
    ({
        id: over.chatflowId,
        workspaceId: 'wsA',
        channel: 'wechat',
        eventType: 'msg.insert',
        instanceScope: 'all',
        enabled: true,
        filters: { direction: 'in', talkers: [], chatScope: 'any', msgTypes: ['1'] },
        ...over
    } as SubscriptionView)

const message = (over: Record<string, any> = {}) => ({
    talker: 'wxid_friend',
    sender: 'wxid_friend',
    direction: 'in',
    isGroup: false,
    msgType: 1,
    content: 'hi',
    svrid: '1',
    ...over
})

interface Setup {
    adapter: MockChannelAdapter
    runs: Array<{ chatflowId: string; event: ChannelEvent; workspaceId: string }>
    logger: { debug: jest.Mock; info: jest.Mock; warn: jest.Mock; error: jest.Mock }
    dispatcher: ReturnType<typeof createChannelDispatcher>
}

const setup = (
    opts: {
        subscriptions?: SubscriptionView[]
        workspaces?: Record<string, string | null>
        master?: Record<string, boolean>
        runFlow?: (s: SubscriptionView) => Promise<unknown>
        maxPending?: number
        concurrency?: number
    } = {}
): Setup => {
    const adapter = new MockChannelAdapter()
    const hub = new ChannelHub()
    adapter.setSink(hub)
    const runs: Setup['runs'] = []
    const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
    const subscriptions = opts.subscriptions ?? []
    const workspaces = opts.workspaces ?? { wxid_bot: 'wsA' }
    const dispatcher = createChannelDispatcher({
        getInstanceWorkspace: async (_c, key) => workspaces[key] ?? null,
        getSettings: async (ws) => ({ masterEnabled: opts.master?.[ws] ?? true, sendRateLimitPerMinute: 20 }),
        findEnabled: async (ws, channel, eventType) =>
            subscriptions.filter((s) => s.workspaceId === ws && s.channel === channel && s.eventType === eventType && s.enabled),
        runFlow: async (s, event, workspaceId) => {
            runs.push({ chatflowId: s.chatflowId, event, workspaceId })
            return opts.runFlow?.(s)
        },
        logger,
        maxPendingPerInstance: opts.maxPending,
        concurrencyPerInstance: opts.concurrency
    })
    hub.subscribeEvents((e) => dispatcher.handleEvent(e))
    adapter.addInstance('wxid_bot')
    return { adapter, runs, logger, dispatcher }
}

describe('channel dispatcher', () => {
    it('runs every enabled flow that subscribes to the event, one run each', async () => {
        const { adapter, runs, dispatcher } = setup({ subscriptions: [sub({ chatflowId: 'f1' }), sub({ chatflowId: 'f2' })] })
        adapter.emit('wxid_bot', 'msg.insert', message())
        await dispatcher.whenIdle()
        expect(runs.map((r) => r.chatflowId).sort()).toEqual(['f1', 'f2'])
        expect(runs[0].workspaceId).toBe('wsA')
        expect(runs[0].event).toMatchObject({ channel: 'wechat', instance: 'wxid_bot', event: 'msg.insert', data: { content: 'hi' } })
    })

    it('does not run a flow whose message type filter does not match', async () => {
        const { adapter, runs, dispatcher } = setup({
            subscriptions: [sub({ chatflowId: 'images', filters: { direction: 'in', msgTypes: ['3'] } }), sub({ chatflowId: 'text' })]
        })
        adapter.emit('wxid_bot', 'msg.insert', message({ msgType: 1 }))
        await dispatcher.whenIdle()
        expect(runs.map((r) => r.chatflowId)).toEqual(['text'])
    })

    it('limits a flow to the instance it names', async () => {
        const { adapter, runs, dispatcher } = setup({
            subscriptions: [sub({ chatflowId: 'onlyX', instanceScope: 'wxid_x' }), sub({ chatflowId: 'bot', instanceScope: 'wxid_bot' })],
            workspaces: { wxid_bot: 'wsA', wxid_x: 'wsA' }
        })
        adapter.addInstance('wxid_x')
        adapter.emit('wxid_bot', 'msg.insert', message())
        await dispatcher.whenIdle()
        expect(runs.map((r) => r.chatflowId)).toEqual(['bot'])
    })

    it('only runs flows of the workspace the instance belongs to', async () => {
        const { adapter, runs, dispatcher } = setup({
            subscriptions: [sub({ chatflowId: 'a', workspaceId: 'wsA' }), sub({ chatflowId: 'b', workspaceId: 'wsB' })]
        })
        adapter.emit('wxid_bot', 'msg.insert', message())
        await dispatcher.whenIdle()
        expect(runs.map((r) => r.chatflowId)).toEqual(['a'])
    })

    it('drops events of an unassigned instance', async () => {
        const { adapter, runs, dispatcher } = setup({ subscriptions: [sub({ chatflowId: 'a' })], workspaces: { wxid_bot: null } })
        adapter.emit('wxid_bot', 'msg.insert', message())
        await dispatcher.whenIdle()
        expect(runs).toEqual([])
    })

    it('does not trigger anything while the master switch is off', async () => {
        const { adapter, runs, dispatcher } = setup({ subscriptions: [sub({ chatflowId: 'a' })], master: { wsA: false } })
        adapter.emit('wxid_bot', 'msg.insert', message())
        await dispatcher.whenIdle()
        expect(runs).toEqual([])
    })

    it('ignores outbound messages by default (no reply loop) but honours an explicit direction', async () => {
        const { adapter, runs, dispatcher } = setup({
            subscriptions: [sub({ chatflowId: 'default' }), sub({ chatflowId: 'both', filters: { direction: 'any', msgTypes: ['1'] } })]
        })
        adapter.emit('wxid_bot', 'msg.insert', message({ direction: 'out' }))
        await dispatcher.whenIdle()
        expect(runs.map((r) => r.chatflowId)).toEqual(['both'])
    })

    it('keeps running the other flows when one fails', async () => {
        const { adapter, runs, logger, dispatcher } = setup({
            subscriptions: [sub({ chatflowId: 'bad' }), sub({ chatflowId: 'good' })],
            runFlow: async (s) => {
                if (s.chatflowId === 'bad') throw new Error('boom')
            }
        })
        adapter.emit('wxid_bot', 'msg.insert', message())
        await dispatcher.whenIdle()
        expect(runs.map((r) => r.chatflowId).sort()).toEqual(['bad', 'good'])
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('boom'))
    })

    it('matches events other than messages by their own type', async () => {
        const { adapter, runs, dispatcher } = setup({
            subscriptions: [sub({ chatflowId: 'login', eventType: 'wx.login', filters: {} }), sub({ chatflowId: 'msg' })]
        })
        adapter.emit('wxid_bot', 'wx.login', { wxid: 'wxid_bot' })
        await dispatcher.whenIdle()
        expect(runs.map((r) => r.chatflowId)).toEqual(['login'])
    })

    describe('backlog', () => {
        it('drops the oldest pending events beyond the limit and logs it', async () => {
            let release!: () => void
            const gate = new Promise<void>((resolve) => (release = resolve))
            const { adapter, runs, logger, dispatcher } = setup({
                subscriptions: [sub({ chatflowId: 'slow' })],
                maxPending: 2,
                concurrency: 1,
                runFlow: () => gate
            })
            for (const n of [1, 2, 3, 4, 5]) adapter.emit('wxid_bot', 'msg.insert', message({ content: `m${n}` }))
            // m1 is running, m2..m5 queued with room for two: m2 and m3 are dropped
            await new Promise((r) => setTimeout(r, 10))
            release()
            await dispatcher.whenIdle()
            expect(runs.map((r) => r.event.data.content)).toEqual(['m1', 'm4', 'm5'])
            expect(logger.warn).toHaveBeenCalledTimes(2)
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('积压'))
        })

        it('keeps the queues of different instances apart', async () => {
            const { adapter, runs, dispatcher } = setup({
                subscriptions: [sub({ chatflowId: 'a' })],
                workspaces: { wxid_bot: 'wsA', wxid_y: 'wsA' },
                maxPending: 1,
                concurrency: 1,
                runFlow: () => new Promise((r) => setTimeout(r, 20))
            })
            adapter.addInstance('wxid_y')
            adapter.emit('wxid_bot', 'msg.insert', message({ content: 'b1' }))
            adapter.emit('wxid_y', 'msg.insert', message({ content: 'y1' }))
            await dispatcher.whenIdle()
            expect(runs.map((r) => r.event.data.content).sort()).toEqual(['b1', 'y1'])
        })
    })
})

describe('matchesFilters', () => {
    it('filters messages by conversation and conversation type', () => {
        const f = { direction: 'in' as const, talkers: ['wxid_friend'], chatScope: 'c2c' as const, msgTypes: [] }
        expect(matchesFilters('msg.insert', f, message())).toBe(true)
        expect(matchesFilters('msg.insert', f, message({ talker: 'other' }))).toBe(false)
        expect(matchesFilters('msg.insert', { ...f, talkers: [], chatScope: 'group' }, message())).toBe(false)
        expect(
            matchesFilters('msg.insert', { ...f, talkers: [], chatScope: 'group' }, message({ isGroup: true, talker: 'a@chatroom' }))
        ).toBe(true)
    })

    it('treats an empty message type list as all types', () => {
        expect(matchesFilters('msg.insert', { direction: 'in', msgTypes: [] }, message({ msgType: 43 }))).toBe(true)
    })

    it('rejects a message without a conversation', () => {
        expect(matchesFilters('msg.insert', { direction: 'any' }, { content: 'x' })).toBe(false)
        expect(matchesFilters('msg.insert', { direction: 'any' }, null)).toBe(false)
    })

    it('filters quick keywords, session switches, media and payments', () => {
        expect(matchesFilters('quickkey.hit', { keys: ['k1'] }, { key: 'k1' })).toBe(true)
        expect(matchesFilters('quickkey.hit', { keys: ['k1'] }, { key: 'k2' })).toBe(false)
        expect(matchesFilters('quickkey.hit', { keys: [] }, { key: 'anything' })).toBe(true)
        expect(matchesFilters('session.switch', { to: ['filehelper'] }, { to: 'filehelper' })).toBe(true)
        expect(matchesFilters('session.switch', { to: ['filehelper'] }, { to: 'x' })).toBe(false)
        expect(matchesFilters('msg.media', { media: 'image' }, { media: 'video' })).toBe(false)
        expect(matchesFilters('msg.media', { media: 'any' }, { media: 'video' })).toBe(true)
        expect(matchesFilters('msg.pay', { kinds: ['transfer'], payDirection: 'in' }, { kind: 'transfer', direction: 'in' })).toBe(true)
        expect(matchesFilters('msg.pay', { kinds: ['transfer'], payDirection: 'in' }, { kind: 'redpacket', direction: 'in' })).toBe(false)
        expect(matchesFilters('msg.pay', { kinds: [], payDirection: 'in' }, { kind: 'transfer_expired', direction: '' })).toBe(false)
        expect(matchesFilters('msg.pay', { kinds: [], payDirection: 'any' }, { kind: 'transfer_expired', direction: '' })).toBe(true)
    })

    it('lets login and logout events through', () => {
        expect(matchesFilters('wx.login', {}, {})).toBe(true)
        expect(matchesFilters('wx.logout', {}, undefined)).toBe(true)
    })
})
