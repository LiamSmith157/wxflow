import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { Readable } from 'stream'
import { secureAxiosRequest } from 'wxflow-components'
import {
    ExchangeConfig,
    ExchangePathError,
    exchangeSubdir,
    fromHostPath,
    isAbsoluteAnyFlavor,
    isInsideExchange,
    toHostPath
} from './exchange'
import {
    MediaError,
    assetEscapes,
    assetMissing,
    downloadFailed,
    downloadTooLarge,
    fileMissing,
    mediaEmpty,
    outsideExchange
} from './errors'

export interface ResolvedMedia {
    /** The file in wxflow's view */
    path: string
    /** The same file as the DLL sees it */
    hostPath: string
    /** Downloaded for this send only: the caller deletes it once the send finished */
    temporary: boolean
}

export interface MediaContext {
    exchange: ExchangeConfig
    /** Upper bound for URL downloads */
    maxDownloadBytes: number
}

export interface MediaSource {
    name: string
    matches(value: string): boolean
    resolve(value: string, ctx: MediaContext): Promise<ResolvedMedia>
}

const toResolved = (ctx: MediaContext, p: string, temporary: boolean): ResolvedMedia => ({
    path: p,
    hostPath: toHostPath(ctx.exchange, p),
    temporary
})

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
        const tmpDir = exchangeSubdir(ctx.exchange, 'tmp')
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
        return toResolved(ctx, finalPath, true)
    }
}

export const absolutePathSource: MediaSource = {
    name: 'absolute-path',
    matches: (v) => isAbsoluteAnyFlavor(v),
    async resolve(value, ctx) {
        let local: string
        if (isInsideExchange(ctx.exchange, value)) {
            local = value
        } else if (ctx.exchange.mapped && isInsideExchange({ ...ctx.exchange, dir: ctx.exchange.hostDir }, value)) {
            // the operator typed the Windows path of a file in the exchange directory
            local = fromHostPath(ctx.exchange, value)
        } else {
            throw outsideExchange(ctx.exchange, value)
        }
        const resolved = toResolved(ctx, local, false)
        if (!(await fileExists(local))) throw fileMissing(resolved.hostPath)
        return resolved
    }
}

export const assetsRelativeSource: MediaSource = {
    name: 'assets-relative',
    matches: () => true,
    async resolve(value, ctx) {
        const assetsDir = exchangeSubdir(ctx.exchange, 'assets')
        const full = path.join(assetsDir, value)
        const rel = path.relative(assetsDir, full)
        if (rel.startsWith('..') || path.isAbsolute(rel)) throw assetEscapes(value)
        // build the DLL path from the relative part so a Windows host path is honoured even on Linux
        if (!(await fileExists(full))) throw assetMissing(ctx.exchange, rel)
        return toResolved(ctx, full, false)
    }
}

/**
 * Resolves a media parameter to a file in the exchange directory. Recognition order: URL, absolute path,
 * registered custom sources (e.g. `res://` from the resource library), then a path relative to `assets/`.
 */
export class MediaResolver {
    private sources: MediaSource[] = [urlSource, absolutePathSource, assetsRelativeSource]

    /** Register a new source; it is consulted after the built-in URL and absolute-path sources and before the `assets/` fallback */
    register(source: MediaSource): void {
        this.sources = this.sources.filter((s) => s.name !== source.name)
        this.sources.splice(this.sources.length - 1, 0, source)
    }

    async resolve(rawValue: unknown, ctx: MediaContext): Promise<ResolvedMedia> {
        const value = typeof rawValue === 'string' ? rawValue.trim() : ''
        if (!value) throw mediaEmpty()
        const source = this.sources.find((s) => s.matches(value))!
        try {
            return await source.resolve(value, ctx)
        } catch (e) {
            if (e instanceof ExchangePathError) throw outsideExchange(ctx.exchange, value)
            throw e
        }
    }

    /** Names in recognition order (for tests and diagnostics) */
    sourceNames(): string[] {
        return this.sources.map((s) => s.name)
    }
}

export { MediaError }
