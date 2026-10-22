import { ICommonObject, INode, INodeData, INodeParams } from '../../../src/Interface'
import {
    WECHAT_CATEGORY,
    WECHAT_COLOR,
    listImageResources,
    listWechatInstances,
    mediaParam,
    recipientParam,
    sendMedia,
    sendTailParams
} from './shared'

class WeChatSendImage_Agentflow implements INode {
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
        this.label = 'Send Image'
        this.name = 'wechatSendImageAgentflow'
        this.version = 1.1
        this.type = 'WeChatSendImage'
        this.category = WECHAT_CATEGORY
        this.description = 'Send an image from a WeChat account'
        this.baseClasses = [this.type]
        this.color = WECHAT_COLOR
        this.inputs = [
            recipientParam,
            mediaParam(
                'Image',
                'The image to send: pick one from the resource library, or enter the full path of a file on this machine, an http(s) URL, or res://name/<resource name> (the name may contain variables)',
                'listImageResources'
            ),
            ...sendTailParams
        ]
    }

    loadMethods = { listWechatInstances, listImageResources }

    async run(nodeData: INodeData, _: string, options: ICommonObject): Promise<any> {
        return sendMedia(nodeData, options, this.name, 'send.image', {}, ['image'])
    }
}

module.exports = { nodeClass: WeChatSendImage_Agentflow }
