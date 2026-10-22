import { ICommonObject, INode, INodeData, INodeParams } from '../../../src/Interface'
import {
    WECHAT_CATEGORY,
    WECHAT_CHANNEL,
    WECHAT_COLOR,
    listWechatInstances,
    prepareSend,
    recipientParam,
    sendMethod,
    sendTailParams,
    text
} from './shared'

class WeChatQuoteReply_Agentflow implements INode {
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
        this.label = 'Quote Reply'
        this.name = 'wechatQuoteReplyAgentflow'
        this.version = 1.0
        this.type = 'WeChatQuoteReply'
        this.category = WECHAT_CATEGORY
        this.description = 'Reply to the message that triggered the flow, quoting it'
        this.baseClasses = [this.type]
        this.color = WECHAT_COLOR
        this.inputs = [
            recipientParam,
            { label: 'Content', name: 'wechatText', type: 'string', rows: 4, acceptVariable: true },
            ...sendTailParams
        ]
    }

    loadMethods = { listWechatInstances }

    async run(nodeData: INodeData, _: string, options: ICommonObject): Promise<any> {
        // the quoted message is always the one that triggered the flow
        const event = (options.agentflowRuntime?.wechat ?? {}) as ICommonObject
        if (event.channel !== WECHAT_CHANNEL || event.event !== 'msg.insert' || !event.svrid) {
            throw new Error('引用回复只能用于由"收到消息"事件触发的流程:当前流程没有可引用的消息')
        }
        const ctx = await prepareSend(nodeData, options, 'wechatTo')
        const content = text(nodeData.inputs?.wechatText)
        if (!content) throw new Error('发送内容为空:请填写要发送的文本')
        const params = {
            wxid: ctx.to,
            text: content,
            svrid: String(event.svrid),
            refContent: String(event.content ?? '').slice(0, 200),
            refFrom: String(event.sender ?? ''),
            refChat: String(event.talker ?? ''),
            self: ctx.instance
        }
        return sendMethod(nodeData, this.name, ctx, 'send.quote', params, { to: ctx.to, content, quotedSvrid: params.svrid })
    }
}

module.exports = { nodeClass: WeChatQuoteReply_Agentflow }
