import { ICommonObject, INode, INodeData, INodeParams } from '../../../src/Interface'
import { WECHAT_CATEGORY, WECHAT_COLOR, listWechatInstances, mediaParam, recipientParam, sendMedia, sendTailParams } from './shared'

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
        this.version = 1.0
        this.type = 'WeChatSendImage'
        this.category = WECHAT_CATEGORY
        this.description = 'Send an image from a WeChat account'
        this.baseClasses = [this.type]
        this.color = WECHAT_COLOR
        this.inputs = [
            recipientParam,
            mediaParam(
                'Image (path or URL)',
                'The image to send: a path relative to the assets folder, a path inside the exchange folder, or an http(s) URL'
            ),
            ...sendTailParams
        ]
    }

    loadMethods = { listWechatInstances }

    async run(nodeData: INodeData, _: string, options: ICommonObject): Promise<any> {
        return sendMedia(nodeData, options, this.name, 'send.image')
    }
}

module.exports = { nodeClass: WeChatSendImage_Agentflow }
