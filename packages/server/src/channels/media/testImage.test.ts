import fs from 'fs'
import os from 'os'
import path from 'path'
import { MockChannelAdapter } from '../MockChannelAdapter'
import { getTestImage, sendTestImage } from './testImage'

let root: string
beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'wxflow-testimg-'))
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

describe('sendTestImage', () => {
    it('ships a valid PNG', () => {
        expect(getTestImage().subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    })

    it('sends the image by its path in the media working directory and removes the temporary file', async () => {
        const adapter = new MockChannelAdapter()
        adapter.addInstance('wxid_a')
        const result = await sendTestImage(adapter, root, 'wxid_a', 'filehelper', 100)
        expect(result.state).toBe('ok')
        expect(adapter.calls).toHaveLength(1)
        expect(adapter.calls[0].method).toBe('send.image')
        expect(adapter.calls[0].params.wxid).toBe('filehelper')
        const sentPath = adapter.calls[0].params.path as string
        expect(path.dirname(sentPath)).toBe(path.join(root, 'tmp'))
        expect(path.basename(sentPath)).toMatch(/^wxflow-test-.*\.png$/)
        expect(fs.readdirSync(path.join(root, 'tmp'))).toEqual([])
    })

    it('returns the failure reported by the DLL', async () => {
        const adapter = new MockChannelAdapter()
        adapter.addInstance('wxid_a')
        adapter.responses.set('send.image', { ok: false, error: { code: 400, message: '文件不存在' } })
        const result = await sendTestImage(adapter, root, 'wxid_a', 'filehelper', 100)
        expect(result).toEqual({ state: 'fail', error: '文件不存在' })
    })

    it('returns the terminal failure of the job', async () => {
        const adapter = new MockChannelAdapter()
        adapter.addInstance('wxid_a')
        adapter.autoJobResult = { state: 'fail', error: '无法读取图片' }
        const result = await sendTestImage(adapter, root, 'wxid_a', 'filehelper', 100)
        expect(result.state).toBe('fail')
        expect(result.error).toBe('无法读取图片')
    })

    it('reports pending when no terminal state arrives', async () => {
        const adapter = new MockChannelAdapter()
        adapter.addInstance('wxid_a')
        adapter.autoJobResult = undefined
        const result = await sendTestImage(adapter, root, 'wxid_a', 'filehelper', 20)
        expect(result.state).toBe('pending')
    })
})
