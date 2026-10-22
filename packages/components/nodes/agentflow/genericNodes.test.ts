const load = (file: string) => require(file)
const cooldownModule = load('./Cooldown/Cooldown')
const cooldown = new cooldownModule.nodeClass()
const { resetCooldownWindows } = cooldownModule
const delay = new (load('./Delay/Delay').nodeClass)()
const filterModule = load('./TalkerFilter/TalkerFilter')
const filter = new filterModule.nodeClass()
const { matchesPattern, parseList } = filterModule

const data = (node: any, inputs: Record<string, any> = {}): any => ({ id: `${node.name}_0`, inputs })
const opts = (event?: Record<string, any>, extra: Record<string, any> = {}) => ({
    chatflowid: 'flow-1',
    agentflowRuntime: { state: {}, wechat: event ?? {} },
    ...extra
})
const branches = (out: any) => out.output.conditions.map((c: any) => c.isFulfilled)

describe('generic nodes live in Agent Flows', () => {
    it.each([
        ['Cooldown', cooldown, 'cooldownAgentflow'],
        ['Delay', delay, 'delayAgentflow'],
        ['Talker Filter', filter, 'talkerFilterAgentflow']
    ])('%s', (_label, node, name) => {
        expect(node.name).toBe(name)
        expect(node.category).toBe('Agent Flows')
    })
})

describe('Cooldown', () => {
    beforeEach(() => {
        resetCooldownWindows()
        jest.useFakeTimers().setSystemTime(new Date('2030-01-01T00:00:00Z'))
    })
    afterEach(() => jest.useRealTimers())

    const run = (talker: string, minutes = 10, extra: Record<string, any> = {}) =>
        cooldown.run(data(cooldown, { cooldownMinutes: minutes }), '', opts({ talker }, extra))

    it('has a Pass and a Cooling Down output and defaults to 10 minutes', () => {
        expect(cooldown.outputs.map((o: any) => o.label)).toEqual(['Pass', 'Cooling Down'])
        expect(cooldown.inputs[0].default).toBe(10)
    })

    it('lets the first arrival pass and holds back the second within the window', async () => {
        const first = await run('wxid_a')
        expect(branches(first)).toEqual([true, false])
        jest.advanceTimersByTime(60_000)
        const second = await run('wxid_a')
        expect(branches(second)).toEqual([false, true])
        expect(second.output.remainingSeconds).toBe(540)
    })

    it('lets the conversation through again once the window is over', async () => {
        await run('wxid_a', 10)
        jest.advanceTimersByTime(10 * 60_000 + 1)
        expect(branches(await run('wxid_a', 10))).toEqual([true, false])
    })

    it('tracks conversations independently', async () => {
        expect(branches(await run('wxid_a'))).toEqual([true, false])
        expect(branches(await run('wxid_b'))).toEqual([true, false])
        expect(branches(await run('wxid_a'))).toEqual([false, true])
    })

    it('tracks flows independently', async () => {
        await run('wxid_a', 10, { chatflowid: 'flow-1' })
        expect(branches(await run('wxid_a', 10, { chatflowid: 'flow-2' }))).toEqual([true, false])
    })

    it('does not extend the window when a message is held back', async () => {
        await run('wxid_a', 10)
        jest.advanceTimersByTime(9 * 60_000)
        await run('wxid_a', 10) // held back, must not restart the window
        jest.advanceTimersByTime(2 * 60_000)
        expect(branches(await run('wxid_a', 10))).toEqual([true, false])
    })

    it('passes with a reason when there is no conversation', async () => {
        const out = await cooldown.run(data(cooldown, { cooldownMinutes: 10 }), '', opts({}))
        expect(branches(out)).toEqual([true, false])
        expect(out.output.reason).toContain('没有会话上下文')
        // and it never claims a window
        expect(branches(await cooldown.run(data(cooldown, { cooldownMinutes: 10 }), '', opts({})))).toEqual([true, false])
    })

    it('falls back to 10 minutes for an invalid window', async () => {
        await cooldown.run(data(cooldown, { cooldownMinutes: 'abc' }), '', opts({ talker: 'wxid_a' }))
        jest.advanceTimersByTime(9 * 60_000)
        expect(branches(await run('wxid_a', 10))).toEqual([false, true])
    })
})

/** Move the fake clock and let the promises that were waiting on it settle */
const advance = async (ms: number) => {
    jest.advanceTimersByTime(ms)
    for (let i = 0; i < 5; i++) await Promise.resolve()
}

describe('Delay', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => {
        jest.useRealTimers()
        jest.restoreAllMocks()
    })

    it('waits the fixed number of seconds', async () => {
        const promise = delay.run(data(delay, { delaySeconds: 5 }), '', opts())
        let done = false
        promise.then(() => (done = true))
        await advance(4_900)
        expect(done).toBe(false)
        await advance(200)
        expect(done).toBe(true)
        expect((await promise).output).toMatchObject({ waitedSeconds: 5, random: false })
    })

    it('waits a random time inside the range when both limits are set', async () => {
        jest.spyOn(Math, 'random').mockReturnValue(0.5)
        const promise = delay.run(data(delay, { delaySeconds: 1, delayRandomMin: 3, delayRandomMax: 8 }), '', opts())
        await advance(5_499)
        let done = false
        promise.then(() => (done = true))
        await advance(0)
        expect(done).toBe(false)
        await advance(2)
        const out = await promise
        expect(out.output).toMatchObject({ waitedSeconds: 5.5, random: true })
    })

    it.each([
        [0, 3],
        [0.999999, 8]
    ])('stays within the range at the extremes (random=%s)', async (rnd, expected) => {
        jest.spyOn(Math, 'random').mockReturnValue(rnd)
        const promise = delay.run(data(delay, { delayRandomMin: 3, delayRandomMax: 8 }), '', opts())
        await advance(8_000)
        const waited = (await promise).output.waitedSeconds
        expect(waited).toBeGreaterThanOrEqual(3)
        expect(waited).toBeLessThanOrEqual(8)
        expect(Math.round(waited)).toBe(expected)
    })

    it('uses the fixed time when the range is incomplete or inverted', async () => {
        for (const inputs of [
            { delaySeconds: 2, delayRandomMin: 3 },
            { delaySeconds: 2, delayRandomMax: 8 },
            { delaySeconds: 2, delayRandomMin: 9, delayRandomMax: 4 }
        ]) {
            const promise = delay.run(data(delay, inputs), '', opts())
            await advance(2_000)
            expect((await promise).output).toMatchObject({ waitedSeconds: 2, random: false })
        }
    })

    it('ends early when the run is aborted', async () => {
        const controller = new AbortController()
        const promise = delay.run(data(delay, { delaySeconds: 3600 }), '', opts({}, { abortController: controller }))
        controller.abort()
        await expect(promise).resolves.toBeDefined()
    })
})

describe('Talker Filter', () => {
    const run = (inputs: Record<string, any>, event: Record<string, any> | undefined) => filter.run(data(filter, inputs), '', opts(event))

    it('has Pass and Blocked outputs', () => {
        expect(filter.outputs.map((o: any) => o.label)).toEqual(['Pass', 'Blocked'])
    })

    it('allow list: passes a sender matching a prefix pattern', async () => {
        const out = await run({ filterField: 'sender', filterMode: 'whitelist', filterList: 'wxid_abc*' }, { sender: 'wxid_abc123' })
        expect(branches(out)).toEqual([true, false])
    })

    it('allow list: blocks everything that is not listed', async () => {
        expect(
            branches(await run({ filterField: 'sender', filterMode: 'whitelist', filterList: 'wxid_abc*' }, { sender: 'wxid_zzz' }))
        ).toEqual([false, true])
    })

    it('block list: blocks a listed sender and passes the rest', async () => {
        const inputs = { filterField: 'sender', filterMode: 'blacklist', filterList: 'wxid_spam\nwxid_bad' }
        expect(branches(await run(inputs, { sender: 'wxid_bad' }))).toEqual([false, true])
        expect(branches(await run(inputs, { sender: 'wxid_ok' }))).toEqual([true, false])
    })

    it('filters by conversation when asked to', async () => {
        const inputs = { filterField: 'talker', filterMode: 'whitelist', filterList: '*@chatroom' }
        expect(branches(await run(inputs, { talker: '123@chatroom', sender: 'wxid_a' }))).toEqual([true, false])
        expect(branches(await run(inputs, { talker: 'wxid_friend', sender: 'wxid_a' }))).toEqual([false, true])
    })

    it('passes with a reason when the run has no conversation context', async () => {
        for (const mode of ['whitelist', 'blacklist']) {
            const out = await run({ filterField: 'talker', filterMode: mode, filterList: 'x' }, {})
            expect(branches(out)).toEqual([true, false])
            expect(out.output.reason).toContain('没有会话上下文')
        }
    })

    it('an empty allow list blocks everyone and an empty block list blocks nobody', async () => {
        expect(branches(await run({ filterField: 'talker', filterMode: 'whitelist', filterList: '' }, { talker: 'x' }))).toEqual([
            false,
            true
        ])
        expect(branches(await run({ filterField: 'talker', filterMode: 'blacklist', filterList: '' }, { talker: 'x' }))).toEqual([
            true,
            false
        ])
    })

    describe('matchesPattern', () => {
        it('supports exact, prefix, suffix and contains patterns', () => {
            expect(matchesPattern('wxid_abc123', 'wxid_abc123')).toBe(true)
            expect(matchesPattern('wxid_abc123', 'wxid_abc')).toBe(false)
            expect(matchesPattern('wxid_abc123', 'wxid_abc*')).toBe(true)
            expect(matchesPattern('wxid_abc123', '*123')).toBe(true)
            expect(matchesPattern('wxid_abc123', '*abc*')).toBe(true)
            expect(matchesPattern('wxid_abc123', '*xyz*')).toBe(false)
        })
        it('does not treat a lone * as a wildcard for everything, and ignores empty entries', () => {
            expect(matchesPattern('anything', '*')).toBe(false)
            expect(matchesPattern('anything', '**')).toBe(false)
            expect(matchesPattern('anything', '')).toBe(false)
        })
        it('parseList splits lines and commas', () => {
            expect(parseList('a, b\nc,,\n d ')).toEqual(['a', 'b', 'c', 'd'])
        })
    })
})
