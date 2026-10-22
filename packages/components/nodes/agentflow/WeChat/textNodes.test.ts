import { createFakeChannels, messageEvent, runOptions } from './testFakes'

const load = (file: string) => new (require(file).nodeClass)()
const sendText = load('./SendText')
const sendAt = load('./SendAtMention')
const linkCard = load('./SendLinkCard')
const quote = load('./QuoteReply')

const data = (node: any, inputs: Record<string, any>): any => ({ id: `${node.name}_0`, inputs })

describe('Send Text', () => {
    it('is a WeChat node with the WeChat green', () => {
        expect(sendText).toMatchObject({ name: 'wechatSendTextAgentflow', category: 'WeChat', color: '#07C160' })
    })

    it('sends send.text to the triggering conversation through the triggering instance', async () => {
        const ch = createFakeChannels({ event: messageEvent() })
        const out = await sendText.run(data(sendText, { wechatTo: 'wxid_friend', wechatText: 'hello' }), '', runOptions(ch))
        expect(ch.sends).toEqual([
            {
                channel: 'wechat',
                instance: 'wxid_bot',
                method: 'send.text',
                params: { wxid: 'wxid_friend', content: 'hello' },
                waitSeconds: undefined
            }
        ])
        expect(out.output).toMatchObject({ state: 'ok', jobId: 'job-1', instance: 'wxid_bot', to: 'wxid_friend' })
    })

    it('defaults the recipient parameter to the triggering conversation', () => {
        expect(sendText.inputs.find((i: any) => i.name === 'wechatTo').default).toBe('{{ $wechat.talker }}')
    })

    it('uses the instance chosen in the node when the flow is not triggered by a WeChat event', async () => {
        const ch = createFakeChannels()
        await sendText.run(data(sendText, { wechatTo: 'wxid_x', wechatText: 'hi', wechatInstance: 'wxid_bot' }), '', runOptions(ch))
        expect(ch.sends[0].instance).toBe('wxid_bot')
    })

    it('fails when there is no instance (not triggered by WeChat and none chosen)', async () => {
        const ch = createFakeChannels()
        await expect(sendText.run(data(sendText, { wechatTo: 'wxid_x', wechatText: 'hi' }), '', runOptions(ch))).rejects.toThrow(
            '没有可用的实例'
        )
        expect(ch.sends).toEqual([])
    })

    it('fails with a clear error when the chosen instance is offline', async () => {
        const ch = createFakeChannels({ instances: [{ instanceKey: 'wxid_bot', online: false }] })
        await expect(
            sendText.run(data(sendText, { wechatTo: 'x', wechatText: 'hi', wechatInstance: 'wxid_bot' }), '', runOptions(ch))
        ).rejects.toThrow('离线')
    })

    it('fails when the instance does not belong to the workspace', async () => {
        const ch = createFakeChannels()
        await expect(
            sendText.run(data(sendText, { wechatTo: 'x', wechatText: 'hi', wechatInstance: 'wxid_other' }), '', runOptions(ch))
        ).rejects.toThrow('不属于当前工作区')
    })

    it('fails when the recipient resolves to empty (non-message trigger with the default recipient)', async () => {
        const ch = createFakeChannels()
        await expect(
            sendText.run(data(sendText, { wechatTo: '', wechatText: 'hi', wechatInstance: 'wxid_bot' }), '', runOptions(ch))
        ).rejects.toThrow('收件人为空')
        expect(ch.sends).toEqual([])
    })

    it('fails on empty content without sending', async () => {
        const ch = createFakeChannels({ event: messageEvent() })
        await expect(sendText.run(data(sendText, { wechatTo: 'x', wechatText: '  ' }), '', runOptions(ch))).rejects.toThrow('发送内容为空')
        expect(ch.sends).toEqual([])
    })

    it.each(['fail', 'pending', 'rate_limited', 'skipped'] as const)('passes the %s state through to the output', async (state) => {
        const ch = createFakeChannels({ event: messageEvent() })
        ch.sendOutcome = { state, error: state === 'fail' ? '对方不是好友' : undefined }
        const out = await sendText.run(data(sendText, { wechatTo: 'x', wechatText: 'hi' }), '', runOptions(ch))
        expect(out.output.state).toBe(state)
        if (state === 'fail') expect(out.output.error).toBe('对方不是好友')
    })

    it('passes the wait setting to the channel', async () => {
        const ch = createFakeChannels({ event: messageEvent() })
        await sendText.run(data(sendText, { wechatTo: 'x', wechatText: 'hi', wechatWaitSeconds: 5 }), '', runOptions(ch))
        expect(ch.sends[0].waitSeconds).toBe(5)
    })

    it('fails when the run has no channel handle', async () => {
        await expect(sendText.run(data(sendText, { wechatTo: 'x', wechatText: 'hi' }), '', {})).rejects.toThrow('微信渠道不可用')
    })
})

describe('Send @Mention', () => {
    it('sends send.at with the group, text and member', async () => {
        const ch = createFakeChannels({ event: messageEvent({ talker: '123@chatroom', isGroup: true }) })
        const out = await sendAt.run(
            data(sendAt, { wechatGroup: '123@chatroom', wechatText: '你好', wechatAtWxid: 'wxid_friend', wechatAtNick: '小王' }),
            '',
            runOptions(ch)
        )
        expect(ch.sends[0].method).toBe('send.at')
        expect(ch.sends[0].params).toEqual({ group: '123@chatroom', text: '你好', atAll: false, atWxid: 'wxid_friend', atNick: '小王' })
        expect(out.output.state).toBe('ok')
    })

    it('@ everyone needs no member', async () => {
        const ch = createFakeChannels({ event: messageEvent() })
        await sendAt.run(data(sendAt, { wechatGroup: '123@chatroom', wechatText: 'x', wechatAtAll: true }), '', runOptions(ch))
        expect(ch.sends[0].params).toEqual({ group: '123@chatroom', text: 'x', atAll: true })
    })

    it('fails without calling the channel when nobody is mentioned', async () => {
        const ch = createFakeChannels({ event: messageEvent() })
        await expect(
            sendAt.run(data(sendAt, { wechatGroup: '123@chatroom', wechatText: 'x', wechatAtWxid: '' }), '', runOptions(ch))
        ).rejects.toThrow('缺少被@的成员')
        expect(ch.sends).toEqual([])
        expect(ch.calls).toEqual([])
    })

    it('hides the member fields when @ everyone is on', () => {
        for (const name of ['wechatAtWxid', 'wechatAtNick'])
            expect(sendAt.inputs.find((i: any) => i.name === name).show).toEqual({ wechatAtAll: false })
    })
})

describe('Send Link Card', () => {
    it('sends send.webcard with title, url and optional description', async () => {
        const ch = createFakeChannels({ event: messageEvent() })
        await linkCard.run(
            data(linkCard, { wechatTo: 'wxid_friend', wechatCardTitle: '标题', wechatCardUrl: 'https://x.test', wechatCardDesc: '说明' }),
            '',
            runOptions(ch)
        )
        expect(ch.sends[0].method).toBe('send.webcard')
        expect(ch.sends[0].params).toEqual({ wxid: 'wxid_friend', title: '标题', url: 'https://x.test', desc: '说明' })
    })

    it('omits an empty description', async () => {
        const ch = createFakeChannels({ event: messageEvent() })
        await linkCard.run(data(linkCard, { wechatTo: 'x', wechatCardTitle: 't', wechatCardUrl: 'https://x.test' }), '', runOptions(ch))
        expect(ch.sends[0].params).toEqual({ wxid: 'x', title: 't', url: 'https://x.test' })
    })

    it('fails without a title or URL', async () => {
        const ch = createFakeChannels({ event: messageEvent() })
        await expect(linkCard.run(data(linkCard, { wechatTo: 'x', wechatCardUrl: 'https://x.test' }), '', runOptions(ch))).rejects.toThrow(
            '标题'
        )
        await expect(linkCard.run(data(linkCard, { wechatTo: 'x', wechatCardTitle: 't' }), '', runOptions(ch))).rejects.toThrow('URL')
    })
})

describe('Quote Reply', () => {
    it('quotes the triggering message with send.quote', async () => {
        const ch = createFakeChannels({ event: messageEvent({ content: '报价多少' }) })
        const out = await quote.run(data(quote, { wechatTo: 'wxid_friend', wechatText: '见下表' }), '', runOptions(ch))
        expect(ch.sends[0].method).toBe('send.quote')
        expect(ch.sends[0].params).toEqual({
            wxid: 'wxid_friend',
            text: '见下表',
            svrid: '8970001234567890123',
            refContent: '报价多少',
            refFrom: 'wxid_friend',
            refChat: 'wxid_friend',
            self: 'wxid_bot'
        })
        expect(out.output.state).toBe('ok')
    })

    it('truncates the quoted content to 200 characters', async () => {
        const ch = createFakeChannels({ event: messageEvent({ content: 'x'.repeat(500) }) })
        await quote.run(data(quote, { wechatTo: 'x', wechatText: 'y' }), '', runOptions(ch))
        expect(ch.sends[0].params.refContent).toHaveLength(200)
    })

    it('fails when the flow was not triggered by a message', async () => {
        const noEvent = createFakeChannels()
        await expect(
            quote.run(data(quote, { wechatTo: 'x', wechatText: 'y', wechatInstance: 'wxid_bot' }), '', runOptions(noEvent))
        ).rejects.toThrow('只能用于由"收到消息"事件触发')
        const login = createFakeChannels({ event: { channel: 'wechat', instance: 'wxid_bot', event: 'wx.login' } })
        await expect(quote.run(data(quote, { wechatTo: 'x', wechatText: 'y' }), '', runOptions(login))).rejects.toThrow(
            '只能用于由"收到消息"事件触发'
        )
        expect(noEvent.sends).toEqual([])
    })
})
