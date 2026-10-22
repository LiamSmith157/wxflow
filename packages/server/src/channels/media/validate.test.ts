import fs from 'fs'
import os from 'os'
import path from 'path'
import { IReactFlowNode } from '../../Interface'
import { findMediaWarnings } from './validate'
import { MediaResolver } from './resolver'
import { ResourceLookup, ResourceRecord, registerResourceSource } from './resourceSource'

jest.mock('wxflow-components', () => ({ secureAxiosRequest: jest.fn() }))

let root: string
let poster: string
const ctx = () => ({ mediaRoot: root, maxDownloadBytes: 1024 })

const node = (id: string, name: string, media: unknown): IReactFlowNode =>
    ({ id, data: { name, label: name, inputs: { wechatMedia: media } } } as unknown as IReactFlowNode)

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'wxflow-validate-'))
    poster = path.join(root, '海报.jpg')
    fs.writeFileSync(poster, 'x')
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

describe('findMediaWarnings', () => {
    it('warns about a fixed path whose file does not exist, naming the path', async () => {
        const missing = path.join(root, '不存在.jpg')
        const warnings = await findMediaWarnings([node('n1', 'wechatSendImageAgentflow', missing)], new MediaResolver(), ctx())
        expect(warnings).toEqual([
            {
                id: 'n1',
                label: 'wechatSendImageAgentflow',
                name: 'wechatSendImageAgentflow',
                issues: [`文件 \`${missing}\` 不存在,请检查路径`]
            }
        ])
    })

    it('does not warn when the file exists', async () => {
        expect(await findMediaWarnings([node('n1', 'wechatSendImageAgentflow', poster)], new MediaResolver(), ctx())).toEqual([])
    })

    it('does not check values with variables or URLs', async () => {
        const nodes = [
            node('n1', 'wechatSendImageAgentflow', '{{ $form.picture }}'),
            node('n2', 'wechatSendFileAgentflow', 'x/{{ $wechat.talker }}.pdf'),
            node('n3', 'wechatSendVideoAgentflow', 'https://example.com/v.mp4')
        ]
        expect(await findMediaWarnings(nodes, new MediaResolver(), ctx())).toEqual([])
    })

    it('ignores empty values and other nodes', async () => {
        const nodes = [
            node('n1', 'wechatSendImageAgentflow', ''),
            node('n2', 'wechatSendImageAgentflow', undefined),
            node('n3', 'wechatSendTextAgentflow', 'ghost.jpg')
        ]
        expect(await findMediaWarnings(nodes, new MediaResolver(), ctx())).toEqual([])
    })

    it('warns about a relative path: it needs a URL or a full path', async () => {
        const warnings = await findMediaWarnings([node('n1', 'wechatSendFileAgentflow', '海报/a.pdf')], new MediaResolver(), ctx())
        expect(warnings[0].issues[0]).toContain('http(s) 地址或文件的完整路径')
    })

    it('reports every affected node', async () => {
        const nodes = [
            node('n1', 'wechatSendImageAgentflow', path.join(root, 'nope1.jpg')),
            node('n2', 'wechatSendVideoAgentflow', path.join(root, 'nope2.mp4')),
            node('n3', 'wechatSendFileAgentflow', poster)
        ]
        const warnings = await findMediaWarnings(nodes, new MediaResolver(), ctx())
        expect(warnings.map((w) => w.id)).toEqual(['n1', 'n2'])
    })

    it('does not fail the check when a custom source throws for its own reasons', async () => {
        const resolver = new MediaResolver()
        resolver.register({
            name: 'res',
            matches: (v) => v.startsWith('res://'),
            resolve: async () => Promise.reject(new Error('resource library offline'))
        })
        expect(await findMediaWarnings([node('n1', 'wechatSendImageAgentflow', 'res://logo')], resolver, ctx())).toEqual([])
    })
})

describe('findMediaWarnings: library resources', () => {
    const poster: ResourceRecord = { id: 'r1', workspaceId: 'wsA', name: '海报-北京', kind: 'image', ext: '.png' }
    const clip: ResourceRecord = { id: 'r2', workspaceId: 'wsA', name: '开业视频', kind: 'video', ext: '.mp4' }
    const records = [poster, clip]
    const lookup: ResourceLookup = {
        findById: async (ws, id) => records.find((r) => r.workspaceId === ws && r.id === id) ?? null,
        findByNameKey: async (ws, key) => records.find((r) => r.workspaceId === ws && r.name.toLowerCase() === key) ?? null,
        pathOf: (r) => path.join(root, `${r.id}${r.ext}`)
    }
    const withResources = () => {
        for (const r of records) fs.writeFileSync(lookup.pathOf(r), 'x')
        const resolver = new MediaResolver()
        registerResourceSource(resolver, lookup)
        return resolver
    }
    const wsCtx = () => ({ ...ctx(), workspaceId: 'wsA' })

    it('does not warn about a resource that exists and fits the node', async () => {
        const nodes = [
            node('n1', 'wechatSendImageAgentflow', 'res://id/r1'),
            node('n2', 'wechatSendVideoAgentflow', 'res://name/开业视频'),
            node('n3', 'wechatSendFileAgentflow', 'res://id/r1')
        ]
        expect(await findMediaWarnings(nodes, withResources(), wsCtx())).toEqual([])
    })

    it('warns about a resource that was deleted, by id and by name', async () => {
        const nodes = [
            node('n1', 'wechatSendImageAgentflow', 'res://id/gone'),
            node('n2', 'wechatSendImageAgentflow', 'res://name/海报-拉萨')
        ]
        const warnings = await findMediaWarnings(nodes, withResources(), wsCtx())
        expect(warnings.map((w) => [w.id, w.issues[0]])).toEqual([
            ['n1', '资源不存在,可能已被删除(`res://id/gone`)'],
            ['n2', '资源 `海报-拉萨` 不存在']
        ])
    })

    it('warns when the resource is of another kind than the node takes', async () => {
        const nodes = [node('n1', 'wechatSendImageAgentflow', 'res://id/r2'), node('n2', 'wechatSendVideoAgentflow', 'res://id/r1')]
        const warnings = await findMediaWarnings(nodes, withResources(), wsCtx())
        expect(warnings.map((w) => [w.id, w.issues[0]])).toEqual([
            ['n1', '资源 `开业视频` 是视频,不能作为图片发送'],
            ['n2', '资源 `海报-北京` 是图片,不能作为视频发送']
        ])
    })

    it('does not check a reference whose name is built with a variable', async () => {
        const nodes = [node('n1', 'wechatSendImageAgentflow', 'res://name/海报-{{ $wechat.city }}')]
        expect(await findMediaWarnings(nodes, withResources(), wsCtx())).toEqual([])
    })

    it('looks in the workspace of the flow only', async () => {
        const warnings = await findMediaWarnings([node('n1', 'wechatSendImageAgentflow', 'res://id/r1')], withResources(), {
            ...ctx(),
            workspaceId: 'wsB'
        })
        expect(warnings).toHaveLength(1)
    })
})
