import { ChatType } from '../../Interface'

jest.mock('../../utils/buildChatflow', () => ({ utilBuildChatflow: jest.fn().mockResolvedValue({ text: 'ok' }) }))

import { utilBuildChatflow } from '../../utils/buildChatflow'
import { runChannelFlow, toFlowEvent } from './runFlow'

const build = utilBuildChatflow as jest.Mock
const subscription: any = { chatflowId: 'flow-1' }
const messageEvent = {
    channel: 'wechat',
    instance: 'wxid_bot',
    event: 'msg.insert',
    data: { talker: 'wxid_a', sender: 'wxid_a', content: '你好', msgType: 1 }
}

beforeEach(() => build.mockClear())

describe('runChannelFlow', () => {
    it('starts the flow through the prediction path as an internal channel run', async () => {
        await runChannelFlow(subscription, messageEvent)
        expect(build).toHaveBeenCalledTimes(1)
        const [req, isInternal, chatType] = build.mock.calls[0]
        expect(isInternal).toBe(true)
        expect(chatType).toBe(ChatType.CHANNEL)
        expect(req.params.id).toBe('flow-1')
        expect(req.body.streaming).toBe(false)
        expect(req.body.question).toBe('你好')
        expect(req.body.wechat).toMatchObject({
            channel: 'wechat',
            instance: 'wxid_bot',
            event: 'msg.insert',
            talker: 'wxid_a',
            content: '你好'
        })
    })

    it('keeps one session per conversation so agents remember it', async () => {
        await runChannelFlow(subscription, messageEvent)
        await runChannelFlow(subscription, messageEvent)
        await runChannelFlow(subscription, { ...messageEvent, data: { ...messageEvent.data, talker: 'wxid_b' } })
        const ids = build.mock.calls.map(([req]) => req.body.chatId)
        expect(ids[0]).toBe('wechat:wxid_bot:wxid_a')
        expect(ids[1]).toBe(ids[0])
        expect(ids[2]).toBe('wechat:wxid_bot:wxid_b')
    })

    it('uses a fresh session and the no-input sentinel for events without a conversation', async () => {
        const login = { channel: 'wechat', instance: 'wxid_bot', event: 'wx.login', data: {} }
        await runChannelFlow(subscription, login)
        await runChannelFlow(subscription, login)
        const [a, b] = build.mock.calls.map(([req]) => req.body)
        expect(a.chatId).not.toBe(b.chatId)
        expect(a.question).toBe(' ')
    })

    it('propagates a failed run so the dispatcher can log it', async () => {
        build.mockRejectedValueOnce(new Error('flow exploded'))
        await expect(runChannelFlow(subscription, messageEvent)).rejects.toThrow('flow exploded')
    })
})

describe('toFlowEvent', () => {
    it('flattens the event data next to channel, instance and event name', () => {
        expect(toFlowEvent(messageEvent)).toEqual({
            talker: 'wxid_a',
            sender: 'wxid_a',
            content: '你好',
            msgType: 1,
            channel: 'wechat',
            instance: 'wxid_bot',
            event: 'msg.insert'
        })
    })

    it('does not let event data overwrite the routing fields', () => {
        const e = toFlowEvent({ ...messageEvent, data: { instance: 'spoofed', channel: 'x', event: 'y' } })
        expect(e).toMatchObject({ channel: 'wechat', instance: 'wxid_bot', event: 'msg.insert' })
    })
})
