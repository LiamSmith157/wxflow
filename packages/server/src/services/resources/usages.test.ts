import { computeUsages, scanFlowRefs } from './usages'

const flowData = (...nodes: Array<{ name: string; inputs: Record<string, unknown> }>): string =>
    JSON.stringify({ nodes: nodes.map((n, i) => ({ id: `n${i}`, data: { name: n.name, inputs: n.inputs } })), edges: [] })

const loadResource = (ref: string) => ({ name: 'loadResourceAgentflow', inputs: { loadResourceRef: ref, loadResourceReturnAs: 'text' } })
const llm = (...refs: string[]) => ({ name: 'llmAgentflow', inputs: { llmResources: refs.map((resource) => ({ resource })) } })
const agent = (...refs: string[]) => ({ name: 'agentAgentflow', inputs: { agentResources: refs.map((resource) => ({ resource })) } })

const manual = { id: 'm1', nameKey: '产品手册' }
const poster = { id: 'p1', nameKey: '海报-北京' }

describe('resource usages: nodes that load or attach resources', () => {
    it('counts a flow that loads the resource with a Load Resource node', () => {
        const flows = [
            { id: 'f1', name: '问答', flowData: flowData(loadResource('res://id/m1')) },
            { id: 'f2', name: '客服', flowData: flowData(loadResource('res://name/产品手册')) }
        ]
        expect(computeUsages([manual], flows).get('m1')).toEqual([
            { id: 'f1', name: '问答', via: 'id' },
            { id: 'f2', name: '客服', via: 'name' }
        ])
    })

    it('counts a flow that attaches the resource to an LLM or an Agent node, in any row', () => {
        const flows = [
            { id: 'f1', name: 'LLM 流程', flowData: flowData(llm('res://id/p1', 'res://id/m1')) },
            { id: 'f2', name: 'Agent 流程', flowData: flowData(agent('res://name/海报-北京')) }
        ]
        const usages = computeUsages([manual, poster], flows)
        expect(usages.get('m1')).toEqual([{ id: 'f1', name: 'LLM 流程', via: 'id' }])
        expect(usages.get('p1')).toEqual([
            { id: 'f1', name: 'LLM 流程', via: 'id' },
            { id: 'f2', name: 'Agent 流程', via: 'name' }
        ])
    })

    it('counts a flow once however many nodes use the resource, and says when it points at it both ways', () => {
        const flows = [
            { id: 'f1', name: '组合', flowData: flowData(loadResource('res://id/m1'), llm('res://name/产品手册'), agent('res://id/m1')) }
        ]
        expect(computeUsages([manual], flows).get('m1')).toEqual([{ id: 'f1', name: '组合', via: 'both' }])
    })

    it('does not count references whose name is built with a variable', () => {
        const flows = [
            {
                id: 'f1',
                name: '变量',
                flowData: flowData(loadResource('res://name/产品手册-{{ $flow.state.lang }}'), llm('res://name/{{ $wechat.city }}'))
            }
        ]
        expect(computeUsages([manual], flows).get('m1')).toEqual([])
        expect(scanFlowRefs(flows[0].flowData).nameKeys.size).toBe(0)
    })

    it('does not count rows left empty or values that are not resource references', () => {
        const flows = [{ id: 'f1', name: '空', flowData: flowData(llm('', '  '), loadResource('C:\\data\\产品手册.pdf')) }]
        expect(computeUsages([manual], flows).get('m1')).toEqual([])
    })

    it('does not count a flow that has no such node or whose data cannot be read', () => {
        const flows = [
            { id: 'f1', name: '空流程', flowData: flowData() },
            { id: 'f2', name: '坏数据', flowData: '{not json' },
            { id: 'f3', name: '无数据', flowData: null }
        ]
        expect(computeUsages([manual], flows).get('m1')).toEqual([])
    })
})
