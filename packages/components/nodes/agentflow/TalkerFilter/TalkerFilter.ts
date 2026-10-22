import { ICommonObject, INode, INodeData, INodeOutputsValue, INodeParams } from '../../../src/Interface'

/** One list entry: exact match, or `*` at the start and/or end for suffix, prefix and contains matches */
export const matchesPattern = (value: string, pattern: string): boolean => {
    const p = pattern.trim()
    if (!p) return false
    const starts = p.startsWith('*')
    const ends = p.endsWith('*')
    if (starts && ends && p.length > 2) return value.includes(p.slice(1, -1))
    if (starts && p.length > 1) return value.endsWith(p.slice(1))
    if (ends && p.length > 1) return value.startsWith(p.slice(0, -1))
    return value === p
}

export const parseList = (raw: unknown): string[] =>
    String(raw ?? '')
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean)

class TalkerFilter_Agentflow implements INode {
    label: string
    name: string
    version: number
    description: string
    type: string
    icon: string
    category: string
    color: string
    baseClasses: string[]
    inputs: INodeParams[]
    outputs: INodeOutputsValue[]

    constructor() {
        this.label = 'Talker Filter'
        this.name = 'talkerFilterAgentflow'
        this.version = 1.0
        this.type = 'TalkerFilter'
        this.category = 'Agent Flows'
        this.description = 'Pass or block the run by sender or conversation, with an allow list or a block list'
        this.baseClasses = [this.type]
        this.color = '#F28B82'
        this.inputs = [
            {
                label: 'Filter By',
                name: 'filterField',
                type: 'options',
                options: [
                    { label: 'Conversation', name: 'talker', description: 'The conversation the message belongs to' },
                    { label: 'Sender', name: 'sender', description: 'The person who sent the message' }
                ],
                default: 'talker'
            },
            {
                label: 'List Mode',
                name: 'filterMode',
                type: 'options',
                options: [
                    { label: 'Allow List', name: 'whitelist', description: 'Only the listed values pass' },
                    { label: 'Block List', name: 'blacklist', description: 'The listed values are blocked' }
                ],
                default: 'whitelist'
            },
            {
                label: 'List',
                name: 'filterList',
                type: 'string',
                rows: 4,
                description: 'One value per line or comma separated. A * at the start or end matches any prefix or suffix',
                placeholder: 'wxid_abc123\nwxid_team*\n*@chatroom',
                acceptVariable: true
            }
        ]
        this.outputs = [
            { label: 'Pass', name: 'pass' },
            { label: 'Blocked', name: 'blocked' }
        ]
    }

    async run(nodeData: INodeData, _: string, options: ICommonObject): Promise<any> {
        const field = nodeData.inputs?.filterField === 'sender' ? 'sender' : 'talker'
        const mode = nodeData.inputs?.filterMode === 'blacklist' ? 'blacklist' : 'whitelist'
        const patterns = parseList(nodeData.inputs?.filterList)
        const event = (options.agentflowRuntime?.wechat ?? {}) as ICommonObject
        const raw = event[field]
        const value = typeof raw === 'string' ? raw.trim() : ''
        const state = options.agentflowRuntime?.state as ICommonObject

        const result = (pass: boolean, extra: ICommonObject = {}) => ({
            id: nodeData.id,
            name: this.name,
            input: { field, mode, value: value || undefined },
            output: { passed: pass, ...extra, conditions: [{ isFulfilled: pass }, { isFulfilled: !pass }] },
            state
        })

        // no conversation context (the run was not started by a WeChat message): nothing to filter on
        if (!value) return result(true, { reason: `没有会话上下文(缺少 ${field}),过滤未生效` })

        const listed = patterns.some((p) => matchesPattern(value, p))
        return result(mode === 'whitelist' ? listed : !listed, { matched: listed })
    }
}

module.exports = { nodeClass: TalkerFilter_Agentflow, matchesPattern, parseList }
