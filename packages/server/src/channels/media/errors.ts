// Errors raised while resolving media. Flows are configured by operators, so every message names the path or value
// to check and never mentions stack traces.

export class MediaError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'MediaError'
    }
}

const quote = (s: string) => `\`${s}\``

export const fileMissing = (filePath: string): MediaError => new MediaError(`文件 ${quote(filePath)} 不存在,请检查路径`)

export const mediaUnsupported = (value: string): MediaError =>
    new MediaError(`无法识别的媒体 ${quote(value)}:请填写 http(s) 地址或文件的完整路径(例如 D:\\素材\\海报.jpg)`)

export const mediaEmpty = (): MediaError => new MediaError('媒体参数为空,请填写图片/文件/视频的路径或 URL')

export const downloadFailed = (url: string, reason: string): MediaError => new MediaError(`素材下载失败(${url}): ${reason}`)

export const downloadTooLarge = (url: string, maxBytes: number): MediaError =>
    new MediaError(`素材下载失败(${url}): 文件超过大小上限 ${Math.round(maxBytes / 1024 / 1024)}MB`)
