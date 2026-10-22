import { ICommonObject, INode, INodeData, INodeParams } from '../../../src/Interface'
import {
    WECHAT_CATEGORY,
    WECHAT_COLOR,
    listVideoResources,
    listWechatInstances,
    mediaParam,
    recipientParam,
    sendMedia,
    sendTailParams
} from './shared'

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
        this.version = 1.1
        this.type = 'WeChatSendVideo'
        this.category = WECHAT_CATEGORY
        this.description = 'Send a video from a WeChat account'
        this.baseClasses = [this.type]
        this.color = WECHAT_COLOR
        this.inputs = [
            recipientParam,
            mediaParam(
                'Video',
                'The mp4 video to send: pick one from the resource library, or enter the full path of a file on this machine, an http(s) URL, or res://name/<resource name> (the name may contain variables)',
                'listVideoResources'
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

    loadMethods = { listWechatInstances, listVideoResources }

    async run(nodeData: INodeData, _: string, options: ICommonObject): Promise<any> {
        const duration = Number(nodeData.inputs?.wechatVideoDuration)
        return sendMedia(nodeData, options, this.name, 'send.video', Number.isFinite(duration) && duration > 0 ? { duration } : {}, [
            'video'
        ])
    }
}

module.exports = { nodeClass: WeChatSendVideo_Agentflow }
