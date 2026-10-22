// Errors raised while resolving media. Flows are configured by operators, so every message names the Windows
// path to check and never mentions container paths or stack traces.
import { ExchangeConfig, ExchangeSubdir, hostSubdir } from './exchange'

export class MediaError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'MediaError'
    }
}

/** Windows-visible folder text for a subdirectory, e.g. `C:\wxflow\exchange\assets` */
export const hostSubdirText = (cfg: ExchangeConfig, sub: ExchangeSubdir): string => hostSubdir(cfg, sub)

const quote = (s: string) => `\`${s}\``

export const assetMissing = (cfg: ExchangeConfig, relativePath: string): MediaError =>
    new MediaError(`素材 ${quote(`assets/${relativePath.replace(/\\/g, '/')}`)} 不存在,请检查 ${quote(hostSubdirText(cfg, 'assets'))} 目录`)

const hostDirname = (p: string): string => p.replace(/[\\/][^\\/]*$/, '')

export const fileMissing = (hostPath: string): MediaError =>
    new MediaError(`文件 ${quote(hostPath)} 不存在,请检查 ${quote(hostDirname(hostPath))} 目录`)

export const outsideExchange = (cfg: ExchangeConfig, given: string): MediaError =>
    new MediaError(`文件必须放在交换目录内(${quote(cfg.hostDir)}),当前路径 ${quote(given)} 不在其中`)

export const assetEscapes = (relativePath: string): MediaError =>
    new MediaError(`素材路径 ${quote(relativePath)} 超出了 assets 目录,请使用 assets 目录内的相对路径`)

export const mediaEmpty = (): MediaError => new MediaError('媒体参数为空,请填写图片/文件/视频的路径或 URL')

export const downloadFailed = (url: string, reason: string): MediaError => new MediaError(`素材下载失败(${url}): ${reason}`)

export const downloadTooLarge = (url: string, maxBytes: number): MediaError =>
    new MediaError(`素材下载失败(${url}): 文件超过大小上限 ${Math.round(maxBytes / 1024 / 1024)}MB`)
