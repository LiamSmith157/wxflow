import baseline from './startInputsBaseline.json'

const { nodeClass: Start } = require('./Start')

const WECHAT = 'wechatEvent'
const isWechatInput = (i: any) => i?.show?.startInputType === WECHAT

/** The timezone list comes from Intl and differs between Node builds, so it is not part of the comparison */
const normalize = (inputs: any[]) =>
    JSON.parse(
        JSON.stringify(
            inputs
                .filter((i) => !isWechatInput(i))
                .map((i) => {
                    if (i.name === 'startInputType') return { ...i, options: i.options.filter((o: any) => o.name !== WECHAT) }
                    if (i.name === 'scheduleTimezone') return { ...i, options: '<timezone options omitted>' }
                    return i
                })
        )
    )

describe('Start node: WeChat Event input type', () => {
    const node = new Start()
    const find = (name: string) => node.inputs.find((i: any) => i.name === name)

    it('offers WeChat Event as an agentflow v2 input type', () => {
        const option = find('startInputType').options.find((o: any) => o.name === WECHAT)
        expect(option).toMatchObject({ label: 'WeChat Event', name: WECHAT, client: ['agentflowv2'] })
    })

    it('leaves the parameter definitions of the other input types unchanged', () => {
        expect(normalize(node.inputs)).toEqual(baseline)
    })

    it('shows every WeChat parameter only for the WeChat Event input type', () => {
        const wechatInputs = node.inputs.filter((i: any) => i.name.startsWith('wechat'))
        expect(wechatInputs.length).toBeGreaterThan(0)
        for (const input of wechatInputs) expect(input.show?.startInputType).toBe(WECHAT)
    })

    it('shows message filters only for the message event', () => {
        for (const name of ['wechatDirection', 'wechatTalkers', 'wechatChatScope', 'wechatMsgTypes']) {
            expect(find(name).show).toMatchObject({ startInputType: WECHAT, wechatEventType: 'msg.insert' })
        }
    })

    it('shows media and payment parameters only for their events', () => {
        expect(find('wechatMediaType').show).toMatchObject({ wechatEventType: 'msg.media' })
        for (const name of ['wechatPayKinds', 'wechatPayDirection']) expect(find(name).show).toMatchObject({ wechatEventType: 'msg.pay' })
        expect(find('wechatQuickKeys').show).toMatchObject({ wechatEventType: 'quickkey.hit' })
        expect(find('wechatSwitchTo').show).toMatchObject({ wechatEventType: 'session.switch' })
    })

    it('covers the seven event types and defaults the direction to inbound only', () => {
        expect(find('wechatEventType').options.map((o: any) => o.name)).toEqual([
            'msg.insert',
            'quickkey.hit',
            'session.switch',
            'msg.media',
            'wx.login',
            'wx.logout',
            'msg.pay'
        ])
        expect(find('wechatDirection').default).toBe('in')
        expect(find('wechatInstanceScope').default).toBe('all')
    })

    describe('run', () => {
        const run = (inputs: Record<string, any>, input: any, agentflowRuntime: any = {}) =>
            node.run({ id: 'start_0', inputs } as any, input, { agentflowRuntime })

        it('puts the channel event in the output and uses the message content as the question', async () => {
            const wechat = {
                channel: 'wechat',
                instance: 'wxid_bot',
                event: 'msg.insert',
                talker: 'wxid_a',
                sender: 'wxid_a',
                content: '你好'
            }
            const out = await run({ startInputType: WECHAT }, '', { wechat })
            expect(out.output.wechat).toEqual(wechat)
            expect(out.output.question).toBe('你好')
            expect(out.input.wechat).toEqual(wechat)
        })

        it('uses the no-input sentinel for events without content', async () => {
            const out = await run({ startInputType: WECHAT }, '', {
                wechat: { channel: 'wechat', instance: 'wxid_bot', event: 'wx.login' }
            })
            expect(out.output.question).toBe(' ')
        })

        it('keeps the behaviour of the chat input type', async () => {
            const out = await run({ startInputType: 'chatInput' }, 'hello')
            expect(out.output).toEqual({ question: 'hello' })
        })
    })

    describe('listWechatInstances', () => {
        it('lists only instances of the searched workspace, sorted by label', async () => {
            const findBy = jest.fn().mockResolvedValue([
                { instanceKey: 'wxid_b', displayName: 'Bob' },
                { instanceKey: 'wxid_a', displayName: 'Alice' },
                { instanceKey: 'wxid_c', displayName: undefined }
            ])
            const options = {
                appDataSource: { getRepository: jest.fn().mockReturnValue({ findBy }) },
                databaseEntities: { ChannelInstance: class ChannelInstance {} },
                searchOptions: { workspaceId: 'ws1' }
            }
            const result = await node.loadMethods.listWechatInstances({} as any, options)
            expect(findBy).toHaveBeenCalledWith({ workspaceId: 'ws1', channel: 'wechat' })
            expect(result.map((r: any) => r.name)).toEqual(['wxid_a', 'wxid_b', 'wxid_c'])
            expect(result[2].label).toBe('wxid_c')
        })

        it('returns nothing without a data source', async () => {
            expect(await node.loadMethods.listWechatInstances({} as any, {})).toEqual([])
        })
    })
})
