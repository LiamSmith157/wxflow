import fs from 'fs'
import os from 'os'
import path from 'path'
import { IResourceFile, IResourceRuntime } from '../../../src/Interface'
import { clearResourceTextCache } from '../../../src/resourceText'

const node = new (require('./LoadResource').nodeClass)()

let dir: string
let library: IResourceFile[]

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

/** Resolves by the same two reference forms as the server runtime and refuses everything else */
const runtime: IResourceRuntime = {
    workspaceId: 'wsA',
    async load(ref) {
        const byId = ref.startsWith('res://id/') ? library.find((r) => r.id === ref.slice('res://id/'.length)) : undefined
        const byName = ref.startsWith('res://name/') ? library.find((r) => r.name === ref.slice('res://name/'.length).trim()) : undefined
        if (!ref.startsWith('res://')) throw new Error(`\`${ref}\` 不是资源库中的资源:这里只能使用资源库中的资源`)
        const found = byId ?? byName
        if (!found) throw new Error(`资源 \`${ref}\` 不存在`)
        return found
    }
}

const data = (inputs: Record<string, any>): any => ({ id: 'loadResourceAgentflow_0', inputs })
const opts = (state: Record<string, any> = {}, extra: Record<string, any> = {}): any => ({
    resources: runtime,
    agentflowRuntime: { state },
    ...extra
})

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wxflow-loadres-'))
    library = []
    clearResourceTextCache()
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('Load Resource: definition', () => {
    it('is a generic node of the Agent Flows group', () => {
        expect(node.name).toBe('loadResourceAgentflow')
        expect(node.category).toBe('Agent Flows')
    })

    it('has a resource dropdown that takes typed values and variables, listing every kind', () => {
        const param = node.inputs.find((p: any) => p.name === 'loadResourceRef')
        expect(param).toMatchObject({ type: 'asyncOptions', loadMethod: 'listAllResources', freeSolo: true, acceptVariable: true })
        expect(typeof node.loadMethods.listAllResources).toBe('function')
    })

    it('returns the text by default and offers the path and the details', () => {
        const param = node.inputs.find((p: any) => p.name === 'loadResourceReturnAs')
        expect(param.default).toBe('text')
        expect(param.options.map((o: any) => o.name)).toEqual(['text', 'path', 'info'])
    })

    it('has the same Update Flow State parameter as the other nodes', () => {
        const param = node.inputs.find((p: any) => p.name === 'loadResourceUpdateState')
        expect(param).toMatchObject({ type: 'array', optional: true, acceptVariable: true })
        expect(param.array.map((p: any) => p.name)).toEqual(['key', 'value'])
    })
})

describe('Load Resource: run', () => {
    it('returns the text of a document by default', async () => {
        const r = add({ name: '产品手册', ext: '.txt' }, '保修期二十四个月')
        const out = await node.run(data({ loadResourceRef: r.ref }), '', opts())
        expect(out.output.content).toBe('保修期二十四个月')
        expect(out.input).toEqual({ ref: r.ref, resource: { name: '产品手册', kind: 'file' }, returnAs: 'text' })
    })

    it('returns the local path of the file', async () => {
        const r = add({ name: '海报-北京', ext: '.png', kind: 'image' })
        const out = await node.run(data({ loadResourceRef: r.ref, loadResourceReturnAs: 'path' }), '', opts())
        expect(out.output.content).toBe(r.path)
    })

    it('returns the details as JSON', async () => {
        const r = add({ name: '海报-北京', ext: '.png', kind: 'image', mimeType: 'image/png', groupName: '海报' })
        const out = await node.run(data({ loadResourceRef: r.ref, loadResourceReturnAs: 'info' }), '', opts())
        expect(JSON.parse(out.output.content)).toEqual({
            id: r.id,
            name: '海报-北京',
            groupName: '海报',
            kind: 'image',
            mimeType: 'image/png',
            size: r.size,
            path: r.path
        })
    })

    it('loads the resource a name reference points at, as it arrives after the variables were replaced', async () => {
        add({ name: '价目表-上海', ext: '.txt' }, '上海价目')
        add({ name: '价目表-北京', ext: '.txt' }, '北京价目')
        const out = await node.run(data({ loadResourceRef: 'res://name/价目表-上海' }), '', opts())
        expect(out.output.content).toBe('上海价目')
        expect(out.input.ref).toBe('res://name/价目表-上海')
        expect(out.input.resource.name).toBe('价目表-上海')
    })

    it('fails for a video when the text is wanted, naming the resource', async () => {
        const r = add({ name: '开业视频', ext: '.mp4', kind: 'video' })
        await expect(node.run(data({ loadResourceRef: r.ref }), '', opts())).rejects.toThrow(/开业视频.*是视频.*无法提取文本/)
    })

    it('still gives the path and details of a video', async () => {
        const r = add({ name: '开业视频', ext: '.mp4', kind: 'video' })
        const out = await node.run(data({ loadResourceRef: r.ref, loadResourceReturnAs: 'path' }), '', opts())
        expect(out.output.content).toBe(r.path)
    })

    it('fails for a local path or a URL, because only library resources can be loaded', async () => {
        await expect(node.run(data({ loadResourceRef: 'C:\\data\\secret.txt' }), '', opts())).rejects.toThrow(/只能使用资源库中的资源/)
        await expect(node.run(data({ loadResourceRef: 'https://example.com/a.pdf' }), '', opts())).rejects.toThrow(/只能使用资源库中的资源/)
    })

    it('fails when no resource is chosen, or when the run has no resource library', async () => {
        await expect(node.run(data({ loadResourceRef: '  ' }), '', opts())).rejects.toThrow('请选择要载入的资源')
        await expect(node.run(data({ loadResourceRef: 'res://id/x' }), '', { agentflowRuntime: { state: {} } })).rejects.toThrow(
            '资源库不可用'
        )
    })

    it('passes the error of a resource that does not exist on', async () => {
        await expect(node.run(data({ loadResourceRef: 'res://name/海报-拉萨' }), '', opts())).rejects.toThrow(/海报-拉萨.*不存在/)
    })
})

describe('Load Resource: flow state', () => {
    it('writes its output to a key of the flow state, where the next nodes read it', async () => {
        const r = add({ name: '产品手册', ext: '.txt' }, '手册内容')
        const out = await node.run(
            data({ loadResourceRef: r.ref, loadResourceUpdateState: [{ key: 'manual', value: '{{ output }}' }] }),
            '',
            opts({ manual: '', other: 'kept' })
        )
        expect(out.state).toEqual({ manual: '手册内容', other: 'kept' })
        expect(out.state.manual).toBe(out.output.content)
    })

    it('hands the state on unchanged when nothing is set', async () => {
        const r = add({ name: '产品手册', ext: '.txt' }, '手册内容')
        const out = await node.run(data({ loadResourceRef: r.ref }), '', opts({ a: '1' }))
        expect(out.state).toEqual({ a: '1' })
    })
})

describe('Load Resource: state keys', () => {
    it('lists the keys of the Start node, and nothing without one', async () => {
        const options = { previousNodes: [{ name: 'startAgentflow', inputs: { startState: [{ key: 'manual' }, { key: 'city' }] } }] }
        expect(await node.loadMethods.listRuntimeStateKeys({}, options)).toEqual([
            { label: 'manual', name: 'manual' },
            { label: 'city', name: 'city' }
        ])
        expect(await node.loadMethods.listRuntimeStateKeys({}, { previousNodes: [] })).toEqual([])
    })
})
