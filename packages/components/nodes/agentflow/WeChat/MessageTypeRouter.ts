import { ICommonObject, INode, INodeData, INodeOutputsValue, INodeParams } from '../../../src/Interface'
import { WECHAT_CATEGORY, WECHAT_COLOR, branch } from './shared'

/** Main message type -> branch index; everything else, and every event that is not a message, goes to "Other" */
const BRANCH_BY_TYPE: Record<string, number> = { '1': 0, '3': 1, '34': 2, '5': 3, '6': 4, '43': 5 }
const OTHER_BRANCH = 6

class WeChatMessageTypeRouter_Agentflow implements INode {
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
        this.label = 'Message Type Router'
        this.name = 'wechatMessageTypeRouterAgentflow'
        this.version = 1.0
        this.type = 'WeChatMessageTypeRouter'
        this.category = WECHAT_CATEGORY
        this.description = 'Continue along a branch chosen by the type of the message that triggered the flow'
        this.baseClasses = [this.type]
        this.color = WECHAT_COLOR
        this.inputs = []
        // an output without a connection simply ends that branch
        this.outputs = [
            { label: 'Text', name: 'text' },
            { label: 'Image', name: 'image' },
            { label: 'Voice', name: 'voice' },
            { label: 'Link', name: 'link' },
            { label: 'File', name: 'file' },
            { label: 'Video', name: 'video' },
            { label: 'Other', name: 'other', description: 'Other message types and events that are not messages' }
        ]
    }

    async run(nodeData: INodeData, _: string, options: ICommonObject): Promise<any> {
        const event = (options.agentflowRuntime?.wechat ?? {}) as ICommonObject
        const isMessage = event.event === 'msg.insert' && event.msgType !== undefined && event.msgType !== null
        const selected = isMessage ? BRANCH_BY_TYPE[String(event.msgType)] ?? OTHER_BRANCH : OTHER_BRANCH
        return {
            id: nodeData.id,
            name: this.name,
            input: { msgType: isMessage ? event.msgType : undefined },
            output: { conditions: branch(this.outputs.length, selected), branch: this.outputs[selected].name },
            state: options.agentflowRuntime?.state as ICommonObject
        }
    }
}

module.exports = { nodeClass: WeChatMessageTypeRouter_Agentflow }
