import { createChannelSettingsService, DEFAULT_CHANNEL_SETTINGS } from './settings'

class FakeRepo {
    rows: any[] = []
    reads = 0
    create(p: any) {
        return { ...p }
    }
    async save(e: any) {
        if (!this.rows.includes(e)) this.rows.push(e)
        return e
    }
    async findOne({ where }: any) {
        this.reads++
        return this.rows.find((r) => r.workspaceId === where.workspaceId) ?? null
    }
}

const setup = (now = () => 0) => {
    const repo = new FakeRepo()
    return { repo, service: createChannelSettingsService(() => ({ getRepository: () => repo }), now) }
}

describe('channel settings service', () => {
    it('defaults to master on and 20 sends per minute', async () => {
        const { service } = setup()
        expect(await service.getSettings('ws')).toEqual({ masterEnabled: true, sendRateLimitPerMinute: 20 })
        expect(DEFAULT_CHANNEL_SETTINGS.sendRateLimitPerMinute).toBe(20)
    })

    it('stores master switch and rate limit per workspace', async () => {
        const { service } = setup()
        await service.updateSettings('wsA', { masterEnabled: false })
        await service.updateSettings('wsB', { sendRateLimitPerMinute: 5 })
        expect(await service.getSettings('wsA')).toEqual({ masterEnabled: false, sendRateLimitPerMinute: 20 })
        expect(await service.getSettings('wsB')).toEqual({ masterEnabled: true, sendRateLimitPerMinute: 5 })
    })

    it('rejects invalid rate limits and non-boolean switches', async () => {
        const { service } = setup()
        for (const bad of [0, -1, 1.5, 100000, NaN]) {
            await expect(service.updateSettings('ws', { sendRateLimitPerMinute: bad })).rejects.toMatchObject({ statusCode: 400 })
        }
        await expect(service.updateSettings('ws', { masterEnabled: 'no' as any })).rejects.toMatchObject({ statusCode: 400 })
    })

    it('caches reads briefly and sees updates immediately', async () => {
        let t = 0
        const { service, repo } = setup(() => t)
        await service.getSettings('ws')
        await service.getSettings('ws')
        expect(repo.reads).toBe(1)
        await service.updateSettings('ws', { masterEnabled: false })
        expect((await service.getSettings('ws')).masterEnabled).toBe(false)
        t = 10_000
        const before = repo.reads
        await service.getSettings('ws')
        expect(repo.reads).toBe(before + 1)
    })
})
