import { ChannelHub } from './ChannelHub'

describe('ChannelHub', () => {
    it('fans out events to every subscriber', () => {
        const hub = new ChannelHub()
        const a = jest.fn()
        const b = jest.fn()
        hub.subscribeEvents(a)
        hub.subscribeEvents(b)
        const e = { channel: 'wechat', instance: 'wxid_a', event: 'msg.insert', data: {} }
        hub.onEvent(e)
        expect(a).toHaveBeenCalledWith(e)
        expect(b).toHaveBeenCalledWith(e)
    })

    it('isolates a failing or rejecting handler from the others', async () => {
        const errors: unknown[] = []
        const hub = new ChannelHub((e) => errors.push(e))
        const ok = jest.fn()
        hub.subscribeEvents(() => {
            throw new Error('sync boom')
        })
        hub.subscribeEvents(async () => {
            throw new Error('async boom')
        })
        hub.subscribeEvents(ok)
        hub.onEvent({ channel: 'wechat', instance: 'i', event: 'x', data: {} })
        await new Promise((r) => setTimeout(r, 10))
        expect(ok).toHaveBeenCalled()
        expect(errors.map((e) => (e as Error).message).sort()).toEqual(['async boom', 'sync boom'])
    })

    it('delivers instance changes and job completions', () => {
        const hub = new ChannelHub()
        const inst = jest.fn()
        const job = jest.fn()
        hub.subscribeInstanceChanges(inst)
        hub.subscribeJobDone(job)
        hub.onInstanceChange('wechat', [{ instanceKey: 'a', online: true }])
        hub.onJobDone('wechat', 'j1', { state: 'ok' }, 'a')
        expect(inst).toHaveBeenCalledWith('wechat', [{ instanceKey: 'a', online: true }])
        expect(job).toHaveBeenCalledWith('wechat', 'j1', { state: 'ok' }, 'a')
    })
})
