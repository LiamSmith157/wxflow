import fs from 'fs'
import os from 'os'
import path from 'path'
import { IReactFlowNode } from '../../Interface'
import { findMediaWarnings } from './validate'
import { MediaResolver } from './resolver'

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
