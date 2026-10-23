import {
    listAllResources,
    listAttachableResources,
    listImageResources,
    listVideoResources,
    mediaParam,
    resourceParam
} from './resourceParams'

type Row = { id: string; workspaceId: string; name: string; kind: string; ext: string; groupName: string | null }

/** An app data source whose repository filters by equality, like TypeORM's findBy */
const optionsFor = (rows: Row[], searchOptions: Record<string, any> = { workspaceId: 'wsA' }) => ({
    appDataSource: {
        getRepository: () => ({
            findBy: async (where: Record<string, any>) => rows.filter((r: any) => Object.entries(where).every(([k, v]) => r[k] === v))
        })
    },
    databaseEntities: { Resource: class Resource {} },
    searchOptions
})

const rows: Row[] = [
    { id: 'i1', workspaceId: 'wsA', name: '海报-北京', kind: 'image', ext: '.png', groupName: '海报' },
    { id: 'i2', workspaceId: 'wsA', name: '产品图', kind: 'image', ext: '.jpg', groupName: null },
    { id: 'i3', workspaceId: 'wsA', name: '海报-上海', kind: 'image', ext: '.png', groupName: '海报' },
    { id: 'v1', workspaceId: 'wsA', name: '开业视频', kind: 'video', ext: '.mp4', groupName: '视频' },
    { id: 'd1', workspaceId: 'wsA', name: '合同', kind: 'file', ext: '.pdf', groupName: null },
    { id: 'd2', workspaceId: 'wsA', name: '旧版合同', kind: 'file', ext: '.doc', groupName: null },
    { id: 'z1', workspaceId: 'wsA', name: '素材包', kind: 'file', ext: '.zip', groupName: null },
    { id: 'x1', workspaceId: 'wsB', name: '别人的图', kind: 'image', ext: '.png', groupName: null }
]

const labels = (options: any[]) => options.map((o) => o.label)

describe('resource parameter', () => {
    it('is a dropdown that also takes typed values and variables', () => {
        expect(resourceParam('Resource', 'loadResourceRef', 'desc', 'listAllResources')).toEqual({
            label: 'Resource',
            name: 'loadResourceRef',
            type: 'asyncOptions',
            loadMethod: 'listAllResources',
            freeSolo: true,
            description: 'desc',
            acceptVariable: true
        })
    })

    it('keeps the name of the WeChat media parameter', () => {
        expect(mediaParam('Image', 'desc', 'listImageResources')).toMatchObject({ name: 'wechatMedia', loadMethod: 'listImageResources' })
    })
})

describe('resource options', () => {
    it('lists images only, stored as res://id/<id> and shown by name', async () => {
        const options = await listImageResources({} as any, optionsFor(rows))
        expect(options.map((o) => [o.label, o.name])).toEqual([
            ['海报-上海', 'res://id/i3'],
            ['海报-北京', 'res://id/i1'],
            ['产品图', 'res://id/i2']
        ])
    })

    it('lists videos only, or everything', async () => {
        expect(labels(await listVideoResources({} as any, optionsFor(rows)))).toEqual(['开业视频'])
        expect(labels(await listAllResources({} as any, optionsFor(rows))).sort()).toEqual(
            ['产品图', '合同', '开业视频', '旧版合同', '海报-上海', '海报-北京', '素材包'].sort()
        )
    })

    it('lists for a model only the images and the documents whose text can be extracted', async () => {
        const options = await listAttachableResources({} as any, optionsFor(rows))
        expect(labels(options).sort()).toEqual(['产品图', '合同', '海报-上海', '海报-北京'].sort())
    })

    it('puts the grouped resources first, group by group, and the ungrouped ones last', async () => {
        const all = await listAllResources({} as any, optionsFor(rows))
        expect(all.map((o) => o.group)).toEqual(['海报', '海报', '视频', 'Ungrouped', 'Ungrouped', 'Ungrouped', 'Ungrouped'])
        expect(all.slice(0, 2).map((o) => o.description)).toEqual(['海报', '海报'])
        expect(all.slice(3).map((o) => o.description)).toEqual([undefined, undefined, undefined, undefined])
    })

    it('only lists the resources of the workspace in the search options', async () => {
        const options = await listImageResources({} as any, optionsFor(rows, { workspaceId: 'wsB' }))
        expect(labels(options)).toEqual(['别人的图'])
    })

    it('returns an empty list when the database is not available', async () => {
        expect(await listImageResources({} as any, {})).toEqual([])
        expect(await listImageResources({} as any, { appDataSource: {}, databaseEntities: {} })).toEqual([])
    })
})
