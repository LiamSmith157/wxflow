import fs from 'fs'
import path from 'path'
import { ICommonObject, INode, INodeData, INodeOutputsValue, INodeParams } from '../../../src/Interface'
import {
    WECHAT_CATEGORY,
    WECHAT_CHANNEL,
    WECHAT_COLOR,
    fetchBranchResult,
    getChannels,
    instanceParam,
    listWechatInstances,
    text,
    triggerTypeProblem
} from './shared'

const MSG_TYPE_VOICE = 34

class WeChatFetchVoice_Agentflow implements INode {
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
    outputs: INodeOutputsValue[]

    constructor() {
        this.label = 'Fetch Voice'
        this.name = 'wechatFetchVoiceAgentflow'
        this.version = 1.0
        this.type = 'WeChatFetchVoice'
        this.category = WECHAT_CATEGORY
        this.description = 'Save the audio of a voice message as a WAV file and output its path'
        this.baseClasses = [this.type]
        this.color = WECHAT_COLOR
        this.inputs = [
            {
                label: 'Message ID (svrid)',
                name: 'wechatSvrid',
                type: 'string',
                description: 'Server id of the voice message. Defaults to the message that triggered the flow',
                default: '{{ $wechat.svrid }}',
                placeholder: '{{ $wechat.svrid }}',
                acceptVariable: true
            },
            instanceParam
        ]
        this.outputs = [
            { label: 'Success', name: 'success' },
            { label: 'Failed', name: 'failed' }
        ]
    }

    loadMethods = { listWechatInstances }

    async run(nodeData: INodeData, _: string, options: ICommonObject): Promise<any> {
        const channels = getChannels(options)
        const instance = await channels.resolveInstance(WECHAT_CHANNEL, text(nodeData.inputs?.wechatInstance))
        const svrid = text(nodeData.inputs?.wechatSvrid)
        const input = { svrid }
        const failed = (error: string) => fetchBranchResult(nodeData, this.name, options, input, false, { instance, svrid, error })

        if (!svrid || svrid === '0') return failed('缺少 svrid:当前流程不是由消息触发,请填写要取语音的消息 ID')
        // the id ends up in a file name: digits only
        if (!/^\d+$/.test(svrid)) return failed(`无效的消息 ID: ${svrid}`)
        const typeProblem = triggerTypeProblem(options, svrid, MSG_TYPE_VOICE, '语音')
        if (typeProblem) return failed(typeProblem)

        const outcome = await channels.fetchMedia(WECHAT_CHANNEL, instance, 'voice', svrid)
        if (!outcome.ok || !outcome.data || outcome.data.length === 0) return failed(outcome.error?.message ?? '没有取到语音数据')

        const dir = channels.mediaDir('voice')
        const file = path.join(dir, `voice-${svrid}-${Date.now()}.wav`)
        try {
            await fs.promises.mkdir(dir, { recursive: true })
            await fs.promises.writeFile(file, outcome.data)
        } catch (e) {
            return failed(`无法保存语音文件: ${(e as Error).message}`)
        }
        return fetchBranchResult(nodeData, this.name, options, input, true, {
            instance,
            svrid,
            path: file,
            size: outcome.data.length,
            contentType: outcome.result?.contentType
        })
    }
}

module.exports = { nodeClass: WeChatFetchVoice_Agentflow }
