import { ICommonObject, INode, INodeData, INodeOutputsValue, INodeParams } from '../../../src/Interface'

const MAX_TRACKED = 10000

/** `flowId:conversation` -> end of the cooldown window (ms). Lives in the process; a restart clears the windows. */
const windows = new Map<string, number>()

const prune = (now: number) => {
    if (windows.size < MAX_TRACKED) return
    for (const [key, until] of windows) if (until <= now) windows.delete(key)
    // still too many live windows: drop the oldest ones
    while (windows.size >= MAX_TRACKED) windows.delete(windows.keys().next().value as string)
}

/** For tests */
export const resetCooldownWindows = (): void => windows.clear()

class Cooldown_Agentflow implements INode {
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
        this.label = 'Cooldown'
        this.name = 'cooldownAgentflow'
        this.version = 1.0
        this.type = 'Cooldown'
        this.category = 'Agent Flows'
        this.description = 'Let a conversation through once per time window; further messages in the window take the cooling-down branch'
        this.baseClasses = [this.type]
        this.color = '#5BB7E5'
        this.inputs = [
            {
                label: 'Window (minutes)',
                name: 'cooldownMinutes',
                type: 'number',
                description: 'Per flow and conversation: the first arrival passes, later ones within this window are held back',
                default: 10
            }
        ]
        this.outputs = [
            { label: 'Pass', name: 'pass' },
            { label: 'Cooling Down', name: 'cooling' }
        ]
    }

    async run(nodeData: INodeData, _: string, options: ICommonObject): Promise<any> {
        const configured = Number(nodeData.inputs?.cooldownMinutes)
        const minutes = Number.isFinite(configured) && configured >= 0 ? configured : 10
        const talker = (options.agentflowRuntime?.wechat as ICommonObject | undefined)?.talker
        const conversation = typeof talker === 'string' ? talker.trim() : ''
        const state = options.agentflowRuntime?.state as ICommonObject

        const result = (pass: boolean, extra: ICommonObject = {}) => ({
            id: nodeData.id,
            name: this.name,
            input: { minutes, conversation: conversation || undefined },
            output: { passed: pass, ...extra, conditions: [{ isFulfilled: pass }, { isFulfilled: !pass }] },
            state
        })

        // without a conversation there is nothing to key the window on: let the run through and say why
        if (!conversation) return result(true, { reason: '没有会话上下文(流程不是由微信消息触发),冷却窗口未生效' })

        const now = Date.now()
        const key = `${options.chatflowid ?? ''}:${conversation}`
        const until = windows.get(key)
        if (until !== undefined && until > now) {
            return result(false, { remainingSeconds: Math.ceil((until - now) / 1000) })
        }
        prune(now)
        windows.set(key, now + minutes * 60_000)
        return result(true)
    }
}

module.exports = { nodeClass: Cooldown_Agentflow, resetCooldownWindows }
