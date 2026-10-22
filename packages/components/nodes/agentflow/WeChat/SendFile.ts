import { ICommonObject, INode, INodeData, INodeParams } from '../../../src/Interface'
import {
    WECHAT_CATEGORY,
    WECHAT_COLOR,
    listAllResources,
    listWechatInstances,
    mediaParam,
    recipientParam,
    sendMedia,
    sendTailParams
} from './shared'

class WeChatSendFile_Agentflow implements INode {
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
        this.label = 'Send File'
        this.name = 'wechatSendFileAgentflow'
        this.version = 1.1
        this.type = 'WeChatSendFile'
        this.category = WECHAT_CATEGORY
        this.description = 'Send a file from a WeChat account'
        this.baseClasses = [this.type]
        this.color = WECHAT_COLOR
        this.inputs = [
            recipientParam,
            mediaParam(
                'File',
                'The file to send: pick one from the resource library, or enter the full path of a file on this machine, an http(s) URL, or res://name/<resource name> (the name may contain variables)',
                'listAllResources'
            ),
            ...sendTailParams
        ]
    }

    loadMethods = { listWechatInstances, listAllResources }

    async run(nodeData: INodeData, _: string, options: ICommonObject): Promise<any> {
        return sendMedia(nodeData, options, this.name, 'send.file')
    }
}

module.exports = { nodeClass: WeChatSendFile_Agentflow }
