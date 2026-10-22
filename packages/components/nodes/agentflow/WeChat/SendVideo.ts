import { ICommonObject, INode, INodeData, INodeParams } from '../../../src/Interface'
import { WECHAT_CATEGORY, WECHAT_COLOR, listWechatInstances, mediaParam, recipientParam, sendMedia, sendTailParams } from './shared'

class WeChatSendVideo_Agentflow implements INode {
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
        this.label = 'Send Video'
        this.name = 'wechatSendVideoAgentflow'
        this.version = 1.0
        this.type = 'WeChatSendVideo'
        this.category = WECHAT_CATEGORY
        this.description = 'Send a video from a WeChat account'
        this.baseClasses = [this.type]
        this.color = WECHAT_COLOR
        this.inputs = [
            recipientParam,
            mediaParam(
                'Video (path or URL)',
                'The mp4 video to send: a path relative to the assets folder, a path inside the exchange folder, or an http(s) URL'
            ),
            {
                label: 'Duration (seconds)',
                name: 'wechatVideoDuration',
                type: 'number',
                description: 'Length of the video (optional)',
                optional: true
            },
            ...sendTailParams
        ]
    }

    loadMethods = { listWechatInstances }

    async run(nodeData: INodeData, _: string, options: ICommonObject): Promise<any> {
        const duration = Number(nodeData.inputs?.wechatVideoDuration)
        return sendMedia(nodeData, options, this.name, 'send.video', Number.isFinite(duration) && duration > 0 ? { duration } : {})
    }
}

module.exports = { nodeClass: WeChatSendVideo_Agentflow }
