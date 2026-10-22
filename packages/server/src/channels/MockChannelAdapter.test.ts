import { MockChannelAdapter } from './MockChannelAdapter'
import { ChannelEvent, ChannelJobResult } from './types'

describe('MockChannelAdapter', () => {
    it('records calls and returns a jobid with an auto terminal state', async () => {
        const a = new MockChannelAdapter()
        a.addInstance('wxid_a')
        const r = await a.call('wxid_a', 'send.text', { to: 'x', text: 'hi' })
        expect(r.ok).toBe(true)
        expect(a.calls).toEqual([{ instance: 'wxid_a', method: 'send.text', params: { to: 'x', text: 'hi' } }])
        await expect(a.waitForJob(r.result.jobid, 50)).resolves.toEqual({ state: 'ok' })
    })

    it('fails calls to unknown or offline instances', async () => {
        const a = new MockChannelAdapter()
        a.addInstance('wxid_a', false)
        expect((await a.call('wxid_a', 'send.text', {})).error?.code).toBe(503)
        expect((await a.call('nobody', 'send.text', {})).ok).toBe(false)
    })

    it('simulates a job that never finishes', async () => {
        const a = new MockChannelAdapter()
        a.addInstance('wxid_a')
        a.autoJobResult = undefined
        const r = await a.call('wxid_a', 'send.text', {})
        await expect(a.waitForJob(r.result.jobid, 20)).resolves.toBeNull()
    })

    it('delivers a late terminal state to an existing waiter and to the sink', async () => {
        const a = new MockChannelAdapter()
        const done: Array<[string, ChannelJobResult]> = []
        a.setSink({ onEvent: () => {}, onInstanceChange: () => {}, onJobDone: (_c, id, r) => done.push([id, r]) })
        a.addInstance('wxid_a')
        a.autoJobResult = undefined
        const r = await a.call('wxid_a', 'send.text', {})
        const waiting = a.waitForJob(r.result.jobid, 1000)
        a.finishJob(r.result.jobid, { state: 'fail', error: 'x' })
        await expect(waiting).resolves.toEqual({ state: 'fail', error: 'x' })
        expect(done).toEqual([[r.result.jobid, { state: 'fail', error: 'x' }]])
    })

    it('uses scripted responses and pushes events into the sink', async () => {
        const a = new MockChannelAdapter()
        const events: ChannelEvent[] = []
        a.setSink({ onEvent: (e) => events.push(e), onInstanceChange: () => {}, onJobDone: () => {} })
        a.addInstance('wxid_a')
        a.responses.set('contacts.list', { ok: true, result: { list: [] } })
        expect((await a.call('wxid_a', 'contacts.list', {})).result).toEqual({ list: [] })
        a.emit('wxid_a', 'msg.insert', { text: 'hi' })
        expect(events).toEqual([{ channel: 'wechat', instance: 'wxid_a', event: 'msg.insert', data: { text: 'hi' } }])
    })
})
