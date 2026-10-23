import fs from 'fs'
import os from 'os'
import path from 'path'
import { AIMessageChunk } from '@langchain/core/messages'
import { IResourceFile, IResourceRuntime } from '../../../src/Interface'
import { clearResourceTextCache } from '../../../src/resourceText'

// The node is run with a fake chat model; the modules that pull in storage, analytics and every provider are replaced
jest.mock('../utils', () => ({
    addImageArtifactsToMessages: jest.fn(async () => undefined),
    extractArtifactsFromResponse: jest.fn(async () => ({ artifacts: [], fileAnnotations: [], savedInlineImages: [] })),
    getPastChatHistoryImageMessages: jest.fn(async (history: any[]) => ({ updatedPastMessages: history })),
    getUniqueImageMessages: jest.fn(async () => undefined),
    processMessagesWithImages: jest.fn(async (messages: any[]) => ({ updatedMessages: messages, transformedMessages: [] })),
    revertBase64ImagesToFileRefs: jest.fn((messages: any[]) => messages),
    replaceInlineDataWithFileReferences: jest.fn(),
    updateFlowState: jest.requireActual('../../../src/flowState').updateFlowState
}))
jest.mock('../../../src/utils', () => ({
    processTemplateVariables: jest.requireActual('../../../src/flowState').processTemplateVariables,
    configureStructuredOutput: jest.fn((model: any) => model),
    extractResponseContent: jest.fn((response: any) => (typeof response?.content === 'string' ? response.content : ''))
}))
jest.mock('../../../src/handler', () => ({}))
jest.mock('../../../src/modelLoader', () => ({
    getModelConfigByModelName: jest.fn(async () => undefined),
    MODEL_TYPE: { CHAT: 'chat' }
}))

const node = new (require('./LLM').nodeClass)()

let dir: string
let library: IResourceFile[]
let calls: any[][]

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
    id: 'llmAgentflow_0',
    label: 'LLM',
    inputs: {
        llmModel: 'fakeChat',
        llmModelConfig: { allowImageUploads: true },
        llmMessages: [{ role: 'user', content: '保修期多久?' }],
        ...inputs
    }
})

const options = (extra: Record<string, any> = {}): any => ({
    componentNodes: { fakeChat: { filePath: path.join(dir, 'fakeChat.js'), label: 'Fake Chat' } },
    agentflowRuntime: { state: {} },
    chatId: 'chat-1',
    pastChatHistory: [],
    prependedChatHistory: [],
    resources: runtime,
    ...extra
})

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wxflow-llmres-'))
    library = []
    calls = []
    clearResourceTextCache()
    ;(globalThis as any).__fakeChatModel = {
        invoke: async (messages: any[]) => {
            calls.push(JSON.parse(JSON.stringify(messages)))
            return new AIMessageChunk('两年')
        },
        getNumTokens: async () => 1
    }
    fs.writeFileSync(
        path.join(dir, 'fakeChat.js'),
        'module.exports = { nodeClass: class { constructor() { this.inputs = [] } async init() { return globalThis.__fakeChatModel } } }'
    )
})
afterEach(() => {
    delete (globalThis as any).__fakeChatModel
    fs.rmSync(dir, { recursive: true, force: true })
})

const textOf = (message: any): string =>
    typeof message.content === 'string' ? message.content : message.content.map((c: any) => c.text ?? '').join('')

describe('LLM node: attach resources parameter', () => {
    it('comes after the messages, and its dropdown is served by the node', () => {
        const names = node.inputs.map((p: any) => p.name)
        expect(names.indexOf('llmResources')).toBe(names.indexOf('llmMessages') + 1)
        expect(node.inputs[names.indexOf('llmResources')]).toMatchObject({ type: 'array', optional: true, acceptVariable: true })
        expect(typeof node.loadMethods.listAttachableResources).toBe('function')
    })

    it('raises the node version, since the inputs changed', () => {
        expect(node.version).toBe(1.2)
    })
})

describe('LLM node: attached resources', () => {
    it('gives a document to the model as text before the question', async () => {
        const manual = add({ name: '产品手册', ext: '.txt' }, '整机保修二十四个月')
        await node.run(nodeData({ llmResources: [{ resource: manual.ref }] }), '', options())
        expect(calls).toHaveLength(1)
        expect(calls[0].map(textOf)).toEqual(['以下是资源《产品手册》的内容:\n\n整机保修二十四个月', '保修期多久?'])
    })

    it('gives an image to the model as image input when the model takes images', async () => {
        const poster = add({ name: '海报-北京', ext: '.png', kind: 'image', mimeType: 'image/png' }, PNG)
        await node.run(nodeData({ llmResources: [{ resource: poster.ref }] }), '', options())
        expect(calls[0][0].content).toEqual([{ type: 'image_url', image_url: { url: `data:image/png;base64,${PNG.toString('base64')}` } }])
    })

    it('fails when the model does not take images', async () => {
        const poster = add({ name: '海报-北京', ext: '.png', kind: 'image', mimeType: 'image/png' }, PNG)
        await expect(
            node.run(nodeData({ llmModelConfig: { allowImageUploads: false }, llmResources: [{ resource: poster.ref }] }), '', options())
        ).rejects.toThrow(/Error in LLM node: .*海报-北京.*没有开启图片输入/)
        expect(calls).toHaveLength(0)
    })

    it('fails for a zip, naming the resource', async () => {
        const zipped = add({ name: '素材包', ext: '.zip' })
        await expect(node.run(nodeData({ llmResources: [{ resource: zipped.ref }] }), '', options())).rejects.toThrow(
            /素材包.*不支持提取文本/
        )
    })

    it('leaves the attachment out of the messages it returns for the execution, and lists the resources instead', async () => {
        const manual = add({ name: '产品手册', ext: '.txt' }, '整机保修二十四个月')
        const poster = add({ name: '海报-北京', ext: '.png', kind: 'image', mimeType: 'image/png' }, PNG)
        const result = await node.run(nodeData({ llmResources: [{ resource: manual.ref }, { resource: poster.ref }] }), '', options())

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

        calls = []
        await node.run(nodeData({ llmResources: [] }), '', options())
        expect(calls[0].map(textOf)).toEqual(['保修期多久?'])
    })

    it('resolves a node saved before this parameter existed (no llmResources at all)', async () => {
        const data = nodeData()
        delete data.inputs.llmResources
        await expect(node.run(data, '', options())).resolves.toBeDefined()
    })
})

describe('LLM node: attached resources and memory', () => {
    const memory = { llmEnableMemory: true, llmMemoryType: 'allMessages' }
    const past = [
        { role: 'user', content: '你们卖什么?' },
        { role: 'assistant', content: '茶叶。' }
    ]

    it('puts the attachment before the question after the conversation so far', async () => {
        const manual = add({ name: '产品手册', ext: '.txt' }, '手册正文')
        await node.run(
            nodeData({ ...memory, llmMessages: [], llmUserMessage: '保修期多久?', llmResources: [{ resource: manual.ref }] }),
            '',
            options({ pastChatHistory: past })
        )
        expect(calls[0].map(textOf)).toEqual(['你们卖什么?', '茶叶。', '以下是资源《产品手册》的内容:\n\n手册正文', '保修期多久?'])
    })

    it('does not put the attachment into the conversation history it returns', async () => {
        const manual = add({ name: '产品手册', ext: '.txt' }, '手册正文')
        const result = await node.run(
            nodeData({ ...memory, llmMessages: [], llmUserMessage: '保修期多久?', llmResources: [{ resource: manual.ref }] }),
            '保修期多久?',
            options({ pastChatHistory: past })
        )
        expect(JSON.stringify(result.chatHistory)).not.toContain('手册正文')
        expect(JSON.stringify(result.input.messages)).not.toContain('手册正文')
    })

    it('loads the resource again on the next call of the conversation, so a replaced file is used', async () => {
        const manual = add({ name: '产品手册', ext: '.txt' }, '旧版手册')
        const data = () => nodeData({ llmResources: [{ resource: manual.ref }] })
        await node.run(data(), '', options())
        fs.writeFileSync(manual.path, '新版手册,内容更长一些')
        await node.run(data(), '', options())
        expect(textOf(calls[0][0])).toContain('旧版手册')
        expect(textOf(calls[1][0])).toContain('新版手册,内容更长一些')
    })
})
