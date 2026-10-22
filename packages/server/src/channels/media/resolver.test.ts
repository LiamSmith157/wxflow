import fs from 'fs'
import os from 'os'
import path from 'path'
import { Readable } from 'stream'
import { secureAxiosRequest } from 'wxflow-components'
import { MediaError } from './errors'
import { MediaResolver, MediaSource } from './resolver'

jest.mock('wxflow-components', () => ({ secureAxiosRequest: jest.fn() }))

const mockRequest = secureAxiosRequest as jest.Mock

let root: string
let ctx: { mediaRoot: string; maxDownloadBytes: number }

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'wxflow-media-'))
    fs.mkdirSync(path.join(root, 'tmp'), { recursive: true })
    ctx = { mediaRoot: root, maxDownloadBytes: 1024 }
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
        it('lists the built-in sources in order: URL, then absolute path', () => {
            expect(new MediaResolver().sourceNames()).toEqual(['url', 'absolute-path'])
        })

        it('accepts an absolute path anywhere on the machine and hands it over as it is', async () => {
            const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'wxflow-elsewhere-'))
            try {
                const file = path.join(elsewhere, '海报 a.jpg')
                fs.writeFileSync(file, 'x')
                const r = await new MediaResolver().resolve(file, ctx)
                expect(r).toEqual({ path: file, temporary: false })
            } finally {
                fs.rmSync(elsewhere, { recursive: true, force: true })
            }
        })

        it('trims the value before looking at it', async () => {
            const file = path.join(root, 'p.png')
            fs.writeFileSync(file, 'x')
            expect((await new MediaResolver().resolve(`  ${file}  `, ctx)).path).toBe(file)
        })

        it('refuses a relative path and says a URL or a full path is needed', async () => {
            const err = await new MediaResolver().resolve('海报/a.jpg', ctx).catch((e) => e)
            expect(err).toBeInstanceOf(MediaError)
            expect(err.message).toContain('海报/a.jpg')
            expect(err.message).toContain('http(s) 地址或文件的完整路径')
            expect(err.message).toContain('D:\\素材\\海报.jpg')
        })

        it('refuses a scheme nobody registered', async () => {
            await expect(new MediaResolver().resolve('res://id/1', ctx)).rejects.toThrow('无法识别的媒体')
        })

        it('rejects an empty value', async () => {
            await expect(new MediaResolver().resolve('  ', ctx)).rejects.toThrow('媒体参数为空')
        })

        it('lets a registered source take over its own scheme without changing the built-ins', async () => {
            const resolver = new MediaResolver()
            const resSource: MediaSource = {
                name: 'res',
                matches: (v) => v.startsWith('res://'),
                resolve: async (v) => ({ path: `/x/${v}`, temporary: false })
            }
            resolver.register(resSource)
            expect(resolver.sourceNames()).toEqual(['url', 'absolute-path', 'res'])
            expect((await resolver.resolve('res://logo', ctx)).path).toBe('/x/res://logo')
            const file = path.join(root, 'a.jpg')
            fs.writeFileSync(file, 'x')
            expect((await resolver.resolve(file, ctx)).path).toBe(file)
            await expect(resolver.resolve('a.jpg', ctx)).rejects.toThrow('无法识别的媒体')
        })

        it('replaces a source registered twice under the same name', () => {
            const resolver = new MediaResolver()
            const make = (): MediaSource => ({ name: 'res', matches: () => false, resolve: async () => ({ path: '', temporary: false }) })
            resolver.register(make())
            resolver.register(make())
            expect(resolver.sourceNames()).toEqual(['url', 'absolute-path', 'res'])
        })
    })

    describe('missing files', () => {
        it('names the path the operator typed and what to do', async () => {
            const missing = path.join(root, 'gone.png')
            const err = await new MediaResolver().resolve(missing, ctx).catch((e) => e)
            expect(err).toBeInstanceOf(MediaError)
            expect(err.message).toBe(`文件 \`${missing}\` 不存在,请检查路径`)
        })

        it('treats a directory as missing', async () => {
            const err = await new MediaResolver().resolve(root, ctx).catch((e) => e)
            expect(err).toBeInstanceOf(MediaError)
            expect(err.message).toContain('不存在')
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
