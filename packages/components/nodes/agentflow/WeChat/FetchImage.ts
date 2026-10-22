import fs from 'fs'
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

const DEFAULT_WAIT_SECONDS = 8
const MAX_WAIT_SECONDS = 60
const MSG_TYPE_IMAGE = 3

class WeChatFetchImage_Agentflow implements INode {
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
        this.label = 'Fetch Image'
        this.name = 'wechatFetchImageAgentflow'
        this.version = 1.0
        this.type = 'WeChatFetchImage'
        this.category = WECHAT_CATEGORY
        this.description = 'Decrypt an image of a received message and output the path of the file'
        this.baseClasses = [this.type]
        this.color = WECHAT_COLOR
        this.inputs = [
            {
                label: 'Message ID (svrid)',
                name: 'wechatSvrid',
                type: 'string',
                description: 'Server id of the image message. Defaults to the message that triggered the flow',
                default: '{{ $wechat.svrid }}',
                placeholder: '{{ $wechat.svrid }}',
                acceptVariable: true
            },
            {
                label: 'Image Size',
                name: 'wechatImageKind',
                type: 'options',
                options: [
                    { label: 'Original', name: 'raw' },
                    { label: 'High Quality', name: 'hd' },
                    { label: 'Thumbnail', name: 'thumb', description: 'Fast and small, enough to classify an image' }
                ],
                default: 'raw'
            },
            {
                label: 'Wait for Download (seconds)',
                name: 'wechatWaitDownload',
                type: 'number',
                description:
                    'Messages arrive immediately but the image downloads later. How long to wait for it (default 8, at most 60); 0 checks once',
                default: DEFAULT_WAIT_SECONDS,
                optional: true
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
        const kind = ['raw', 'hd', 'thumb'].includes(text(nodeData.inputs?.wechatImageKind))
            ? text(nodeData.inputs?.wechatImageKind)
            : 'raw'
        const rawWait = nodeData.inputs?.wechatWaitDownload
        const wait = rawWait === undefined || rawWait === '' || rawWait === null ? DEFAULT_WAIT_SECONDS : Number(rawWait)
        const waitSeconds = Math.min(MAX_WAIT_SECONDS, Math.max(0, Number.isFinite(wait) ? wait : DEFAULT_WAIT_SECONDS))
        const input = { svrid, kind, waitSeconds }
        const failed = (error: string) => fetchBranchResult(nodeData, this.name, options, input, false, { instance, svrid, error })

        if (!svrid || svrid === '0') return failed('缺少 svrid:当前流程不是由消息触发,请填写要取图的消息 ID')
        const typeProblem = triggerTypeProblem(options, svrid, MSG_TYPE_IMAGE, '图片')
        if (typeProblem) return failed(typeProblem)

        // the DLL decrypts into wxflow's own images folder, which wxflow reads back
        const outDir = channels.mediaDir('images')
        // the DLL polls up to waitSeconds; the call timeout leaves a margin on top
        const outcome = await channels.call(
            WECHAT_CHANNEL,
            instance,
            'image.get',
            { svrid, kind, waitSeconds, outDir },
            (waitSeconds + 15) * 1000
        )
        if (!outcome.ok) return failed(outcome.error?.message ?? 'image.get 失败')

        const result = (outcome.result ?? {}) as ICommonObject
        if (typeof result.path !== 'string' || !result.path) return failed('微信没有返回图片路径')
        const localPath = result.path
        if (!fs.existsSync(localPath)) return failed(`图片已解密,但找不到文件 ${localPath}`)
        return fetchBranchResult(nodeData, this.name, options, input, true, {
            instance,
            svrid,
            path: localPath,
            fmt: result.fmt,
            size: result.size
        })
    }
}

module.exports = { nodeClass: WeChatFetchImage_Agentflow }
