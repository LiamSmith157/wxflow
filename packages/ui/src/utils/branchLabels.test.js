import { getBranchEdgeLabel, BRANCH_NODE_NAMES } from './branchLabels'

const componentNodes = [
    {
        name: 'wechatFetchImageAgentflow',
        outputs: [
            { label: 'Success', name: 'success' },
            { label: 'Failed', name: 'failed' }
        ]
    },
    {
        name: 'wechatMessageTypeRouterAgentflow',
        outputs: [
            { label: 'Text' },
            { label: 'Image' },
            { label: 'Voice' },
            { label: 'Link' },
            { label: 'File' },
            { label: 'Video' },
            { label: 'Other' }
        ]
    },
    { name: 'conditionAgentflow', outputs: [{ label: '0' }, { label: '1' }] }
]

describe('getBranchEdgeLabel', () => {
    it('returns the label of the branch the handle belongs to', () => {
        expect(getBranchEdgeLabel('wechatFetchImageAgentflow_0-output-0', componentNodes)).toBe('Success')
        expect(getBranchEdgeLabel('wechatFetchImageAgentflow_0-output-1', componentNodes)).toBe('Failed')
        expect(getBranchEdgeLabel('wechatMessageTypeRouterAgentflow_3-output-6', componentNodes)).toBe('Other')
    })

    it('leaves other nodes alone (their labels are handled elsewhere)', () => {
        expect(getBranchEdgeLabel('conditionAgentflow_0-output-1', componentNodes)).toBeUndefined()
        expect(getBranchEdgeLabel('llmAgentflow_0-output-llmAgentflow', componentNodes)).toBeUndefined()
        expect(getBranchEdgeLabel(undefined, componentNodes)).toBeUndefined()
    })

    it('returns nothing for an unknown branch or without node definitions', () => {
        expect(getBranchEdgeLabel('wechatFetchImageAgentflow_0-output-5', componentNodes)).toBeUndefined()
        expect(getBranchEdgeLabel('wechatFetchImageAgentflow_0-output-x', componentNodes)).toBeUndefined()
        expect(getBranchEdgeLabel('wechatFetchImageAgentflow_0-output-0', undefined)).toBeUndefined()
    })

    it('covers the five branching nodes', () => {
        expect([...BRANCH_NODE_NAMES].sort()).toEqual([
            'cooldownAgentflow',
            'talkerFilterAgentflow',
            'wechatFetchImageAgentflow',
            'wechatFetchVoiceAgentflow',
            'wechatMessageTypeRouterAgentflow'
        ])
    })
})
