import path from 'path'
import type { ResourceKind } from '../../database/entities/Resource'

export interface DetectedType {
    kind: ResourceKind
    mimeType: string
    /** Extension to store the file under, with the dot */
    ext: string
}

/** How many leading bytes the detection needs */
export const SNIFF_BYTES = 8192

const startsWith = (buf: Buffer, bytes: number[], offset = 0): boolean => bytes.every((b, i) => buf[offset + i] === b)
const ascii = (buf: Buffer, start: number, end: number): string => buf.subarray(start, end).toString('latin1')

// brands of an ISO base media file that an mp4 player handles (QuickTime "qt  " and HEIF brands are not mp4)
const MP4_BRANDS = new Set(['isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'dash', 'M4V ', 'MSNV'])

// containers whose content is decided by the extension the user gave
const ZIP_EXTENSIONS: Record<string, string> = {
    '.zip': 'application/zip',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
}
const OLE_EXTENSIONS: Record<string, string> = {
    '.doc': 'application/msword',
    '.xls': 'application/vnd.ms-excel',
    '.ppt': 'application/vnd.ms-powerpoint'
}

/**
 * Decide what an uploaded file is from its leading bytes, never from its name alone, so an executable renamed to
 * ".jpg" is refused. The extension only breaks ties between formats that share a container (docx/xlsx/pptx/zip,
 * doc/xls/ppt) and marks plain text. Returns undefined for anything that is not an allowed type.
 */
export const detectFileType = (head: Buffer, fileName: string): DetectedType | undefined => {
    const declared = path.extname(fileName).toLowerCase()

    if (startsWith(head, [0xff, 0xd8, 0xff])) return { kind: 'image', mimeType: 'image/jpeg', ext: '.jpg' }
    if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: 'image', mimeType: 'image/png', ext: '.png' }
    if (ascii(head, 0, 6) === 'GIF87a' || ascii(head, 0, 6) === 'GIF89a') return { kind: 'image', mimeType: 'image/gif', ext: '.gif' }
    if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 12) === 'WEBP') return { kind: 'image', mimeType: 'image/webp', ext: '.webp' }

    if (ascii(head, 4, 8) === 'ftyp') {
        return MP4_BRANDS.has(ascii(head, 8, 12)) ? { kind: 'video', mimeType: 'video/mp4', ext: '.mp4' } : undefined
    }

    if (ascii(head, 0, 5) === '%PDF-') return { kind: 'file', mimeType: 'application/pdf', ext: '.pdf' }
    if (startsWith(head, [0x50, 0x4b, 0x03, 0x04]) && ZIP_EXTENSIONS[declared]) {
        return { kind: 'file', mimeType: ZIP_EXTENSIONS[declared], ext: declared }
    }
    if (startsWith(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) && OLE_EXTENSIONS[declared]) {
        return { kind: 'file', mimeType: OLE_EXTENSIONS[declared], ext: declared }
    }
    if (declared === '.txt' && head.length > 0 && !head.includes(0)) return { kind: 'file', mimeType: 'text/plain', ext: '.txt' }

    return undefined
}

export const ALLOWED_TYPES_HINT = '图片(jpg、png、gif、webp)、视频(mp4)、文档(pdf、doc、docx、xls、xlsx、ppt、pptx、txt、zip)'
