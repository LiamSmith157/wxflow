import { ReadableStream } from 'stream/web'

// @langchain/core expects the web streams globals, which Jest's node environment does not expose
Object.assign(globalThis, { ReadableStream })
// The components package pulls in optional peers that are not needed to resolve variables
jest.mock('wxflow-components', () => new Proxy({ __esModule: true }, { get: (t: any, k: string) => (k in t ? t[k] : jest.fn()) }))
jest.mock('./logger', () => ({ __esModule: true, default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))
jest.mock('./getRunningExpressApp', () => ({ getRunningExpressApp: jest.fn() }))
const { resolveVariables } = require('./buildAgentflow')

const nodeData = (inputs: Record<string, any>): any => ({
    id: 'n1',
    name: 'wechatSendTextAgentflow',
    inputs,
    inputParams: Object.keys(inputs).map((name) => ({ name, acceptVariable: true })),
    inputAnchors: []
})

const resolve = async (inputs: Record<string, any>, wechat?: Record<string, any>) =>
    (await resolveVariables(nodeData(inputs), '', {}, undefined, [], [], '', [], {}, undefined, undefined, undefined, undefined, wechat))
        .inputs

describe('resolveVariables: $wechat.*', () => {
    const event = {
        channel: 'wechat',
        instance: 'wxid_bot',
        event: 'msg.insert',
        talker: 'wxid_a',
        sender: 'wxid_a',
        content: '$& 你好 $1'
    }

    it('replaces {{ $wechat.<field> }} with the field of the triggering event', async () => {
        const inputs = await resolve({ text: '你好,{{ $wechat.sender }}' }, event)
        expect(inputs?.text).toBe('你好,wxid_a')
    })

    it('inserts chat text literally, even when it contains replacement patterns', async () => {
        const inputs = await resolve({ text: 'echo: {{ $wechat.content }}' }, event)
        expect(inputs?.text).toBe('echo: $& 你好 $1')
    })

    it('replaces a field the event does not have with an empty string', async () => {
        const inputs = await resolve(
            { text: 'content=[{{ $wechat.content }}]' },
            { channel: 'wechat', instance: 'wxid_bot', event: 'wx.login' }
        )
        expect(inputs?.text).toBe('content=[]')
    })

    it('replaces with an empty string when the run has no channel event', async () => {
        const inputs = await resolve({ text: '[{{ $wechat.talker }}]' })
        expect(inputs?.text).toBe('[]')
    })

    it('resolves several references and leaves other variable kinds alone', async () => {
        const inputs = await resolve({ text: '{{ $wechat.talker }}/{{ $wechat.instance }} {{ $vars.unknown }}' }, event)
        expect(inputs?.text).toBe('wxid_a/wxid_bot {{ $vars.unknown }}')
    })
})

describe('resolveVariables: the media parameter is a dropdown (asyncOptions) that also takes typed values', () => {
    const dropdownNode = (value: string): any => ({
        id: 'n1',
        name: 'wechatSendImageAgentflow',
        inputs: { wechatMedia: value },
        inputParams: [
            { name: 'wechatMedia', type: 'asyncOptions', loadMethod: 'listImageResources', freeSolo: true, acceptVariable: true }
        ],
        inputAnchors: []
    })
    const resolveMedia = async (value: string, wechat?: Record<string, any>) =>
        (
            await resolveVariables(
                dropdownNode(value),
                '',
                {},
                undefined,
                [],
                [],
                '',
                [],
                {},
                undefined,
                undefined,
                undefined,
                undefined,
                wechat
            )
        ).inputs?.wechatMedia

    it('replaces a variable that is part of a typed resource name', async () => {
        expect(await resolveMedia('res://name/海报-{{ $wechat.city }}', { city: '上海' })).toBe('res://name/海报-上海')
    })

    it('leaves a reference picked from the list as it is', async () => {
        expect(await resolveMedia('res://id/3f2c1a9e-aaaa-4bbb-8ccc-0123456789ab')).toBe('res://id/3f2c1a9e-aaaa-4bbb-8ccc-0123456789ab')
    })

    it('leaves a local path and a URL as they are', async () => {
        expect(await resolveMedia('D:素材海报.jpg')).toBe('D:素材海报.jpg')
        expect(await resolveMedia('https://example.com/a.png?x=1')).toBe('https://example.com/a.png?x=1')
    })

    it('replaces a variable that is the whole value', async () => {
        expect(await resolveMedia('{{ $wechat.poster }}', { poster: 'res://name/海报-北京' })).toBe('res://name/海报-北京')
    })
})
