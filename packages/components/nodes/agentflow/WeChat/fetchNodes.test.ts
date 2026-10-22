import fs from 'fs'
import os from 'os'
import path from 'path'
import { createFakeChannels, messageEvent, runOptions } from './testFakes'

const load = (file: string) => new (require(file).nodeClass)()
const fetchImage = load('./FetchImage')
const fetchVoice = load('./FetchVoice')

const data = (node: any, inputs: Record<string, any> = {}): any => ({ id: `${node.name}_0`, inputs })
const branches = (out: any) => out.output.conditions.map((c: any) => c.isFulfilled)

let root: string
beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'wxflow-fetch-'))
    fs.mkdirSync(path.join(root, 'images'))
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

describe('Fetch Image', () => {
    const imageEvent = () => messageEvent({ msgType: 3 })

    it('has a success and a failed output', () => {
        expect(fetchImage.outputs.map((o: any) => o.label)).toEqual(['Success', 'Failed'])
    })

    it('asks the DLL to decrypt into the images folder (Windows path) and outputs a readable path', async () => {
        const ch = createFakeChannels({ event: imageEvent(), exchangeRoot: root })
        fs.writeFileSync(path.join(root, 'images', 'p.jpg'), 'JPEG')
        ch.callResults['image.get'] = { ok: true, result: { path: 'C:\\wxflow\\exchange\\images\\p.jpg', fmt: 'jpg', size: 4 } }
        const out = await fetchImage.run(
            data(fetchImage, { wechatSvrid: '8970001234567890123', wechatImageKind: 'hd', wechatWaitDownload: 5 }),
            '',
            runOptions(ch)
        )
        expect(ch.calls).toEqual([
            {
                instance: 'wxid_bot',
                method: 'image.get',
                params: { svrid: '8970001234567890123', kind: 'hd', waitSeconds: 5, outDir: 'C:\\wxflow\\exchange\\images' },
                timeoutMs: 20000
            }
        ])
        expect(branches(out)).toEqual([true, false])
        expect(out.output.path).toBe(`${root}/images/p.jpg`)
        expect(fs.readFileSync(out.output.path, 'utf8')).toBe('JPEG')
        expect(out.output).toMatchObject({ success: true, fmt: 'jpg', size: 4 })
    })

    it('uses the defaults: original image, 8 seconds', async () => {
        const ch = createFakeChannels({ event: imageEvent(), exchangeRoot: root })
        ch.callResults['image.get'] = { ok: false, error: { code: 504, message: '等待超时未下载' } }
        await fetchImage.run(data(fetchImage, { wechatSvrid: '1' }), '', runOptions(ch))
        expect(ch.calls[0].params).toMatchObject({ kind: 'raw', waitSeconds: 8 })
    })

    it('caps the wait at 60 seconds and never goes below 0', async () => {
        const ch = createFakeChannels({ event: imageEvent(), exchangeRoot: root })
        ch.callResults['image.get'] = { ok: false, error: { code: 504, message: 'x' } }
        await fetchImage.run(data(fetchImage, { wechatSvrid: '1', wechatWaitDownload: 600 }), '', runOptions(ch))
        await fetchImage.run(data(fetchImage, { wechatSvrid: '1', wechatWaitDownload: -3 }), '', runOptions(ch))
        expect(ch.calls.map((c) => c.params.waitSeconds)).toEqual([60, 0])
        expect(ch.calls[0].timeoutMs).toBe(75000)
    })

    it('takes the failed branch with the DLL reason when the image cannot be found', async () => {
        const ch = createFakeChannels({ event: imageEvent(), exchangeRoot: root })
        ch.callResults['image.get'] = { ok: false, error: { code: 504, message: '等待超时未下载' } }
        const out = await fetchImage.run(data(fetchImage, { wechatSvrid: '1' }), '', runOptions(ch))
        expect(branches(out)).toEqual([false, true])
        expect(out.output).toMatchObject({ success: false, error: '等待超时未下载' })
    })

    it('takes the failed branch for a text message without calling the DLL', async () => {
        const ch = createFakeChannels({ event: messageEvent({ msgType: 1 }), exchangeRoot: root })
        const out = await fetchImage.run(data(fetchImage, { wechatSvrid: '8970001234567890123' }), '', runOptions(ch))
        expect(branches(out)).toEqual([false, true])
        expect(out.output.error).toContain('不是图片消息')
        expect(ch.calls).toEqual([])
    })

    it('takes the failed branch without a svrid', async () => {
        const ch = createFakeChannels({ event: { channel: 'wechat', instance: 'wxid_bot', event: 'wx.login' }, exchangeRoot: root })
        const out = await fetchImage.run(data(fetchImage, { wechatSvrid: '' }), '', runOptions(ch))
        expect(branches(out)).toEqual([false, true])
        expect(out.output.error).toContain('缺少 svrid')
    })

    it('takes the failed branch when wxflow cannot read the file the DLL wrote (mapping problem)', async () => {
        const ch = createFakeChannels({ event: imageEvent(), exchangeRoot: root })
        ch.callResults['image.get'] = { ok: true, result: { path: 'C:\\wxflow\\exchange\\images\\ghost.jpg' } }
        const out = await fetchImage.run(data(fetchImage, { wechatSvrid: '1' }), '', runOptions(ch))
        expect(branches(out)).toEqual([false, true])
        expect(out.output.error).toContain('读不到文件')
    })

    it('takes the failed branch when the DLL reports a path outside the exchange folder', async () => {
        const ch = createFakeChannels({ event: imageEvent(), exchangeRoot: root })
        ch.callResults['image.get'] = { ok: true, result: { path: 'D:\\elsewhere\\a.jpg' } }
        expect(branches(await fetchImage.run(data(fetchImage, { wechatSvrid: '1' }), '', runOptions(ch)))).toEqual([false, true])
    })

    it('fails the node when no instance can be used', async () => {
        const ch = createFakeChannels({ exchangeRoot: root })
        await expect(fetchImage.run(data(fetchImage, { wechatSvrid: '1' }), '', runOptions(ch))).rejects.toThrow('没有可用的实例')
    })
})

describe('Fetch Voice', () => {
    const voiceEvent = () => messageEvent({ msgType: 34, svrid: '5550001' })

    it('saves the audio as a WAV file in the voice folder and outputs its path', async () => {
        const ch = createFakeChannels({ event: voiceEvent(), exchangeRoot: root })
        ch.mediaResults['5550001'] = { ok: true, data: Buffer.from('RIFF-WAV'), result: { contentType: 'audio/wav' } }
        const out = await fetchVoice.run(data(fetchVoice, { wechatSvrid: '5550001' }), '', runOptions(ch))
        expect(branches(out)).toEqual([true, false])
        expect(out.output.path.startsWith(`${root}/voice/voice-5550001-`)).toBe(true)
        expect(out.output.path.endsWith('.wav')).toBe(true)
        expect(fs.readFileSync(out.output.path, 'utf8')).toBe('RIFF-WAV')
        expect(out.output).toMatchObject({ success: true, size: 8, contentType: 'audio/wav' })
    })

    it('takes the failed branch when the audio does not arrive', async () => {
        const ch = createFakeChannels({ event: voiceEvent(), exchangeRoot: root })
        ch.mediaResults['5550001'] = { ok: false, error: { code: 504, message: '语音音频帧未到达' } }
        const out = await fetchVoice.run(data(fetchVoice, { wechatSvrid: '5550001' }), '', runOptions(ch))
        expect(branches(out)).toEqual([false, true])
        expect(out.output.error).toBe('语音音频帧未到达')
    })

    it('takes the failed branch for a message that is not a voice message', async () => {
        const ch = createFakeChannels({ event: messageEvent({ msgType: 1, svrid: '5550001' }), exchangeRoot: root })
        const out = await fetchVoice.run(data(fetchVoice, { wechatSvrid: '5550001' }), '', runOptions(ch))
        expect(branches(out)).toEqual([false, true])
        expect(out.output.error).toContain('不是语音消息')
    })

    it('rejects a svrid that is not a number (it becomes part of a file name)', async () => {
        const ch = createFakeChannels({ event: voiceEvent(), exchangeRoot: root })
        const out = await fetchVoice.run(data(fetchVoice, { wechatSvrid: '../../etc/passwd' }), '', runOptions(ch))
        expect(branches(out)).toEqual([false, true])
        expect(fs.existsSync(path.join(root, 'voice'))).toBe(false)
    })

    it('takes the failed branch without a svrid', async () => {
        const ch = createFakeChannels({ event: voiceEvent(), exchangeRoot: root })
        expect(branches(await fetchVoice.run(data(fetchVoice, { wechatSvrid: '' }), '', runOptions(ch)))).toEqual([false, true])
    })
})
