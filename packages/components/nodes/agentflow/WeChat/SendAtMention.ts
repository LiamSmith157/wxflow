import { ICommonObject, INode, INodeData, INodeParams } from '../../../src/Interface'
import { WECHAT_CATEGORY, WECHAT_COLOR, listWechatInstances, prepareSend, sendMethod, sendTailParams, text } from './shared'

class WeChatSendAtMention_Agentflow implements INode {
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
        this.label = 'Send @Mention'
        this.name = 'wechatSendAtMentionAgentflow'
        this.version = 1.0
        this.type = 'WeChatSendAtMention'
        this.category = WECHAT_CATEGORY
        this.description = 'Send a group message that @mentions a member or everyone'
        this.baseClasses = [this.type]
        this.color = WECHAT_COLOR
        this.inputs = [
            {
                label: 'Group',
                name: 'wechatGroup',
                type: 'string',
                description: 'Chatroom id to send to. Defaults to the conversation that triggered the flow',
                default: '{{ $wechat.talker }}',
                placeholder: '{{ $wechat.talker }}',
                acceptVariable: true
            },
            {
                label: 'Content',
                name: 'wechatText',
                type: 'string',
                rows: 4,
                acceptVariable: true
            },
            {
                label: '@ Everyone',
                name: 'wechatAtAll',
                type: 'boolean',
                optional: true
            },
            {
                label: 'Member wxid',
                name: 'wechatAtWxid',
                type: 'string',
                description: 'wxid of the member to @mention. Required unless @ Everyone is on',
                default: '{{ $wechat.sender }}',
                placeholder: '{{ $wechat.sender }}',
                acceptVariable: true,
                optional: true,
                show: { wechatAtAll: false }
            },
            {
                label: 'Member Nickname',
                name: 'wechatAtNick',
                type: 'string',
                description: 'Nickname shown in the @mention (optional)',
                acceptVariable: true,
                optional: true,
                show: { wechatAtAll: false }
            },
            ...sendTailParams
        ]
    }

    loadMethods = { listWechatInstances }

    async run(nodeData: INodeData, _: string, options: ICommonObject): Promise<any> {
        const atAll = nodeData.inputs?.wechatAtAll === true || nodeData.inputs?.wechatAtAll === 'true'
        const atWxid = text(nodeData.inputs?.wechatAtWxid)
        // checked before anything is sent or resolved: a group message that mentions nobody is a configuration error
        if (!atAll && !atWxid) throw new Error('缺少被@的成员:请填写成员 wxid,或勾选 @所有人')
        const ctx = await prepareSend(nodeData, options, 'wechatGroup')
        const content = text(nodeData.inputs?.wechatText)
        if (!content) throw new Error('发送内容为空:请填写要发送的文本')
        const params: Record<string, any> = { group: ctx.to, text: content, atAll }
        if (!atAll) {
            params.atWxid = atWxid
            const atNick = text(nodeData.inputs?.wechatAtNick)
            if (atNick) params.atNick = atNick
        }
        return sendMethod(nodeData, this.name, ctx, 'send.at', params, {
            group: ctx.to,
            content,
            atAll,
            atWxid: atAll ? undefined : atWxid
        })
    }
}

module.exports = { nodeClass: WeChatSendAtMention_Agentflow }
