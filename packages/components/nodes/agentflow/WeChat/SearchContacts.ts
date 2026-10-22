import { ICommonObject, INode, INodeData, INodeParams } from '../../../src/Interface'
import { WECHAT_CATEGORY, WECHAT_CHANNEL, WECHAT_COLOR, getChannels, instanceParam, listWechatInstances, text } from './shared'

class WeChatSearchContacts_Agentflow implements INode {
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
        this.label = 'Search Contacts'
        this.name = 'wechatSearchContactsAgentflow'
        this.version = 1.0
        this.type = 'WeChatSearchContacts'
        this.category = WECHAT_CATEGORY
        this.description = 'Look up one contact (nickname, avatar) or list all friends'
        this.baseClasses = [this.type]
        this.color = WECHAT_COLOR
        this.inputs = [
            {
                label: 'Mode',
                name: 'wechatContactMode',
                type: 'options',
                options: [
                    { label: 'Single Contact', name: 'single', description: 'Nickname and avatar of one wxid' },
                    {
                        label: 'All Friends',
                        name: 'all',
                        description: 'Full friend list; slow for large accounts, avoid in high-traffic flows'
                    }
                ],
                default: 'single'
            },
            {
                label: 'wxid',
                name: 'wechatContactWxid',
                type: 'string',
                description: 'wxid of the contact to look up',
                default: '{{ $wechat.sender }}',
                placeholder: '{{ $wechat.sender }}',
                acceptVariable: true,
                show: { wechatContactMode: 'single' }
            },
            instanceParam
        ]
    }

    loadMethods = { listWechatInstances }

    async run(nodeData: INodeData, _: string, options: ICommonObject): Promise<any> {
        const channels = getChannels(options)
        const mode = text(nodeData.inputs?.wechatContactMode) === 'all' ? 'all' : 'single'
        const wxid = text(nodeData.inputs?.wechatContactWxid)
        if (mode === 'single' && !wxid) throw new Error('缺少 wxid:单个联系人模式需要填写要查询的 wxid')
        const instance = await channels.resolveInstance(WECHAT_CHANNEL, text(nodeData.inputs?.wechatInstance))

        const outcome =
            mode === 'single'
                ? await channels.call(WECHAT_CHANNEL, instance, 'contacts.avatar', { wxid })
                : await channels.call(WECHAT_CHANNEL, instance, 'contacts.list', { type: 'friend' })
        if (!outcome.ok) throw new Error(`查询联系人失败: ${outcome.error?.message ?? '未知错误'}`)

        const result = (outcome.result ?? {}) as ICommonObject
        const output: ICommonObject =
            mode === 'single'
                ? { mode, instance, wxid, contact: result, nick: result.nick, avatar: result.avatar }
                : {
                      mode,
                      instance,
                      contacts: result.items ?? [],
                      count: Array.isArray(result.items) ? result.items.length : result.count ?? 0
                  }
        return {
            id: nodeData.id,
            name: this.name,
            input: mode === 'single' ? { mode, wxid } : { mode },
            output,
            state: options.agentflowRuntime?.state as ICommonObject
        }
    }
}

module.exports = { nodeClass: WeChatSearchContacts_Agentflow }
