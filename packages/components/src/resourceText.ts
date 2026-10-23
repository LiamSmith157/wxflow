// Text of a resource of the library for the nodes that hand it to a model or to the next node (Load Resource, LLM and Agent
// attachments). Only documents have text; images and videos are handled by the callers.
import fs from 'fs'
import { IResourceFile } from './Interface'
import { canExtractText } from './resourceFormats'

export const DEFAULT_RESOURCE_TEXT_MAX_CHARS = 50000
const CACHE_SIZE = 20

/** Largest text taken from one resource, in characters (`RESOURCE_TEXT_MAX_CHARS`, default 50000) */
export const getResourceTextMaxChars = (env: NodeJS.ProcessEnv = process.env): number => {
    const n = Math.floor(Number(env.RESOURCE_TEXT_MAX_CHARS))
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_RESOURCE_TEXT_MAX_CHARS
}

type TextSource = Pick<IResourceFile, 'name' | 'kind' | 'ext' | 'path'>

const quote = (s: string) => `\`${s}\``
const KIND_LABELS: Record<string, string> = { image: '图片', video: '视频' }
// the older binary formats cannot be read; their successors can
const SUCCESSORS: Record<string, string> = { '.doc': 'docx', '.ppt': 'pptx' }

const unsupported = (file: TextSource): Error => {
    const ext = (file.ext || '').toLowerCase()
    if (KIND_LABELS[file.kind]) return new Error(`资源 ${quote(file.name)} 是${KIND_LABELS[file.kind]},无法提取文本`)
    const successor = SUCCESSORS[ext]
    const advice = successor ? `,请另存为 ${successor} 后替换资源文件` : '(支持 pdf、docx、xlsx、xls、pptx、txt)'
    return new Error(`资源 ${quote(file.name)} 的格式 ${ext || '未知'} 不支持提取文本${advice}`)
}

/** UTF-8 (with or without a BOM) when the bytes are valid UTF-8, else GBK, the usual encoding of Chinese text files */
export const decodeText = (buffer: Buffer): string => {
    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return new TextDecoder('utf-16le').decode(buffer.subarray(2))
    if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) return new TextDecoder('utf-16be').decode(buffer.subarray(2))
    try {
        return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(buffer)
    } catch {
        return new TextDecoder('gbk').decode(buffer)
    }
}

const readPdf = async (file: TextSource): Promise<string> => {
    // the lib file avoids the debug run that the package entry does when it is not loaded by another module
    const pdfParse = require('pdf-parse/lib/pdf-parse.js')
    // a copy of its own: the pdf reader looks at the whole ArrayBuffer behind a Buffer, which for small files is a slice of
    // Node's shared pool
    const result = await pdfParse(new Uint8Array(await fs.promises.readFile(file.path)))
    return String(result?.text ?? '')
}

const readDocx = async (file: TextSource): Promise<string> => {
    const mammoth = require('mammoth')
    const result = await mammoth.extractRawText({ path: file.path })
    return String(result?.value ?? '')
}

const readSheets = async (file: TextSource): Promise<string> => {
    const { read, utils } = require('xlsx')
    const workbook = read(await fs.promises.readFile(file.path), { type: 'buffer' })
    return (workbook.SheetNames as string[])
        .map((name) => ({ name, csv: String(utils.sheet_to_csv(workbook.Sheets[name]) ?? '').trim() }))
        .filter((s) => s.csv)
        .map((s) => `## 工作表:${s.name}\n${s.csv}`)
        .join('\n\n')
}

const readPptx = async (file: TextSource): Promise<string> => {
    const { parseOfficeAsync } = require('officeparser')
    return String((await parseOfficeAsync(file.path)) ?? '')
}

const readers: Record<string, typeof readPdf> = {
    '.pdf': readPdf,
    '.docx': readDocx,
    '.xlsx': readSheets,
    '.xls': readSheets,
    '.pptx': readPptx,
    '.txt': async (file) => decodeText(await fs.promises.readFile(file.path))
}

// extraction of a big pdf takes a while and a conversation asks for the same manual on every turn; replacing the file
// changes its size or time, which makes the old entry unreachable
const cache = new Map<string, { text: string; length: number }>()

export const clearResourceTextCache = (): void => cache.clear()

/**
 * The text of a document resource, cut to `maxChars` (a note at the end tells when text was left out). Fails with a
 * message for the operator naming the resource when its format has no text or the file holds no text at all.
 */
export const extractResourceText = async (file: TextSource, maxChars: number = getResourceTextMaxChars()): Promise<string> => {
    const ext = (file.ext || '').toLowerCase()
    if (!canExtractText(ext) || !readers[ext]) throw unsupported(file)

    let stat: fs.Stats
    try {
        stat = await fs.promises.stat(file.path)
    } catch {
        throw new Error(`资源 ${quote(file.name)} 的文件已丢失,请在"资源"页面重新上传`)
    }
    const key = `${file.path}|${stat.size}|${stat.mtimeMs}|${maxChars}`
    let entry = cache.get(key)
    if (entry) {
        cache.delete(key)
        cache.set(key, entry)
    } else {
        let raw: string
        try {
            raw = await readers[ext](file)
        } catch (e) {
            throw new Error(`资源 ${quote(file.name)} 无法读取文本:${(e as Error).message}`)
        }
        const text = raw
            .replace(/\r\n?/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim()
        if (!text) throw new Error(`资源 ${quote(file.name)} 中没有可提取的文字${ext === '.pdf' ? '(扫描版 pdf 需要先做文字识别)' : ''}`)
        entry = text.length > maxChars ? { text: text.slice(0, maxChars), length: text.length } : { text, length: text.length }
        cache.set(key, entry)
        if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string)
    }
    return entry.text.length < entry.length ? `${entry.text}\n\n[内容已截断,原文共 ${entry.length} 个字符]` : entry.text
}
