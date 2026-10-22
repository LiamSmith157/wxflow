import { resolveWechatRef } from './channelVariables'

const event = {
    channel: 'wechat',
    instance: 'wxid_bot',
    event: 'msg.insert',
    talker: 'wxid_a',
    sender: 'wxid_a',
    content: '你好',
    atList: ['wxid_x'],
    nested: { a: 1 }
}

describe('resolveWechatRef', () => {
    it('returns the field of the event', () => {
        expect(resolveWechatRef('$wechat.sender', event)).toBe('wxid_a')
        expect(resolveWechatRef('$wechat.content', event)).toBe('你好')
    })

    it('replaces a missing field with an empty string', () => {
        expect(resolveWechatRef('$wechat.content', { event: 'wx.login' })).toBe('')
        expect(resolveWechatRef('$wechat.nothing.deep', event)).toBe('')
    })

    it('resolves to an empty string when there is no event at all', () => {
        expect(resolveWechatRef('$wechat.talker', undefined)).toBe('')
        expect(resolveWechatRef('$wechat.talker', null)).toBe('')
    })

    it('serializes arrays and objects as JSON', () => {
        expect(resolveWechatRef('$wechat.atList', event)).toBe('["wxid_x"]')
        expect(resolveWechatRef('$wechat.nested', event)).toBe('{"a":1}')
    })

    it('never walks the prototype chain', () => {
        expect(resolveWechatRef('$wechat.__proto__.polluted', event)).toBe('')
        expect(resolveWechatRef('$wechat.constructor.name', event)).toBe('')
        expect(resolveWechatRef('$wechat.', event)).toBe('')
    })

    it('stringifies numbers and booleans', () => {
        expect(resolveWechatRef('$wechat.n', { n: 0 })).toBe('0')
        expect(resolveWechatRef('$wechat.b', { b: false })).toBe('false')
    })
})
