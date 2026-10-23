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
    name: 'llmAgentflow',
    inputs,
    inputParams: Object.keys(inputs).map((name) => ({ name, acceptVariable: true })),
    inputAnchors: []
})

const resolve = async (inputs: Record<string, any>, wechat?: Record<string, any>) =>
    (await resolveVariables(nodeData(inputs), '', {}, undefined, [], [], '', [], {}, undefined, undefined, undefined, undefined, wechat))
        .inputs

describe('resolveVariables: resource references', () => {
    const event = { channel: 'wechat', instance: 'wxid_bot', event: 'msg.insert', city: '上海' }

    it('replaces variables in a name reference of a plain parameter', async () => {
        const inputs = await resolve({ wechatMedia: 'res://name/海报-{{ $wechat.city }}' }, event)
        expect(inputs?.wechatMedia).toBe('res://name/海报-上海')
    })

    it('replaces variables in a name reference inside the rows of an array parameter', async () => {
        const inputs = await resolve(
            {
                llmResources: [{ resource: 'res://id/abc' }, { resource: 'res://name/价目表-{{ $wechat.city }}' }]
            },
            event
        )
        expect(inputs?.llmResources).toEqual([{ resource: 'res://id/abc' }, { resource: 'res://name/价目表-上海' }])
    })

    it('replaces a flow state reference in a name reference of a Load Resource parameter', async () => {
        const data = nodeData({ loadResourceRef: 'res://name/价目表-{{ $flow.state.city }}' })
        const flowConfig = { state: { city: '北京' } }
        const out = await resolveVariables(data, '', {}, flowConfig, [], [], '', [], {})
        expect(out.inputs?.loadResourceRef).toBe('res://name/价目表-北京')
    })
})

describe('resolveVariables: parameters that are not marked acceptVariable', () => {
    it('leaves them alone, so an array of resources must be marked itself and not only its rows', async () => {
        const data = nodeData({ llmResources: [{ resource: 'res://name/价目表-{{ $wechat.city }}' }] })
        data.inputParams = [{ name: 'llmResources', acceptVariable: false }]
        const out = await resolveVariables(data, '', {}, undefined, [], [], '', [], {}, undefined, undefined, undefined, undefined, {
            city: '上海'
        })
        expect(out.inputs?.llmResources).toEqual([{ resource: 'res://name/价目表-{{ $wechat.city }}' }])
    })
})
