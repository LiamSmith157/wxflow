import { ICommonObject, INode, INodeData, INodeParams } from '../../../src/Interface'
import { WECHAT_CATEGORY, WECHAT_COLOR, listWechatInstances, prepareSend, recipientParam, sendMethod, sendTailParams, text } from './shared'

class WeChatSendLinkCard_Agentflow implements INode {
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
        this.label = 'Send Link Card'
        this.name = 'wechatSendLinkCardAgentflow'
        this.version = 1.0
        this.type = 'WeChatSendLinkCard'
        this.category = WECHAT_CATEGORY
        this.description = 'Send a link card with title, description and URL'
        this.baseClasses = [this.type]
        this.color = WECHAT_COLOR
        this.inputs = [
            recipientParam,
            { label: 'Title', name: 'wechatCardTitle', type: 'string', acceptVariable: true },
            { label: 'URL', name: 'wechatCardUrl', type: 'string', placeholder: 'https://', acceptVariable: true },
            { label: 'Description', name: 'wechatCardDesc', type: 'string', rows: 3, acceptVariable: true, optional: true },
            ...sendTailParams
        ]
    }

    loadMethods = { listWechatInstances }

    async run(nodeData: INodeData, _: string, options: ICommonObject): Promise<any> {
        const ctx = await prepareSend(nodeData, options, 'wechatTo')
        const title = text(nodeData.inputs?.wechatCardTitle)
        const url = text(nodeData.inputs?.wechatCardUrl)
        if (!title) throw new Error('链接卡片缺少标题')
        if (!url) throw new Error('链接卡片缺少 URL')
        const params: Record<string, any> = { wxid: ctx.to, title, url }
        const desc = text(nodeData.inputs?.wechatCardDesc)
        if (desc) params.desc = desc
        return sendMethod(nodeData, this.name, ctx, 'send.webcard', params, { to: ctx.to, title, url, desc: desc || undefined })
    }
}

module.exports = { nodeClass: WeChatSendLinkCard_Agentflow }
