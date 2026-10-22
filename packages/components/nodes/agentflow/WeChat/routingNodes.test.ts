import { createFakeChannels, messageEvent, runOptions } from './testFakes'

const load = (file: string) => new (require(file).nodeClass)()
const router = load('./MessageTypeRouter')
const contacts = load('./SearchContacts')

const data = (node: any, inputs: Record<string, any> = {}): any => ({ id: `${node.name}_0`, inputs })
const fulfilled = (out: any) => out.output.conditions.map((c: any) => c.isFulfilled)
const only = (index: number) => Array.from({ length: 7 }, (_, i) => i === index)

describe('Message Type Router', () => {
    it('has the seven branches', () => {
        expect(router.outputs.map((o: any) => o.label)).toEqual(['Text', 'Image', 'Voice', 'Link', 'File', 'Video', 'Other'])
    })

    it.each([
        [1, 0],
        [3, 1],
        [34, 2],
        [5, 3],
        [6, 4],
        [43, 5],
        [10000, 6]
    ])('routes message type %s to branch %s', async (msgType, expected) => {
        const ch = createFakeChannels({ event: messageEvent({ msgType }) })
        const out = await router.run(data(router), '', runOptions(ch))
        expect(fulfilled(out)).toEqual(only(expected))
    })

    it('sends an image message along the image branch', async () => {
        const ch = createFakeChannels({ event: messageEvent({ msgType: 3 }) })
        const out = await router.run(data(router), '', runOptions(ch))
        expect(out.output.branch).toBe('image')
    })

    it.each(['wx.login', 'wx.logout', 'session.switch', 'msg.pay'])(
        'sends the non-message event %s along the other branch',
        async (event) => {
            const ch = createFakeChannels({ event: { channel: 'wechat', instance: 'wxid_bot', event } })
            expect(fulfilled(await router.run(data(router), '', runOptions(ch)))).toEqual(only(6))
        }
    )

    it('sends a run without any channel event along the other branch', async () => {
        expect(fulfilled(await router.run(data(router), '', { agentflowRuntime: { state: {} } }))).toEqual(only(6))
    })

    it('always fulfills exactly one branch', async () => {
        for (const msgType of [1, 3, 34, 5, 6, 43, 999, undefined]) {
            const ch = createFakeChannels({ event: messageEvent({ msgType }) })
            const out = await router.run(data(router), '', runOptions(ch))
            expect(fulfilled(out).filter(Boolean)).toHaveLength(1)
        }
    })
})

describe('Search Contacts', () => {
    it('looks up one contact and outputs the nickname', async () => {
        const ch = createFakeChannels({ event: messageEvent() })
        ch.callResults['contacts.avatar'] = { ok: true, result: { wxid: 'wxid_friend', nick: '小王', avatar: 'https://a/b.jpg' } }
        const out = await contacts.run(
            data(contacts, { wechatContactMode: 'single', wechatContactWxid: 'wxid_friend' }),
            '',
            runOptions(ch)
        )
        expect(ch.calls).toEqual([
            { instance: 'wxid_bot', method: 'contacts.avatar', params: { wxid: 'wxid_friend' }, timeoutMs: undefined }
        ])
        expect(out.output).toMatchObject({ mode: 'single', wxid: 'wxid_friend', nick: '小王', avatar: 'https://a/b.jpg' })
        expect(out.output.contact).toEqual({ wxid: 'wxid_friend', nick: '小王', avatar: 'https://a/b.jpg' })
    })

    it('fails in single mode without a wxid and does not call the channel', async () => {
        const ch = createFakeChannels({ event: messageEvent() })
        await expect(
            contacts.run(data(contacts, { wechatContactMode: 'single', wechatContactWxid: '' }), '', runOptions(ch))
        ).rejects.toThrow('缺少 wxid')
        expect(ch.calls).toEqual([])
    })

    it('lists all friends', async () => {
        const ch = createFakeChannels({ event: messageEvent() })
        ch.callResults['contacts.list'] = { ok: true, result: { count: 2, items: [{ wxid: 'a' }, { wxid: 'b' }] } }
        const out = await contacts.run(data(contacts, { wechatContactMode: 'all' }), '', runOptions(ch))
        expect(ch.calls[0]).toMatchObject({ method: 'contacts.list', params: { type: 'friend' } })
        expect(out.output).toMatchObject({ mode: 'all', count: 2, contacts: [{ wxid: 'a' }, { wxid: 'b' }] })
    })

    it('does not require a wxid in all-friends mode', async () => {
        const ch = createFakeChannels({ event: messageEvent() })
        ch.callResults['contacts.list'] = { ok: true, result: { items: [] } }
        await expect(contacts.run(data(contacts, { wechatContactMode: 'all' }), '', runOptions(ch))).resolves.toBeDefined()
    })

    it('fails with the DLL reason when the lookup fails', async () => {
        const ch = createFakeChannels({ event: messageEvent() })
        ch.callResults['contacts.avatar'] = { ok: false, error: { code: 404, message: '无此联系人' } }
        await expect(
            contacts.run(data(contacts, { wechatContactMode: 'single', wechatContactWxid: 'x' }), '', runOptions(ch))
        ).rejects.toThrow('无此联系人')
    })

    it('fails when no instance can be used', async () => {
        const ch = createFakeChannels()
        await expect(contacts.run(data(contacts, { wechatContactMode: 'all' }), '', runOptions(ch))).rejects.toThrow('没有可用的实例')
    })

    it('only shows the wxid field in single mode', () => {
        expect(contacts.inputs.find((i: any) => i.name === 'wechatContactWxid').show).toEqual({ wechatContactMode: 'single' })
    })
})
