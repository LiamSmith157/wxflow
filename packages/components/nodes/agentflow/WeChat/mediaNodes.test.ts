import { createFakeChannels, messageEvent, runOptions } from './testFakes'

const load = (file: string) => new (require(file).nodeClass)()
const image = load('./SendImage')
const file = load('./SendFile')
const video = load('./SendVideo')

const data = (node: any, inputs: Record<string, any>): any => ({ id: `${node.name}_0`, inputs })
const poster = { path: 'D:\\素材\\海报.jpg', temporary: false }

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
    ])('%s: the DLL receives the path of the file as it is', async (_name, node, method) => {
        const ch = createFakeChannels({ event: messageEvent() })
        ch.mediaFiles['D:\\素材\\海报.jpg'] = poster
        const out = await node.run(data(node, { wechatTo: 'wxid_friend', wechatMedia: 'D:\\素材\\海报.jpg' }), '', runOptions(ch))
        expect(ch.sends).toHaveLength(1)
        expect(ch.sends[0].method).toBe(method)
        expect(ch.sends[0].params).toEqual({ wxid: 'wxid_friend', path: 'D:\\素材\\海报.jpg' })
        expect(out.output).toMatchObject({ state: 'ok', to: 'wxid_friend' })
    })

    it('tells the runtime which kinds of library resource each node accepts', async () => {
        const ch = createFakeChannels({ event: messageEvent() })
        ch.mediaFiles['res://id/1'] = { path: 'C:\\Users\\op\\.wxflow\\resources\\ws\\1.png', temporary: false }
        for (const node of [image, video, file]) {
            await node.run(data(node, { wechatTo: 'x', wechatMedia: 'res://id/1' }), '', runOptions(ch))
        }
        expect(ch.resolveKinds).toEqual([['image'], ['video'], undefined])
        expect(ch.sends.map((s) => s.params.path)).toEqual(Array(3).fill('C:\\Users\\op\\.wxflow\\resources\\ws\\1.png'))
    })

    it('sends an image fetched upstream (the path output by Fetch Image)', async () => {
        const ch = createFakeChannels({ event: messageEvent() })
        const fetched = 'C:\\Users\\op\\.wxflow\\wechat\\images\\1.jpg'
        ch.mediaFiles[fetched] = { path: fetched, temporary: false }
        await image.run(data(image, { wechatTo: 'x', wechatMedia: fetched }), '', runOptions(ch))
        expect(ch.sends[0].params.path).toBe(fetched)
    })

    it('releases a downloaded file after the send', async () => {
        const ch = createFakeChannels({ event: messageEvent() })
        const downloaded = { path: 'C:\\Users\\op\\.wxflow\\wechat\\tmp\\u.png', temporary: true }
        ch.mediaFiles['https://example.com/u.png'] = downloaded
        await image.run(data(image, { wechatTo: 'x', wechatMedia: 'https://example.com/u.png' }), '', runOptions(ch))
        expect(ch.sends[0].params.path).toBe(downloaded.path)
        expect(ch.released).toEqual([downloaded])
    })

    it('releases the file even when the send fails', async () => {
        const ch = createFakeChannels({ event: messageEvent() })
        const downloaded = { path: 'C:\\Users\\op\\.wxflow\\wechat\\tmp\\u.png', temporary: true }
        ch.mediaFiles['https://example.com/u.png'] = downloaded
        ch.sendOutcome = { state: 'fail', error: 'boom' }
        const out = await image.run(data(image, { wechatTo: 'x', wechatMedia: 'https://example.com/u.png' }), '', runOptions(ch))
        expect(out.output.state).toBe('fail')
        expect(ch.released).toEqual([downloaded])
    })

    it('fails with the operator message when the file is missing and sends nothing', async () => {
        const ch = createFakeChannels({ event: messageEvent() })
        await expect(image.run(data(image, { wechatTo: 'x', wechatMedia: 'D:\\素材\\不存在.jpg' }), '', runOptions(ch))).rejects.toThrow(
            '文件 `D:\\素材\\不存在.jpg` 不存在,请检查路径'
        )
        expect(ch.sends).toEqual([])
    })

    it('does not resolve the media when there is no instance', async () => {
        const ch = createFakeChannels()
        ch.mediaFiles['D:\\a.jpg'] = poster
        await expect(image.run(data(image, { wechatTo: 'x', wechatMedia: 'D:\\a.jpg' }), '', runOptions(ch))).rejects.toThrow(
            '没有可用的实例'
        )
        expect(ch.released).toEqual([])
    })

    it('Send Video passes the optional duration', async () => {
        const ch = createFakeChannels({ event: messageEvent() })
        ch.mediaFiles['D:\\v.mp4'] = { path: 'D:\\v.mp4', temporary: false }
        await video.run(data(video, { wechatTo: 'x', wechatMedia: 'D:\\v.mp4', wechatVideoDuration: 12 }), '', runOptions(ch))
        expect(ch.sends[0].params).toEqual({ wxid: 'x', path: 'D:\\v.mp4', duration: 12 })
        await video.run(data(video, { wechatTo: 'x', wechatMedia: 'D:\\v.mp4' }), '', runOptions(ch))
        expect(ch.sends[1].params).toEqual({ wxid: 'x', path: 'D:\\v.mp4' })
    })

    it('fails when the recipient is empty', async () => {
        const ch = createFakeChannels({ event: messageEvent() })
        ch.mediaFiles['D:\\a.jpg'] = poster
        await expect(image.run(data(image, { wechatTo: '', wechatMedia: 'D:\\a.jpg' }), '', runOptions(ch))).rejects.toThrow('收件人为空')
    })
})
