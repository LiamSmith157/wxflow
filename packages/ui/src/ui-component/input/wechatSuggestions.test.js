import { getWechatSuggestionItems } from './wechatSuggestions'

const ids = (items) => items.map((i) => i.id)

describe('getWechatSuggestionItems', () => {
    it('lists the common message fields for the message event', () => {
        const items = getWechatSuggestionItems('wechatEvent', 'msg.insert')
        expect(ids(items)).toEqual(
            expect.arrayContaining(['$wechat.talker', '$wechat.sender', '$wechat.content', '$wechat.svrid', '$wechat.instance'])
        )
        for (const item of items) {
            expect(item.mentionLabel).toBe(item.id)
            expect(item.category).toBe('WeChat Event')
            expect(item.description).toBeTruthy()
        }
    })

    it('matches the {{ query typed by the user', () => {
        const items = getWechatSuggestionItems('wechatEvent', 'msg.insert')
        const matches = items.filter((i) => i.mentionLabel.toLowerCase().includes('talk'))
        expect(ids(matches)).toEqual(['$wechat.talker'])
    })

    it('lists event specific fields for other events', () => {
        expect(ids(getWechatSuggestionItems('wechatEvent', 'session.switch'))).toEqual(
            expect.arrayContaining(['$wechat.from', '$wechat.to'])
        )
        expect(ids(getWechatSuggestionItems('wechatEvent', 'msg.pay'))).toEqual(expect.arrayContaining(['$wechat.kind', '$wechat.amount']))
        expect(ids(getWechatSuggestionItems('wechatEvent', 'wx.login'))).not.toContain('$wechat.content')
    })

    it('falls back to the message fields when the event type is not chosen yet', () => {
        expect(ids(getWechatSuggestionItems('wechatEvent', undefined))).toContain('$wechat.content')
    })

    it('suggests nothing for other input types', () => {
        expect(getWechatSuggestionItems('chatInput', 'msg.insert')).toEqual([])
        expect(getWechatSuggestionItems(undefined, undefined)).toEqual([])
    })
})
