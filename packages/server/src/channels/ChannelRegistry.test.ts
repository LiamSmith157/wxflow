import { ChannelNotRegisteredError, ChannelRegistry } from './ChannelRegistry'
import { MockChannelAdapter } from './MockChannelAdapter'

describe('ChannelRegistry', () => {
    it('registers and returns an adapter by channel', () => {
        const registry = new ChannelRegistry()
        const adapter = new MockChannelAdapter('wechat')
        registry.register(adapter)
        expect(registry.has('wechat')).toBe(true)
        expect(registry.get('wechat')).toBe(adapter)
        expect(registry.list()).toEqual([adapter])
    })

    it('keeps adapters of different channels apart', () => {
        const registry = new ChannelRegistry()
        const wechat = new MockChannelAdapter('wechat')
        const whatsapp = new MockChannelAdapter('whatsapp')
        registry.register(wechat)
        registry.register(whatsapp)
        expect(registry.get('whatsapp')).toBe(whatsapp)
        expect(registry.get('wechat')).toBe(wechat)
    })

    it('throws a typed error for an unregistered channel', () => {
        const registry = new ChannelRegistry()
        expect(() => registry.get('wechat')).toThrow(ChannelNotRegisteredError)
        expect(() => registry.get('wechat')).toThrow('Channel "wechat" is not registered')
        expect(registry.has('wechat')).toBe(false)
    })

    it('unregister removes the adapter', () => {
        const registry = new ChannelRegistry()
        registry.register(new MockChannelAdapter('wechat'))
        registry.unregister('wechat')
        expect(registry.has('wechat')).toBe(false)
    })
})
