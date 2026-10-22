import { createFakeChannels, messageEvent, runOptions } from './testFakes'

const load = (file: string) => new (require(file).nodeClass)()
const image = load('./SendImage')
const file = load('./SendFile')
const video = load('./SendVideo')

const data = (node: any, inputs: Record<string, any>): any => ({ id: `${node.name}_0`, inputs })
const asset = { path: '/exchange/assets/海报/a.jpg', hostPath: 'C:\\wxflow\\exchange\\assets\\海报\\a.jpg', temporary: false }

describe('media send nodes', () => {
    it('are WeChat nodes named after their method', () => {
        expect([image, file, video].map((n) => [n.name, n.category, n.color])).toEqual([
            ['wechatSendImageAgentflow', 'WeChat', '#07C160'],
            ['wechatSendFileAgentflow', 'WeChat', '#07C160'],
            ['wechatSendVideoAgentflow', 'WeChat', '#07C160']
        ])
    })

    it.each([
        ['image', image, 'send.image'],
        ['file', file, 'send.file'],
        ['video', video, 'send.video']
    ])('%s: the DLL receives the Windows path of the file', async (_name, node, method) => {
        const ch = createFakeChannels({ event: messageEvent() })
        ch.mediaFiles['海报/a.jpg'] = asset
        const out = await node.run(data(node, { wechatTo: 'wxid_friend', wechatMedia: '海报/a.jpg' }), '', runOptions(ch))
        expect(ch.sends).toHaveLength(1)
        expect(ch.sends[0].method).toBe(method)
        expect(ch.sends[0].params).toEqual({ wxid: 'wxid_friend', path: 'C:\\wxflow\\exchange\\assets\\海报\\a.jpg' })
        expect(out.output).toMatchObject({ state: 'ok', to: 'wxid_friend' })
    })

    it('sends an image fetched upstream (an absolute path inside the exchange directory)', async () => {
        const ch = createFakeChannels({ event: messageEvent() })
        ch.mediaFiles['/exchange/images/1.jpg'] = {
            path: '/exchange/images/1.jpg',
            hostPath: 'C:\\wxflow\\exchange\\images\\1.jpg',
            temporary: false
        }
        await image.run(data(image, { wechatTo: 'x', wechatMedia: '/exchange/images/1.jpg' }), '', runOptions(ch))
        expect(ch.sends[0].params.path).toBe('C:\\wxflow\\exchange\\images\\1.jpg')
    })

    it('releases a downloaded file after the send', async () => {
        const ch = createFakeChannels({ event: messageEvent() })
        const downloaded = { path: '/exchange/tmp/u.png', hostPath: 'C:\\wxflow\\exchange\\tmp\\u.png', temporary: true }
        ch.mediaFiles['https://example.com/u.png'] = downloaded
        await image.run(data(image, { wechatTo: 'x', wechatMedia: 'https://example.com/u.png' }), '', runOptions(ch))
        expect(ch.released).toEqual([downloaded])
    })

    it('releases the file even when the send fails', async () => {
        const ch = createFakeChannels({ event: messageEvent() })
        const downloaded = { path: '/exchange/tmp/u.png', hostPath: 'C:\\wxflow\\exchange\\tmp\\u.png', temporary: true }
        ch.mediaFiles['https://example.com/u.png'] = downloaded
        ch.sendOutcome = { state: 'fail', error: 'boom' }
        const out = await image.run(data(image, { wechatTo: 'x', wechatMedia: 'https://example.com/u.png' }), '', runOptions(ch))
        expect(out.output.state).toBe('fail')
        expect(ch.released).toEqual([downloaded])
    })

    it('fails with the operator message when the file is missing and sends nothing', async () => {
        const ch = createFakeChannels({ event: messageEvent() })
        await expect(image.run(data(image, { wechatTo: 'x', wechatMedia: '海报/不存在.jpg' }), '', runOptions(ch))).rejects.toThrow(
            '素材 `assets/海报/不存在.jpg` 不存在,请检查 `C:\\wxflow\\exchange\\assets` 目录'
        )
        expect(ch.sends).toEqual([])
    })

    it('does not resolve the media when there is no instance', async () => {
        const ch = createFakeChannels()
        ch.mediaFiles['a.jpg'] = asset
        await expect(image.run(data(image, { wechatTo: 'x', wechatMedia: 'a.jpg' }), '', runOptions(ch))).rejects.toThrow('没有可用的实例')
        expect(ch.released).toEqual([])
    })

    it('Send Video passes the optional duration', async () => {
        const ch = createFakeChannels({ event: messageEvent() })
        ch.mediaFiles['v.mp4'] = { path: '/exchange/assets/v.mp4', hostPath: 'C:\\wxflow\\exchange\\assets\\v.mp4', temporary: false }
        await video.run(data(video, { wechatTo: 'x', wechatMedia: 'v.mp4', wechatVideoDuration: 12 }), '', runOptions(ch))
        expect(ch.sends[0].params).toEqual({ wxid: 'x', path: 'C:\\wxflow\\exchange\\assets\\v.mp4', duration: 12 })
        await video.run(data(video, { wechatTo: 'x', wechatMedia: 'v.mp4' }), '', runOptions(ch))
        expect(ch.sends[1].params).toEqual({ wxid: 'x', path: 'C:\\wxflow\\exchange\\assets\\v.mp4' })
    })

    it('fails when the recipient is empty', async () => {
        const ch = createFakeChannels({ event: messageEvent() })
        ch.mediaFiles['a.jpg'] = asset
        await expect(image.run(data(image, { wechatTo: '', wechatMedia: 'a.jpg' }), '', runOptions(ch))).rejects.toThrow('收件人为空')
    })
})
