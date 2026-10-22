import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { Readable } from 'stream'
import { secureAxiosRequest } from 'wxflow-components'
import { MediaError, downloadFailed, downloadTooLarge, fileMissing, mediaEmpty, mediaUnsupported } from './errors'
import { isAbsolutePath, mediaSubdir } from './workdir'

export interface ResolvedMedia {
    /** The file; the DLL opens this very path */
    path: string
    /** Downloaded for this send only: the caller deletes it once the send finished */
    temporary: boolean
}

export interface MediaContext {
    /** The media working directory (`~/.wxflow/wechat`) */
    mediaRoot: string
    /** Upper bound for URL downloads */
    maxDownloadBytes: number
    /** Workspace of the flow run; `res://` references are looked up in it */
    workspaceId?: string
    /** Kinds of resource the caller accepts (any when absent), e.g. only images for Send Image */
    resourceKinds?: Array<'image' | 'video' | 'file'>
}

export interface MediaSource {
    name: string
    matches(value: string): boolean
    resolve(value: string, ctx: MediaContext): Promise<ResolvedMedia>
}

const fileExists = async (p: string): Promise<boolean> => {
    try {
        return (await fs.promises.stat(p)).isFile()
    } catch {
        return false
    }
}

const CONTENT_TYPE_EXT: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'application/pdf': '.pdf'
}

const pickExtension = (url: string, contentType: string | undefined): string => {
    try {
        const ext = path.extname(new URL(url).pathname).toLowerCase()
        if (/^\.[a-z0-9]{1,8}$/.test(ext)) return ext
    } catch {
        /* fall through to content type */
    }
    return CONTENT_TYPE_EXT[(contentType ?? '').split(';')[0].trim().toLowerCase()] ?? ''
}

export const urlSource: MediaSource = {
    name: 'url',
    matches: (v) => /^https?:\/\//i.test(v),
    async resolve(url, ctx) {
        const tmpDir = mediaSubdir(ctx.mediaRoot, 'tmp')
        await fs.promises.mkdir(tmpDir, { recursive: true })
        let response
        try {
            response = await secureAxiosRequest({ url, method: 'GET', responseType: 'stream', timeout: 60_000 })
        } catch (e) {
            // thrown by the outbound restrictions (deny list) or the network: nothing was downloaded
            throw downloadFailed(url, (e as Error).message)
        }
        const stream = response.data as Readable | undefined
        const closeStream = () => (stream as Readable | undefined)?.destroy?.()
        if (response.status < 200 || response.status >= 300) {
            closeStream()
            throw downloadFailed(url, `服务器返回 HTTP ${response.status}`)
        }
        const declared = Number(response.headers?.['content-length'])
        if (Number.isFinite(declared) && declared > ctx.maxDownloadBytes) {
            closeStream()
            throw downloadTooLarge(url, ctx.maxDownloadBytes)
        }
        const finalPath = path.join(tmpDir, `${crypto.randomUUID()}${pickExtension(url, response.headers?.['content-type'])}`)
        const partPath = `${finalPath}.part`
        const out = fs.createWriteStream(partPath)
        let received = 0
        try {
            await new Promise<void>((resolve, reject) => {
                stream!.on('data', (chunk: Buffer) => {
                    received += chunk.length
                    if (received > ctx.maxDownloadBytes) {
                        reject(downloadTooLarge(url, ctx.maxDownloadBytes))
                        stream!.destroy()
                        out.destroy()
                    }
                })
                stream!.on('error', (err) => reject(downloadFailed(url, err.message)))
                stream!.on('aborted', () => reject(downloadFailed(url, '连接中断')))
                out.on('error', (err) => reject(downloadFailed(url, err.message)))
                out.on('finish', () => resolve())
                stream!.pipe(out)
            })
            await fs.promises.rename(partPath, finalPath)
        } catch (e) {
            out.destroy()
            await fs.promises.rm(partPath, { force: true })
            throw e
        }
        return { path: finalPath, temporary: true }
    }
}

export const absolutePathSource: MediaSource = {
    name: 'absolute-path',
    matches: (v) => isAbsolutePath(v),
    async resolve(value) {
        if (!(await fileExists(value))) throw fileMissing(value)
        return { path: value, temporary: false }
    }
}

/**
 * Resolves a media parameter to a local file. Recognition order: URL, absolute path (anywhere on the machine), then
 * registered custom sources (e.g. `res://` from the resource library). Anything else is refused.
 */
export class MediaResolver {
    private sources: MediaSource[] = [urlSource, absolutePathSource]

    /** Register a new source; it is consulted after the built-in URL and absolute-path sources */
    register(source: MediaSource): void {
        this.sources = [...this.sources.filter((s) => s.name !== source.name), source]
    }

    async resolve(rawValue: unknown, ctx: MediaContext): Promise<ResolvedMedia> {
        const value = typeof rawValue === 'string' ? rawValue.trim() : ''
        if (!value) throw mediaEmpty()
        const source = this.sources.find((s) => s.matches(value))
        if (!source) throw mediaUnsupported(value)
        return source.resolve(value, ctx)
    }

    /** Names in recognition order (for tests and diagnostics) */
    sourceNames(): string[] {
        return this.sources.map((s) => s.name)
    }
}

export { MediaError }
