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

const KIND_LABELS: Record<string, string> = { image: '图片', video: '视频', file: '文件' }
export const kindLabel = (kind: string): string => KIND_LABELS[kind] ?? kind

export const resourceByIdMissing = (id: string): MediaError => new MediaError(`资源不存在,可能已被删除(${quote(`res://id/${id}`)})`)

export const resourceByNameMissing = (name: string): MediaError => new MediaError(`资源 ${quote(name)} 不存在`)

export const resourceWrongKind = (name: string, actual: string, wanted: string[], usage = '发送'): MediaError =>
    new MediaError(`资源 ${quote(name)} 是${kindLabel(actual)},不能作为${wanted.map(kindLabel).join('或')}${usage}`)

export const resourceFileMissing = (name: string): MediaError => new MediaError(`资源 ${quote(name)} 的文件已丢失,请在"资源"页面重新上传`)

export const resourceRefInvalid = (value: string): MediaError =>
    new MediaError(`无法识别的资源引用 ${quote(value)}:请使用 res://id/<资源 ID> 或 res://name/<资源名称>`)

export const resourceNoWorkspace = (): MediaError => new MediaError('当前运行没有所属工作区,无法使用资源库中的资源')

export const resourceOnly = (value: string): MediaError =>
    new MediaError(`${quote(value)} 不是资源库中的资源:这里只能使用资源库中的资源,请从下拉中选择,或填写 res://name/<资源名称>`)

export const resourceNotReadable = (ref: string, ext: string): MediaError =>
    new MediaError(`资源 ${quote(ref)} 的格式 ${ext || '未知'} 不支持提取文本,只能附加图片和 pdf、docx、xlsx、xls、pptx、txt 文档`)
