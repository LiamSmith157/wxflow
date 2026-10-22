// Nodes with several named outputs (the WeChat router/fetch nodes, Cooldown, Talker Filter) label each edge with
// the name of its branch, so a canvas shows which edge runs when. The label is stored in English and translated
// when it is drawn.
export const BRANCH_NODE_NAMES = new Set([
    'cooldownAgentflow',
    'talkerFilterAgentflow',
    'wechatMessageTypeRouterAgentflow',
    'wechatFetchImageAgentflow',
    'wechatFetchVoiceAgentflow'
])

/** The branch label of a source handle id such as `wechatFetchImageAgentflow_0-output-1`, or undefined for other nodes */
export const getBranchEdgeLabel = (sourceHandle, componentNodes) => {
    const handle = sourceHandle || ''
    const nodeName = handle.split('_')[0]
    if (!BRANCH_NODE_NAMES.has(nodeName)) return undefined
    const index = Number(handle.split('-').pop())
    if (!Number.isInteger(index)) return undefined
    const definition = (componentNodes || []).find((n) => n.name === nodeName)
    return definition?.outputs?.[index]?.label
}
