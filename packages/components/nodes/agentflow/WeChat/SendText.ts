import { ICommonObject, INode, INodeData, INodeParams } from '../../../src/Interface'
import { WECHAT_CATEGORY, WECHAT_COLOR, listWechatInstances, prepareSend, recipientParam, sendMethod, sendTailParams, text } from './shared'

class WeChatSendText_Agentflow implements INode {
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

    constructor() {
        this.label = 'Send Text'
        this.name = 'wechatSendTextAgentflow'
        this.version = 1.0
        this.type = 'WeChatSendText'
        this.category = WECHAT_CATEGORY
        this.description = 'Send a text message from a WeChat account'
        this.baseClasses = [this.type]
        this.color = WECHAT_COLOR
        this.inputs = [
            recipientParam,
            {
                label: 'Content',
                name: 'wechatText',
                type: 'string',
                rows: 4,
                acceptVariable: true
            },
            ...sendTailParams
        ]
    }

    loadMethods = { listWechatInstances }

    async run(nodeData: INodeData, _: string, options: ICommonObject): Promise<any> {
        const ctx = await prepareSend(nodeData, options, 'wechatTo')
        const content = text(nodeData.inputs?.wechatText)
        if (!content) throw new Error('发送内容为空:请填写要发送的文本')
        return sendMethod(nodeData, this.name, ctx, 'send.text', { wxid: ctx.to, content }, { to: ctx.to, content })
    }
}

module.exports = { nodeClass: WeChatSendText_Agentflow }
