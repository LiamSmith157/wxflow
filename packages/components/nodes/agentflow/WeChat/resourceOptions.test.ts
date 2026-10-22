const load = (file: string) => new (require(file).nodeClass)()
const image = load('./SendImage')
const file = load('./SendFile')
const video = load('./SendVideo')

type Row = { id: string; workspaceId: string; name: string; kind: string; groupName: string | null }

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
    { id: 'i1', workspaceId: 'wsA', name: '海报-北京', kind: 'image', groupName: '海报' },
    { id: 'i2', workspaceId: 'wsA', name: '产品图', kind: 'image', groupName: null },
    { id: 'i3', workspaceId: 'wsA', name: '海报-上海', kind: 'image', groupName: '海报' },
    { id: 'v1', workspaceId: 'wsA', name: '开业视频', kind: 'video', groupName: '视频' },
    { id: 'd1', workspaceId: 'wsA', name: '合同', kind: 'file', groupName: null },
    { id: 'x1', workspaceId: 'wsB', name: '别人的图', kind: 'image', groupName: null }
]

const mediaParamOf = (node: any) => node.inputs.find((p: any) => p.name === 'wechatMedia')

describe('media parameter of the send nodes', () => {
    it.each([
        ['Send Image', image, 'listImageResources'],
        ['Send File', file, 'listAllResources'],
        ['Send Video', video, 'listVideoResources']
    ])('%s is a dropdown that also takes typed values and variables', (_name, node, loadMethod) => {
        expect(mediaParamOf(node)).toMatchObject({
            name: 'wechatMedia',
            type: 'asyncOptions',
            loadMethod,
            freeSolo: true,
            acceptVariable: true
        })
        expect(typeof node.loadMethods[loadMethod]).toBe('function')
        expect(node.version).toBe(1.1)
    })

    it('keeps listing WeChat instances', () => {
        for (const node of [image, file, video]) expect(typeof node.loadMethods.listWechatInstances).toBe('function')
    })

    it('explains every way to fill it in', () => {
        const text = mediaParamOf(image).description
        expect(text).toContain('resource library')
        expect(text).toContain('http(s) URL')
        expect(text).toContain('res://name/<resource name>')
    })
})

describe('resource options', () => {
    it('Send Image lists images only, stored as res://id/<id> and shown by name', async () => {
        const options = await image.loadMethods.listImageResources({}, optionsFor(rows))
        expect(options.map((o: any) => [o.label, o.name])).toEqual([
            ['海报-上海', 'res://id/i3'],
            ['海报-北京', 'res://id/i1'],
            ['产品图', 'res://id/i2']
        ])
    })

    it('Send Video lists videos only and Send File lists everything', async () => {
        const videos = await video.loadMethods.listVideoResources({}, optionsFor(rows))
        expect(videos.map((o: any) => o.label)).toEqual(['开业视频'])
        const all = await file.loadMethods.listAllResources({}, optionsFor(rows))
        expect(all.map((o: any) => o.label).sort()).toEqual(['产品图', '合同', '开业视频', '海报-上海', '海报-北京'].sort())
    })

    it('puts the grouped resources first, group by group, and the ungrouped ones last', async () => {
        const all = await file.loadMethods.listAllResources({}, optionsFor(rows))
        expect(all.map((o: any) => o.group)).toEqual(['海报', '海报', '视频', 'Ungrouped', 'Ungrouped'])
        expect(all.slice(0, 2).map((o: any) => o.description)).toEqual(['海报', '海报'])
        expect(all.slice(3).map((o: any) => o.description)).toEqual([undefined, undefined])
    })

    it('only lists the resources of the workspace in the search options', async () => {
        const options = await image.loadMethods.listImageResources({}, optionsFor(rows, { workspaceId: 'wsB' }))
        expect(options.map((o: any) => o.label)).toEqual(['别人的图'])
    })

    it('returns an empty list when the database is not available', async () => {
        expect(await image.loadMethods.listImageResources({}, {})).toEqual([])
        expect(await image.loadMethods.listImageResources({}, { appDataSource: {}, databaseEntities: {} })).toEqual([])
    })
})
