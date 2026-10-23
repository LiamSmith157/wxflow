const load = (file: string) => new (require(file).nodeClass)()
const image = load('./SendImage')
const file = load('./SendFile')
const video = load('./SendVideo')

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
