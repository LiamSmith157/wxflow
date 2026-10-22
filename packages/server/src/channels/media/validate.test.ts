import fs from 'fs'
import os from 'os'
import path from 'path'
import { IReactFlowNode } from '../../Interface'
import { findMediaWarnings } from './validate'
import { MediaResolver } from './resolver'

jest.mock('wxflow-components', () => ({ secureAxiosRequest: jest.fn() }))

let root: string
const ctx = () => ({ exchange: { dir: root, hostDir: 'C:\\wxflow\\exchange', mapped: true }, maxDownloadBytes: 1024 })

const node = (id: string, name: string, media: unknown): IReactFlowNode =>
    ({ id, data: { name, label: name, inputs: { wechatMedia: media } } } as unknown as IReactFlowNode)

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'wxflow-validate-'))
    fs.mkdirSync(path.join(root, 'assets', '海报'), { recursive: true })
    fs.writeFileSync(path.join(root, 'assets', '海报', 'a.jpg'), 'x')
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

describe('findMediaWarnings', () => {
    it('warns about a fixed path whose file does not exist, naming the Windows folder', async () => {
        const warnings = await findMediaWarnings([node('n1', 'wechatSendImageAgentflow', '海报/不存在.jpg')], new MediaResolver(), ctx())
        expect(warnings).toEqual([
            {
                id: 'n1',
                label: 'wechatSendImageAgentflow',
                name: 'wechatSendImageAgentflow',
                issues: ['素材 `assets/海报/不存在.jpg` 不存在,请检查 `C:\\wxflow\\exchange\\assets` 目录']
            }
        ])
    })

    it('does not warn when the file exists', async () => {
        expect(await findMediaWarnings([node('n1', 'wechatSendImageAgentflow', '海报/a.jpg')], new MediaResolver(), ctx())).toEqual([])
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

    it('warns about an absolute path outside the exchange directory', async () => {
        const warnings = await findMediaWarnings([node('n1', 'wechatSendFileAgentflow', 'D:\\其他\\a.pdf')], new MediaResolver(), ctx())
        expect(warnings[0].issues[0]).toContain('必须放在交换目录内')
    })

    it('reports every affected node', async () => {
        const nodes = [
            node('n1', 'wechatSendImageAgentflow', 'nope1.jpg'),
            node('n2', 'wechatSendVideoAgentflow', 'nope2.mp4'),
            node('n3', 'wechatSendFileAgentflow', '海报/a.jpg')
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
