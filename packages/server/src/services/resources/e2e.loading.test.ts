// End-to-end: a flow "Start -> Load Resource -> LLM" whose resources come from the library. The resources are uploaded
// through the real resource service, variables are replaced by the real flow executor code, and the real Load Resource and
// LLM nodes run against the real resource runtime. Only storage (in-memory repositories), the chat model and the modules
// that pull in analytics and every provider are replaced.
import fs from 'fs'
import os from 'os'
import path from 'path'
import { ReadableStream } from 'stream/web'
import { AIMessageChunk } from '@langchain/core/messages'

// @langchain/core expects the web streams globals, which Jest's node environment does not expose
Object.assign(globalThis, { ReadableStream })
// The components package pulls in optional peers that are not needed here
jest.mock('wxflow-components', () => new Proxy({ __esModule: true }, { get: (t: any, k: string) => (k in t ? t[k] : jest.fn()) }))
jest.mock('../../utils/logger', () => ({
    __esModule: true,
    default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}))
jest.mock('../../utils/getRunningExpressApp', () => ({ getRunningExpressApp: jest.fn() }))

// what the LLM node loads for storage, analytics and every provider
jest.mock('../../../../components/nodes/agentflow/utils', () => ({
    addImageArtifactsToMessages: jest.fn(async () => undefined),
    extractArtifactsFromResponse: jest.fn(async () => ({ artifacts: [], fileAnnotations: [], savedInlineImages: [] })),
    getPastChatHistoryImageMessages: jest.fn(async (history: any[]) => ({ updatedPastMessages: history })),
    getUniqueImageMessages: jest.fn(async () => undefined),
    processMessagesWithImages: jest.fn(async (messages: any[]) => ({ updatedMessages: messages, transformedMessages: [] })),
    revertBase64ImagesToFileRefs: jest.fn((messages: any[]) => messages),
    replaceInlineDataWithFileReferences: jest.fn(),
    updateFlowState: jest.requireActual('../../../../components/src/flowState').updateFlowState
}))
jest.mock('../../../../components/src/utils', () => ({
    processTemplateVariables: jest.requireActual('../../../../components/src/flowState').processTemplateVariables,
    configureStructuredOutput: jest.fn((model: any) => model),
    extractResponseContent: jest.fn((response: any) => (typeof response?.content === 'string' ? response.content : ''))
}))
jest.mock('../../../../components/src/handler', () => ({}))
jest.mock('../../../../components/src/modelLoader', () => ({
    getModelConfigByModelName: jest.fn(async () => undefined),
    MODEL_TYPE: { CHAT: 'chat' }
}))

import { createResourceService } from './core'
import { createResourceRuntime } from './runtime'
import { uploadDir } from './store'

const { resolveVariables } = require('../../utils/buildAgentflow')
const LoadResourceNode = require('../../../../components/nodes/agentflow/LoadResource/LoadResource').nodeClass
const LLMNode = require('../../../../components/nodes/agentflow/LLM/LLM').nodeClass

jest.setTimeout(60000)

const WS = 'ws-1'
const actor = { workspaceId: WS }

/** Equality-only in-memory repository, enough for the resource service */
class FakeRepo {
    rows: any[] = []
    private seq = 0
    create(p: any) {
        return { ...p }
    }
    async save(e: any) {
        if (!e.id) e.id = `id-${++this.seq}`
        if (!this.rows.includes(e)) {
            e.createdDate = new Date(this.seq)
            this.rows.push(e)
        }
        e.updatedDate = new Date()
        return e
    }
    async remove(e: any) {
        this.rows = this.rows.filter((r) => r !== e)
        return e
    }
    private match(r: any, where: any = {}) {
        return Object.entries(where).every(([k, v]) => r[k] === v)
    }
    async findOne({ where }: any) {
        return this.rows.find((r) => this.match(r, where)) ?? null
    }
    async find({ where }: any = {}) {
        return this.rows.filter((r) => this.match(r, where))
    }
    async delete(where: any) {
        this.rows = this.rows.filter((r) => !this.match(r, where))
    }
}

/** A one-page pdf with a line of text */
const pdf = (text: string): Buffer => {
    const stream = `BT /F1 14 Tf 10 50 Td (${text}) Tj ET`
    const objects = [
        '<</Type/Catalog/Pages 2 0 R>>',
        '<</Type/Pages/Kids[3 0 R]/Count 1>>',
        '<</Type/Page/Parent 2 0 R/MediaBox[0 0 400 100]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
        `<</Length ${stream.length}>>\nstream\n${stream}\nendstream`,
        '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>'
    ]
    let out = '%PDF-1.4\n'
    const offsets: number[] = []
    objects.forEach((body, i) => {
        offsets.push(out.length)
        out += `${i + 1} 0 obj\n${body}\nendobj\n`
    })
    const xref = out.length
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
    out += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`
    return Buffer.from(out, 'latin1')
}

const PNG = (marker: number) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(56, marker)])

describe('Start -> Load Resource -> LLM with library resources, end to end', () => {
    const repos = new Map<any, FakeRepo>()
    const dataSource = {
        getRepository: (entity: any) => (repos.has(entity) ? repos.get(entity)! : repos.set(entity, new FakeRepo()).get(entity)!)
    }
    let resourcesRoot: string
    let workDir: string
    let resources: ReturnType<typeof createResourceService>
    let manualId = ''
    let posterId = ''
    const modelCalls: any[][] = []

    const upload = (content: Buffer, originalName: string) => {
        fs.mkdirSync(uploadDir(resourcesRoot), { recursive: true })
        const file = path.join(uploadDir(resourcesRoot), `upload-${Math.random().toString(16).slice(2)}`)
        fs.writeFileSync(file, content)
        return { path: file, originalName }
    }

    /** Variables are replaced the way the executor does it, with the declared parameters of the node deciding what is replaced */
    const prepare = async (nodeClass: any, id: string, inputs: Record<string, any>, state: Record<string, any>) => {
        const node = new nodeClass()
        const data: any = { id, name: node.name, inputs, inputParams: node.inputs, inputAnchors: [] }
        const resolved = await resolveVariables(data, '', {}, { state }, [], [], '', [], {})
        return { node, data: resolved }
    }

    const options = (state: Record<string, any>): any => ({
        componentNodes: { fakeChat: { filePath: path.join(workDir, 'fakeChat.js'), label: 'Fake Chat' } },
        agentflowRuntime: { state },
        chatId: 'chat-1',
        pastChatHistory: [],
        prependedChatHistory: [],
        resources: createResourceRuntime(resources, WS)
    })

    /** Start (state) -> Load Resource (manual into the state) -> LLM (poster attached, question uses the state) */
    const runFlow = async (posterRef: string) => {
        let state: Record<string, any> = { manual: '' }

        const load = await prepare(
            LoadResourceNode,
            'loadResourceAgentflow_0',
            {
                loadResourceRef: 'res://name/{{ $flow.state.manualName }}',
                loadResourceReturnAs: 'text',
                loadResourceUpdateState: [{ key: 'manual', value: '{{ output }}' }]
            },
            { ...state, manualName: '产品手册' }
        )
        const loaded = await load.node.run(load.data, '', options({ ...state, manualName: '产品手册' }))
        state = { ...loaded.state }

        const llm = await prepare(
            LLMNode,
            'llmAgentflow_0',
            {
                llmModel: 'fakeChat',
                llmModelConfig: { allowImageUploads: true },
                llmMessages: [{ role: 'user', content: '手册内容:{{ $flow.state.manual }}\n这张海报上写了什么?' }],
                llmResources: [{ resource: posterRef }]
            },
            state
        )
        const answered = await llm.node.run(llm.data, '', options(state))
        return { loaded, answered }
    }

    beforeAll(async () => {
        resourcesRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wxflow-e2e-loading-'))
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wxflow-e2e-loading-model-'))
        resources = createResourceService({
            getDataSource: () => dataSource,
            config: () => ({ root: resourcesRoot, maxBytes: 1024 * 1024 })
        })
        ;(globalThis as any).__e2eChatModel = {
            invoke: async (messages: any[]) => {
                modelCalls.push(JSON.parse(JSON.stringify(messages)))
                return new AIMessageChunk('海报上写着开业大吉')
            },
            getNumTokens: async () => 1
        }
        fs.writeFileSync(
            path.join(workDir, 'fakeChat.js'),
            'module.exports = { nodeClass: class { constructor() { this.inputs = [] } async init() { return globalThis.__e2eChatModel } } }'
        )

        const manual = await resources.create(actor, upload(pdf('Warranty is 24 months'), '手册.pdf'), {
            name: '产品手册',
            groupName: '手册'
        })
        manualId = manual.id
        const poster = await resources.create(actor, upload(PNG(1), '海报.png'), { name: '海报-北京', groupName: '海报' })
        posterId = poster.id
    })

    afterAll(() => {
        delete (globalThis as any).__e2eChatModel
        fs.rmSync(resourcesRoot, { recursive: true, force: true })
        fs.rmSync(workDir, { recursive: true, force: true })
    })

    const textsOf = (messages: any[]) =>
        messages.map((m) => (typeof m.content === 'string' ? m.content : m.content.map((c: any) => c.text ?? `[${c.type}]`).join('')))

    it('loads the pdf into the flow state and gives the model the poster and the question that uses the state', async () => {
        const { loaded, answered } = await runFlow(`res://id/${posterId}`)

        // the name of the manual came from a variable, and the text of the pdf went into the state
        expect(loaded.input.resource).toEqual({ name: '产品手册', kind: 'file' })
        expect(loaded.state.manual).toContain('Warranty is 24 months')

        // the model got the poster as an image, then the question with the manual in it
        expect(modelCalls).toHaveLength(1)
        expect(textsOf(modelCalls[0])).toEqual(['[image_url]', expect.stringContaining('Warranty is 24 months')])
        expect(modelCalls[0][0].content[0].image_url.url).toBe(`data:image/png;base64,${PNG(1).toString('base64')}`)
        expect(answered.output.content).toBe('海报上写着开业大吉')
    })

    it('records the names and kinds of what was attached, not the poster itself', async () => {
        const { answered } = await runFlow(`res://id/${posterId}`)
        expect(answered.input.resources).toEqual([{ name: '海报-北京', kind: 'image' }])
        expect(answered.input.messages).toHaveLength(1)
        expect(JSON.stringify(answered)).not.toContain(PNG(1).toString('base64'))
    })

    it('lists the flow among the users of both resources', async () => {
        const flowData = JSON.stringify({
            nodes: [
                { id: 'a', data: { name: 'loadResourceAgentflow', inputs: { loadResourceRef: 'res://name/产品手册' } } },
                { id: 'b', data: { name: 'llmAgentflow', inputs: { llmResources: [{ resource: `res://id/${posterId}` }] } } }
            ]
        })
        const { ChatFlow } = require('../../database/entities/ChatFlow')
        dataSource.getRepository(ChatFlow).rows.push({ id: 'flow-1', name: '手册问答', workspaceId: WS, flowData })

        expect(await resources.usages(actor, manualId)).toEqual([{ id: 'flow-1', name: '手册问答', via: 'name' }])
        expect(await resources.usages(actor, posterId)).toEqual([{ id: 'flow-1', name: '手册问答', via: 'id' }])
    })

    it('uses the new text after the pdf was replaced, with the flow untouched', async () => {
        await resources.replaceFile(actor, manualId, upload(pdf('Warranty is now 36 months'), '手册-新.pdf'))
        modelCalls.length = 0

        const { loaded } = await runFlow(`res://id/${posterId}`)
        expect(loaded.state.manual).toContain('Warranty is now 36 months')
        expect(loaded.state.manual).not.toContain('24 months')
        expect(textsOf(modelCalls[0])[1]).toContain('Warranty is now 36 months')
    })

    it('fails the LLM node with "resource not found" after the poster was deleted, and does not call the model', async () => {
        await resources.remove(actor, posterId)
        modelCalls.length = 0

        await expect(runFlow(`res://id/${posterId}`)).rejects.toThrow(/Error in LLM node: 资源不存在,可能已被删除/)
        expect(modelCalls).toHaveLength(0)
    })

    it('fails Load Resource when the manual is deleted too, and refuses a local path or a URL', async () => {
        const state = { manualName: '产品手册' }
        await resources.remove(actor, manualId)
        const load = await prepare(LoadResourceNode, 'l', { loadResourceRef: 'res://name/{{ $flow.state.manualName }}' }, state)
        await expect(load.node.run(load.data, '', options(state))).rejects.toThrow('资源 `产品手册` 不存在')

        for (const value of ['C:\\data\\手册.pdf', 'https://example.com/a.pdf']) {
            const direct = await prepare(LoadResourceNode, 'l', { loadResourceRef: value }, {})
            await expect(direct.node.run(direct.data, '', options({}))).rejects.toThrow('只能使用资源库中的资源')
        }
    })
})
