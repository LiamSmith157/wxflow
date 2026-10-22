import { createChannelSubscriptionService, extractSubscription, parseList } from './subscriptions'

class FakeRepo {
    rows: any[] = []
    private seq = 0
    create(p: any) {
        return { ...p }
    }
    async save(e: any) {
        if (!e.id) {
            e.id = `s${++this.seq}`
            this.rows.push(e)
        }
        return e
    }
    private match(r: any, where: any = {}) {
        return Object.entries(where).every(([k, v]) => r[k] === v)
    }
    async findOne({ where }: any) {
        return this.rows.find((r) => this.match(r, where)) ?? null
    }
    async find({ where }: any = {}) {
        return this.rows.filter((r) => this.match(r, where))
    }
    async delete(where: any) {
        this.rows = this.rows.filter((r) => !this.match(r, where))
    }
}

const flow = (inputs: Record<string, any>) =>
    JSON.stringify({ nodes: [{ id: 'startAgentflow_0', data: { name: 'startAgentflow', inputs } }], edges: [] })

const setup = () => {
    const repo = new FakeRepo()
    return { repo, service: createChannelSubscriptionService(() => ({ getRepository: () => repo })) }
}

describe('parseList', () => {
    it('handles comma separated text, arrays and JSON arrays', () => {
        expect(parseList(' a, b ,,c ')).toEqual(['a', 'b', 'c'])
        expect(parseList(['1', 3])).toEqual(['1', '3'])
        expect(parseList('["1","34"]')).toEqual(['1', '34'])
        expect(parseList('')).toEqual([])
        expect(parseList(undefined)).toEqual([])
        expect(parseList('[broken')).toEqual(['[broken'])
    })
})

describe('extractSubscription', () => {
    it('reads the message event with its defaults', () => {
        expect(extractSubscription(flow({ startInputType: 'wechatEvent' }))).toEqual({
            channel: 'wechat',
            eventType: 'msg.insert',
            instanceScope: 'all',
            filters: { direction: 'in', talkers: [], chatScope: 'any', msgTypes: ['1'] }
        })
    })

    it('reads explicit message filters and a specific instance', () => {
        const sub = extractSubscription(
            flow({
                startInputType: 'wechatEvent',
                wechatEventType: 'msg.insert',
                wechatInstanceScope: 'specific',
                wechatInstance: 'wxid_x',
                wechatDirection: 'any',
                wechatTalkers: 'a@chatroom, wxid_b',
                wechatChatScope: 'group',
                wechatMsgTypes: '["3","34"]'
            })
        )
        expect(sub).toMatchObject({
            instanceScope: 'wxid_x',
            filters: { direction: 'any', talkers: ['a@chatroom', 'wxid_b'], chatScope: 'group', msgTypes: ['3', '34'] }
        })
    })

    it('treats an empty message type selection as all types', () => {
        expect(extractSubscription(flow({ startInputType: 'wechatEvent', wechatMsgTypes: [] }))?.filters.msgTypes).toEqual([])
    })

    it('falls back to all instances when a specific instance is not chosen', () => {
        expect(extractSubscription(flow({ startInputType: 'wechatEvent', wechatInstanceScope: 'specific' }))?.instanceScope).toBe('all')
    })

    it('reads the filters of the other events', () => {
        expect(
            extractSubscription(
                flow({ startInputType: 'wechatEvent', wechatEventType: 'msg.pay', wechatPayKinds: ['transfer'], wechatPayDirection: 'in' })
            )?.filters
        ).toEqual({
            kinds: ['transfer'],
            payDirection: 'in'
        })
        expect(
            extractSubscription(flow({ startInputType: 'wechatEvent', wechatEventType: 'msg.media', wechatMediaType: 'image' }))?.filters
        ).toEqual({ media: 'image' })
        expect(
            extractSubscription(flow({ startInputType: 'wechatEvent', wechatEventType: 'quickkey.hit', wechatQuickKeys: 'k1,k2' }))?.filters
        ).toEqual({ keys: ['k1', 'k2'] })
        expect(
            extractSubscription(flow({ startInputType: 'wechatEvent', wechatEventType: 'session.switch', wechatSwitchTo: 'filehelper' }))
                ?.filters
        ).toEqual({ to: ['filehelper'] })
        expect(extractSubscription(flow({ startInputType: 'wechatEvent', wechatEventType: 'wx.login' }))?.filters).toEqual({})
    })

    it('returns null for other input types and unreadable flows', () => {
        expect(extractSubscription(flow({ startInputType: 'chatInput' }))).toBeNull()
        expect(extractSubscription('not json')).toBeNull()
        expect(extractSubscription(undefined)).toBeNull()
        expect(extractSubscription(JSON.stringify({ nodes: [] }))).toBeNull()
    })
})

describe('channel subscription service', () => {
    const wechatFlow = flow({ startInputType: 'wechatEvent' })

    it('creates the subscription disabled on first save', async () => {
        const { service, repo } = setup()
        const sub = await service.syncForChatflow('cf1', 'ws', wechatFlow)
        expect(sub).toMatchObject({ chatflowId: 'cf1', workspaceId: 'ws', channel: 'wechat', eventType: 'msg.insert', enabled: false })
        expect(repo.rows).toHaveLength(1)
        expect(await service.findEnabled('ws', 'wechat', 'msg.insert')).toEqual([])
    })

    it('keeps the enabled flag when an enabled flow is saved again, and applies the new configuration', async () => {
        const { service, repo } = setup()
        await service.syncForChatflow('cf1', 'ws', wechatFlow)
        await service.setEnabled('cf1', 'ws', true)
        await service.syncForChatflow(
            'cf1',
            'ws',
            flow({ startInputType: 'wechatEvent', wechatEventType: 'msg.media', wechatMediaType: 'image' })
        )
        expect(repo.rows).toHaveLength(1)
        expect(repo.rows[0]).toMatchObject({ enabled: true, eventType: 'msg.media' })
        expect(JSON.parse(repo.rows[0].filters)).toEqual({ media: 'image' })
        expect(await service.findEnabled('ws', 'wechat', 'msg.media')).toHaveLength(1)
        expect(await service.findEnabled('ws', 'wechat', 'msg.insert')).toHaveLength(0)
    })

    it('removes the subscription when the Start input type changes', async () => {
        const { service, repo } = setup()
        await service.syncForChatflow('cf1', 'ws', wechatFlow)
        await service.setEnabled('cf1', 'ws', true)
        expect(await service.syncForChatflow('cf1', 'ws', flow({ startInputType: 'chatInput' }))).toBeNull()
        expect(repo.rows).toHaveLength(0)
        expect(await service.findEnabled('ws', 'wechat', 'msg.insert')).toEqual([])
    })

    it('removes the subscription when the flow is deleted', async () => {
        const { service, repo } = setup()
        await service.syncForChatflow('cf1', 'ws', wechatFlow)
        await service.syncForChatflow('cf2', 'ws', wechatFlow)
        await service.deleteForChatflow('cf1', 'ws')
        expect(repo.rows.map((r) => r.chatflowId)).toEqual(['cf2'])
    })

    it('only returns enabled subscriptions of the same workspace and event', async () => {
        const { service } = setup()
        await service.syncForChatflow('cf1', 'wsA', wechatFlow)
        await service.syncForChatflow('cf2', 'wsA', wechatFlow)
        await service.syncForChatflow('cf3', 'wsB', wechatFlow)
        await service.setEnabled('cf1', 'wsA', true)
        await service.setEnabled('cf3', 'wsB', true)
        expect((await service.findEnabled('wsA', 'wechat', 'msg.insert')).map((s) => s.chatflowId)).toEqual(['cf1'])
    })

    it('disables again and reports the status', async () => {
        const { service } = setup()
        await service.syncForChatflow('cf1', 'ws', wechatFlow)
        await service.setEnabled('cf1', 'ws', true)
        expect((await service.getForChatflow('cf1', 'ws'))?.enabled).toBe(true)
        await service.setEnabled('cf1', 'ws', false)
        expect((await service.getForChatflow('cf1', 'ws'))?.enabled).toBe(false)
        expect(await service.getForChatflow('nope', 'ws')).toBeNull()
    })

    it('refuses to enable a flow that has no WeChat subscription', async () => {
        const { service } = setup()
        await expect(service.setEnabled('cf1', 'ws', true)).rejects.toMatchObject({ statusCode: 404 })
    })

    it('does not touch the subscription of another workspace', async () => {
        const { service, repo } = setup()
        await service.syncForChatflow('cf1', 'wsA', wechatFlow)
        await expect(service.setEnabled('cf1', 'wsB', true)).rejects.toMatchObject({ statusCode: 404 })
        await service.deleteForChatflow('cf1', 'wsB')
        expect(repo.rows).toHaveLength(1)
    })
})
