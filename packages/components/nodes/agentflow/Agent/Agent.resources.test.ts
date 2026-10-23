import fs from 'fs'
import os from 'os'
import path from 'path'
import { AIMessageChunk } from '@langchain/core/messages'
import { IResourceFile, IResourceRuntime } from '../../../src/Interface'
import { clearResourceTextCache } from '../../../src/resourceText'

// The node is run with a fake chat model and a fake tool; the modules that pull in storage, analytics and every provider
// are replaced
jest.mock('../utils', () => ({
    addImageArtifactsToMessages: jest.fn(async () => undefined),
    extractArtifactsFromResponse: jest.fn(async () => ({ artifacts: [], fileAnnotations: [], savedInlineImages: [] })),
    getPastChatHistoryImageMessages: jest.fn(async (history: any[]) => ({ updatedPastMessages: history })),
    getUniqueImageMessages: jest.fn(async () => undefined),
    processMessagesWithImages: jest.fn(async (messages: any[]) => ({ updatedMessages: messages, transformedMessages: [] })),
    revertBase64ImagesToFileRefs: jest.fn((messages: any[]) => messages),
    normalizeMessagesForStorage: jest.fn((messages: any[]) => messages),
    replaceInlineDataWithFileReferences: jest.fn(),
    updateFlowState: jest.requireActual('../../../src/flowState').updateFlowState
}))
jest.mock('../../../src/utils', () => ({
    processTemplateVariables: jest.requireActual('../../../src/flowState').processTemplateVariables,
    configureStructuredOutput: jest.fn((model: any) => model),
    convertMultiOptionsToStringArray: jest.fn(() => []),
    toolSchemaToJsonSchema: jest.fn(() => ({})),
    extractResponseContent: jest.fn((response: any) => (typeof response?.content === 'string' ? response.content : ''))
}))
jest.mock('../../../src/agents', () => ({
    ARTIFACTS_PREFIX: '<<ARTIFACTS>>',
    SOURCE_DOCUMENTS_PREFIX: '<<DOCS>>',
    TOOL_ARGS_PREFIX: '<<ARGS>>'
}))
jest.mock('../../../src/error', () => ({ getErrorMessage: (e: any) => (e instanceof Error ? e.message : String(e)) }))
jest.mock('../../../src/handler', () => ({}))
jest.mock('../../../src/modelLoader', () => ({
    getModelConfigByModelName: jest.fn(async () => undefined),
    MODEL_TYPE: { CHAT: 'chat' }
}))

const node = new (require('./Agent').nodeClass)()

let dir: string
let library: IResourceFile[]
let calls: any[][]
let replies: AIMessageChunk[]

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 9, 8, 7])

const add = (over: Partial<IResourceFile> & { name: string; ext: string }, content: string | Buffer = 'x'): IResourceFile => {
    const id = `id-${library.length + 1}`
    const file = path.join(dir, `${id}${over.ext}`)
    fs.writeFileSync(file, content)
    const resource: IResourceFile = {
        id,
        groupName: null,
        kind: 'file',
        mimeType: 'text/plain',
        size: Buffer.byteLength(content),
        path: file,
        ref: `res://id/${id}`,
        ...over
    }
    library.push(resource)
    return resource
}

const runtime: IResourceRuntime = {
    workspaceId: 'wsA',
    async load(ref, options) {
        if (!ref.startsWith('res://')) throw new Error(`\`${ref}\` 不是资源库中的资源:这里只能使用资源库中的资源`)
        const found = library.find((r) => r.ref === ref || `res://name/${r.name}` === ref)
        if (!found) throw new Error(`资源 \`${ref}\` 不存在`)
        if (options?.kinds && !options.kinds.includes(found.kind)) throw new Error(`资源 \`${found.name}\` 是${found.kind},不能使用`)
        return found
    }
}

const nodeData = (inputs: Record<string, any> = {}): any => ({
    id: 'agentAgentflow_0',
    label: 'Agent',
    inputs: {
        agentModel: 'fakeChat',
        agentModelConfig: { allowImageUploads: true },
        agentMessages: [{ role: 'user', content: '保修期多久?' }],
        agentTools: [],
        ...inputs
    }
})

const options = (extra: Record<string, any> = {}): any => ({
    componentNodes: {
        fakeChat: { filePath: path.join(dir, 'fakeChat.js'), label: 'Fake Chat' },
        fakeTool: { filePath: path.join(dir, 'fakeTool.js') }
    },
    agentflowRuntime: { state: {} },
    chatId: 'chat-1',
    pastChatHistory: [],
    prependedChatHistory: [],
    resources: runtime,
    ...extra
})

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wxflow-agentres-'))
    library = []
    calls = []
    replies = []
    clearResourceTextCache()
    ;(globalThis as any).__fakeAgentModel = {
        invoke: async (messages: any[]) => {
            calls.push(JSON.parse(JSON.stringify(messages)))
            return replies.shift() ?? new AIMessageChunk('两年')
        },
        bindTools() {
            return this
        },
        getNumTokens: async () => 1
    }
    ;(globalThis as any).__fakeAgentTool = { name: 'lookup', description: 'Look something up', call: async () => '工具返回的结果' }
    fs.writeFileSync(
        path.join(dir, 'fakeChat.js'),
        'module.exports = { nodeClass: class { constructor() { this.inputs = [] } async init() { return globalThis.__fakeAgentModel } } }'
    )
    fs.writeFileSync(
        path.join(dir, 'fakeTool.js'),
        'module.exports = { nodeClass: class { constructor() { this.inputs = [] } async init() { return globalThis.__fakeAgentTool } } }'
    )
})
afterEach(() => {
    delete (globalThis as any).__fakeAgentModel
    delete (globalThis as any).__fakeAgentTool
    fs.rmSync(dir, { recursive: true, force: true })
})

const textOf = (message: any): string =>
    typeof message.content === 'string'
        ? message.content
        : Array.isArray(message.content)
        ? message.content.map((c: any) => c.text ?? '').join('')
        : ''

describe('Agent node: attach resources parameter', () => {
    it('comes after the messages, and its dropdown is served by the node', () => {
        const names = node.inputs.map((p: any) => p.name)
        expect(names.indexOf('agentResources')).toBe(names.indexOf('agentMessages') + 1)
        expect(node.inputs[names.indexOf('agentResources')]).toMatchObject({ type: 'array', optional: true, acceptVariable: true })
        expect(typeof node.loadMethods.listAttachableResources).toBe('function')
    })

    it('raises the node version, since the inputs changed', () => {
        expect(node.version).toBe(3.3)
    })
})

describe('Agent node: attached resources', () => {
    it('gives a document to the model as text before the question', async () => {
        const manual = add({ name: '产品手册', ext: '.txt' }, '整机保修二十四个月')
        await node.run(nodeData({ agentResources: [{ resource: manual.ref }] }), '', options())
        expect(calls).toHaveLength(1)
        expect(calls[0].map(textOf)).toEqual(['以下是资源《产品手册》的内容:\n\n整机保修二十四个月', '保修期多久?'])
    })

    it('gives an image to the model as image input when the model takes images, and refuses when it does not', async () => {
        const poster = add({ name: '海报-北京', ext: '.png', kind: 'image', mimeType: 'image/png' }, PNG)
        await node.run(nodeData({ agentResources: [{ resource: poster.ref }] }), '', options())
        expect(calls[0][0].content).toEqual([{ type: 'image_url', image_url: { url: `data:image/png;base64,${PNG.toString('base64')}` } }])

        calls = []
        await expect(
            node.run(
                nodeData({ agentModelConfig: { allowImageUploads: false }, agentResources: [{ resource: poster.ref }] }),
                '',
                options()
            )
        ).rejects.toThrow(/海报-北京.*没有开启图片输入/)
        expect(calls).toHaveLength(0)
    })

    it('leaves the attachment out of the messages it returns for the execution, and lists the resources instead', async () => {
        const manual = add({ name: '产品手册', ext: '.txt' }, '整机保修二十四个月')
        const poster = add({ name: '海报-北京', ext: '.png', kind: 'image', mimeType: 'image/png' }, PNG)
        const result = await node.run(nodeData({ agentResources: [{ resource: manual.ref }, { resource: poster.ref }] }), '', options())

        expect(result.input.messages.map(textOf)).toEqual(['保修期多久?'])
        expect(result.input.resources).toEqual([
            { name: '产品手册', kind: 'file' },
            { name: '海报-北京', kind: 'image' }
        ])
        const recorded = JSON.stringify(result)
        expect(recorded).not.toContain('整机保修二十四个月')
        expect(recorded).not.toContain(PNG.toString('base64'))
    })

    it('sends the same messages as before when nothing is attached', async () => {
        const result = await node.run(nodeData(), '', options())
        expect(calls[0].map(textOf)).toEqual(['保修期多久?'])
        expect(result.input).not.toHaveProperty('resources')
    })

    it('fails for a video, naming the resource', async () => {
        const video = add({ name: '开业视频', ext: '.mp4', kind: 'video' })
        await expect(node.run(nodeData({ agentResources: [{ resource: video.ref }] }), '', options())).rejects.toThrow(/开业视频/)
    })
})

describe('Agent node: attached resources and tool calls', () => {
    const toolCall = () =>
        new AIMessageChunk({ content: '', tool_calls: [{ name: 'lookup', args: { q: '保修' }, id: 'call_1', type: 'tool_call' }] })

    it('keeps the attachment for every turn of the tool calls, once, ahead of the question', async () => {
        const manual = add({ name: '产品手册', ext: '.txt' }, '整机保修二十四个月')
        replies = [toolCall(), new AIMessageChunk('两年')]
        const result = await node.run(
            nodeData({
                agentTools: [{ agentSelectedTool: 'fakeTool', agentSelectedToolConfig: {} }],
                agentResources: [{ resource: manual.ref }]
            }),
            '',
            options()
        )

        expect(calls).toHaveLength(2)
        const attachments = (messages: any[]) => messages.filter((m) => textOf(m).startsWith('以下是资源《产品手册》'))
        expect(attachments(calls[0])).toHaveLength(1)
        expect(attachments(calls[1])).toHaveLength(1)
        // the second turn sees the tool call and its result after the question
        expect(calls[1]).toHaveLength(4)
        expect(textOf(calls[1][0])).toContain('以下是资源《产品手册》')
        expect(textOf(calls[1][1])).toBe('保修期多久?')
        expect(calls[1][3].role).toBe('tool')
        expect(textOf(calls[1][3])).toBe('工具返回的结果')

        expect(result.output.content).toBe('两年')
        expect(result.input.messages.some((m: any) => textOf(m).startsWith('以下是资源《产品手册》'))).toBe(false)
        expect(JSON.stringify(result)).not.toContain('整机保修二十四个月')
    })
})
