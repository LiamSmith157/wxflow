import fs from 'fs'
import os from 'os'
import path from 'path'
import { Readable } from 'stream'
import { secureAxiosRequest } from 'wxflow-components'
import { ExchangeConfig } from './exchange'
import { MediaError } from './errors'
import { MediaResolver, MediaSource } from './resolver'

jest.mock('wxflow-components', () => ({ secureAxiosRequest: jest.fn() }))

const mockRequest = secureAxiosRequest as jest.Mock

let root: string
let ctx: { exchange: ExchangeConfig; maxDownloadBytes: number }

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'wxflow-exchange-'))
    for (const d of ['assets', 'tmp', 'images']) fs.mkdirSync(path.join(root, d), { recursive: true })
    ctx = { exchange: { dir: root, hostDir: root, mapped: false }, maxDownloadBytes: 1024 }
    mockRequest.mockReset()
})

afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

const response = (body: Buffer, headers: Record<string, string> = {}, status = 200) => ({
    status,
    headers,
    data: Readable.from([body.subarray(0, Math.ceil(body.length / 2)), body.subarray(Math.ceil(body.length / 2))])
})

describe('MediaResolver', () => {
    describe('recognition order', () => {
        it('lists the built-in sources in order', () => {
            expect(new MediaResolver().sourceNames()).toEqual(['url', 'absolute-path', 'assets-relative'])
        })

        it('treats a plain value as a path relative to assets/', async () => {
            fs.mkdirSync(path.join(root, 'assets', '海报'))
            fs.writeFileSync(path.join(root, 'assets', '海报', 'a.jpg'), 'x')
            const r = await new MediaResolver().resolve('海报/a.jpg', ctx)
            expect(r.path).toBe(path.join(root, 'assets', '海报', 'a.jpg'))
            expect(r.temporary).toBe(false)
        })

        it('accepts an absolute path inside the exchange directory', async () => {
            const file = path.join(root, 'images', 'p.png')
            fs.writeFileSync(file, 'x')
            const r = await new MediaResolver().resolve(file, ctx)
            expect(r.path).toBe(file)
        })

        it('rejects an absolute path outside the exchange directory', async () => {
            const err = await new MediaResolver().resolve('/etc/hosts', ctx).catch((e) => e)
            expect(err).toBeInstanceOf(MediaError)
            expect(err.message).toContain('交换目录')
        })

        it('rejects a relative path that escapes assets/', async () => {
            fs.writeFileSync(path.join(root, 'secret.txt'), 'x')
            await expect(new MediaResolver().resolve('../secret.txt', ctx)).rejects.toThrow('超出了 assets 目录')
        })

        it('rejects an empty value', async () => {
            await expect(new MediaResolver().resolve('  ', ctx)).rejects.toThrow('媒体参数为空')
        })

        it('maps a Windows host path typed by the operator back to the container', async () => {
            const mapped = { dir: root, hostDir: 'C:\\wxflow\\exchange', mapped: true }
            fs.writeFileSync(path.join(root, 'assets', 'a.jpg'), 'x')
            const r = await new MediaResolver().resolve('C:\\wxflow\\exchange\\assets\\a.jpg', { ...ctx, exchange: mapped })
            expect(r.path).toBe(path.join(root, 'assets', 'a.jpg'))
            expect(r.hostPath).toBe('C:\\wxflow\\exchange\\assets\\a.jpg')
        })

        it('lets a registered source take over its own scheme without changing the built-ins', async () => {
            const resolver = new MediaResolver()
            const resSource: MediaSource = {
                name: 'res',
                matches: (v) => v.startsWith('res://'),
                resolve: async (v) => ({ path: `/x/${v}`, hostPath: `/x/${v}`, temporary: false })
            }
            resolver.register(resSource)
            expect(resolver.sourceNames()).toEqual(['url', 'absolute-path', 'res', 'assets-relative'])
            expect((await resolver.resolve('res://logo', ctx)).path).toBe('/x/res://logo')
            fs.writeFileSync(path.join(root, 'assets', 'a.jpg'), 'x')
            expect((await resolver.resolve('a.jpg', ctx)).path).toBe(path.join(root, 'assets', 'a.jpg'))
        })
    })

    describe('missing files', () => {
        it('reports a missing asset with the Windows folder to check', async () => {
            const mapped = { dir: root, hostDir: 'C:\\wxflow\\exchange', mapped: true }
            const err = await new MediaResolver().resolve('海报/a.jpg', { ...ctx, exchange: mapped }).catch((e) => e)
            expect(err).toBeInstanceOf(MediaError)
            expect(err.message).toBe('素材 `assets/海报/a.jpg` 不存在,请检查 `C:\\wxflow\\exchange\\assets` 目录')
            expect(err.message).not.toContain(root)
            expect(err.stack).toBeDefined()
        })

        it('reports a missing absolute file with its Windows path', async () => {
            const mapped = { dir: root, hostDir: 'C:\\wxflow\\exchange', mapped: true }
            const err = await new MediaResolver()
                .resolve(path.join(root, 'images', 'gone.png'), { ...ctx, exchange: mapped })
                .catch((e) => e)
            expect(err.message).toBe('文件 `C:\\wxflow\\exchange\\images\\gone.png` 不存在,请检查 `C:\\wxflow\\exchange\\images` 目录')
        })
    })

    describe('URL download', () => {
        it('downloads into tmp/ and marks the file temporary', async () => {
            mockRequest.mockResolvedValue(response(Buffer.from('PNGDATA'), { 'content-type': 'image/png' }))
            const r = await new MediaResolver().resolve('https://example.com/pic', ctx)
            expect(mockRequest).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://example.com/pic', responseType: 'stream' }))
            expect(r.temporary).toBe(true)
            expect(path.dirname(r.path)).toBe(path.join(root, 'tmp'))
            expect(r.path.endsWith('.png')).toBe(true)
            expect(fs.readFileSync(r.path, 'utf8')).toBe('PNGDATA')
        })

        it('uses the URL extension when present', async () => {
            mockRequest.mockResolvedValue(response(Buffer.from('x')))
            const r = await new MediaResolver().resolve('https://example.com/a/b.JPG?x=1', ctx)
            expect(r.path.endsWith('.jpg')).toBe(true)
        })

        it('fails over the size limit (declared length) without leaving files', async () => {
            mockRequest.mockResolvedValue(response(Buffer.alloc(10), { 'content-length': '999999' }))
            await expect(new MediaResolver().resolve('https://example.com/big.jpg', ctx)).rejects.toThrow('超过大小上限')
            expect(fs.readdirSync(path.join(root, 'tmp'))).toEqual([])
        })

        it('fails over the size limit (streamed bytes) and removes the partial file', async () => {
            mockRequest.mockResolvedValue(response(Buffer.alloc(5000)))
            await expect(new MediaResolver().resolve('https://example.com/big.jpg', ctx)).rejects.toThrow('超过大小上限')
            expect(fs.readdirSync(path.join(root, 'tmp'))).toEqual([])
        })

        it('fails on a non-2xx status without leaving files', async () => {
            mockRequest.mockResolvedValue(response(Buffer.from('nope'), {}, 404))
            await expect(new MediaResolver().resolve('https://example.com/a.jpg', ctx)).rejects.toThrow('HTTP 404')
            expect(fs.readdirSync(path.join(root, 'tmp'))).toEqual([])
        })

        it('does not download when the outbound restriction rejects the address', async () => {
            mockRequest.mockRejectedValue(new Error('Access to this host is denied by policy'))
            const err = await new MediaResolver().resolve('http://169.254.169.254/latest', ctx).catch((e) => e)
            expect(err).toBeInstanceOf(MediaError)
            expect(err.message).toContain('denied by policy')
            expect(fs.readdirSync(path.join(root, 'tmp'))).toEqual([])
        })
    })
})
