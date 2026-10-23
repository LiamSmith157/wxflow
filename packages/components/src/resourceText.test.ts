import fs from 'fs'
import os from 'os'
import path from 'path'
import { utils, write } from 'xlsx'
import { clearResourceTextCache, decodeText, extractResourceText, getResourceTextMaxChars } from './resourceText'

// ─── fixtures built in memory: no binary files in the repository ──────────────

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
})
const crc32 = (buf: Buffer): number => {
    let c = 0xffffffff
    for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
}

/** A zip with stored (not compressed) entries, enough for docx and pptx */
const zip = (entries: Record<string, string>): Buffer => {
    const locals: Buffer[] = []
    const centrals: Buffer[] = []
    let offset = 0
    for (const [name, text] of Object.entries(entries)) {
        const nameBuf = Buffer.from(name)
        const data = Buffer.from(text)
        const crc = crc32(data)
        const local = Buffer.alloc(30)
        local.writeUInt32LE(0x04034b50, 0)
        local.writeUInt16LE(20, 4)
        local.writeUInt32LE(crc, 14)
        local.writeUInt32LE(data.length, 18)
        local.writeUInt32LE(data.length, 22)
        local.writeUInt16LE(nameBuf.length, 26)
        locals.push(local, nameBuf, data)
        const central = Buffer.alloc(46)
        central.writeUInt32LE(0x02014b50, 0)
        central.writeUInt16LE(20, 4)
        central.writeUInt16LE(20, 6)
        central.writeUInt32LE(crc, 16)
        central.writeUInt32LE(data.length, 20)
        central.writeUInt32LE(data.length, 24)
        central.writeUInt16LE(nameBuf.length, 28)
        central.writeUInt32LE(offset, 42)
        centrals.push(central, nameBuf)
        offset += local.length + nameBuf.length + data.length
    }
    const centralBuf = Buffer.concat(centrals)
    const end = Buffer.alloc(22)
    end.writeUInt32LE(0x06054b50, 0)
    end.writeUInt16LE(Object.keys(entries).length, 8)
    end.writeUInt16LE(Object.keys(entries).length, 10)
    end.writeUInt32LE(centralBuf.length, 12)
    end.writeUInt32LE(offset, 16)
    return Buffer.concat([...locals, centralBuf, end])
}

const CONTENT_TYPES = (extra: string) =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${extra}</Types>`

const docx = (...paragraphs: string[]): Buffer =>
    zip({
        '[Content_Types].xml': CONTENT_TYPES(
            '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        ),
        '_rels/.rels':
            '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        'word/document.xml': `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs
            .map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`)
            .join('')}</w:body></w:document>`
    })

const pptx = (...slides: string[]): Buffer =>
    zip({
        '[Content_Types].xml': CONTENT_TYPES(
            slides
                .map(
                    (_, i) =>
                        `<Override PartName="/ppt/slides/slide${
                            i + 1
                        }.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
                )
                .join('')
        ),
        ...Object.fromEntries(
            slides.map((text, i) => [
                `ppt/slides/slide${i + 1}.xml`,
                `<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`
            ])
        )
    })

/** A one-page pdf; `text` empty gives a page without any text, like a scan */
const pdf = (text: string): Buffer => {
    const stream = text ? `BT /F1 14 Tf 10 50 Td (${text}) Tj ET` : ''
    const objects = [
        '<</Type/Catalog/Pages 2 0 R>>',
        '<</Type/Pages/Kids[3 0 R]/Count 1>>',
        '<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 100]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
        `<</Length ${stream.length}>>\nstream\n${stream}\nendstream`,
        '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>'
    ]
    let out = '%PDF-1.4\n'
    const offsets: number[] = []
    objects.forEach((body, i) => {
        offsets.push(out.length)
        out += `${i + 1} 0 obj\n${body}\nendobj\n`
    })
    const xref = out.length
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
    out += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`
    return Buffer.from(out, 'latin1')
}

const workbook = (sheets: Record<string, string[][]>, bookType: 'xlsx' | 'biff8' = 'xlsx'): Buffer => {
    const wb = utils.book_new()
    for (const [name, rows] of Object.entries(sheets)) utils.book_append_sheet(wb, utils.aoa_to_sheet(rows), name)
    return write(wb, { type: 'buffer', bookType })
}

// parsing libraries are loaded on first use, which is slow on a cold start
jest.setTimeout(60000)

// ─── tests ──────────────────────────────────────────────────────────────────

let dir: string
const store = (name: string, ext: string, data: Buffer | string, kind: 'file' | 'image' | 'video' = 'file') => {
    const file = path.join(dir, `${name}${ext}`)
    fs.writeFileSync(file, data)
    return { name, kind, ext, path: file } as const
}

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wxflow-restext-'))
    clearResourceTextCache()
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('extractResourceText', () => {
    it('reads the text of a pdf', async () => {
        const text = await extractResourceText(store('manual', '.pdf', pdf('Warranty is 24 months')))
        expect(text).toContain('Warranty is 24 months')
    })

    it('reads the text of a docx, Chinese included', async () => {
        const text = await extractResourceText(store('合同', '.docx', docx('第一条 保修期为二十四个月', '第二条 退货')))
        expect(text).toContain('第一条 保修期为二十四个月')
        expect(text).toContain('第二条 退货')
    })

    it('reads the text of a pptx', async () => {
        const text = await extractResourceText(store('活动方案', '.pptx', pptx('国庆大促', '满减规则')))
        expect(text).toContain('国庆大促')
        expect(text).toContain('满减规则')
    })

    it('puts each sheet of a workbook after the other, headed by the sheet name', async () => {
        const text = await extractResourceText(
            store(
                '价目表',
                '.xlsx',
                workbook({
                    价目表: [
                        ['商品', '价格'],
                        ['茶叶', '88']
                    ],
                    折扣: [['会员', '0.9']]
                })
            )
        )
        expect(text.indexOf('## 工作表:价目表')).toBeGreaterThanOrEqual(0)
        expect(text.indexOf('## 工作表:折扣')).toBeGreaterThan(text.indexOf('## 工作表:价目表'))
        expect(text).toContain('茶叶,88')
        expect(text).toContain('会员,0.9')
    })

    it('reads a xls workbook as well', async () => {
        expect(await extractResourceText(store('旧表', '.xls', workbook({ S1: [['a', 'b']] }, 'biff8')))).toContain('a,b')
    })

    describe('txt encodings', () => {
        const GBK_NIHAO = Buffer.from([0xc4, 0xe3, 0xba, 0xc3, 0xca, 0xc0, 0xbd, 0xe7]) // 你好世界

        it('reads UTF-8 with and without a BOM', async () => {
            expect(await extractResourceText(store('a', '.txt', Buffer.from('你好世界')))).toBe('你好世界')
            const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('你好世界')])
            expect(await extractResourceText(store('b', '.txt', withBom))).toBe('你好世界')
        })

        it('reads GBK when the bytes are not valid UTF-8', async () => {
            expect(await extractResourceText(store('c', '.txt', GBK_NIHAO))).toBe('你好世界')
        })

        it('decodeText keeps plain ascii and utf-16 files readable', () => {
            expect(decodeText(Buffer.from('hello'))).toBe('hello')
            expect(decodeText(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('你好', 'utf16le')]))).toBe('你好')
        })
    })

    describe('what has no text', () => {
        it('refuses an old .doc and suggests docx', async () => {
            await expect(extractResourceText(store('合同模板', '.doc', 'x'))).rejects.toThrow(/合同模板.*不支持提取文本.*docx/)
        })

        it('refuses an old .ppt and suggests pptx', async () => {
            await expect(extractResourceText(store('老方案', '.ppt', 'x'))).rejects.toThrow(/老方案.*pptx/)
        })

        it('refuses a zip', async () => {
            await expect(extractResourceText(store('素材包', '.zip', 'x'))).rejects.toThrow(/素材包.*\.zip.*不支持提取文本/)
        })

        it('refuses images and videos by their kind', async () => {
            await expect(extractResourceText(store('海报', '.png', 'x', 'image'))).rejects.toThrow(/海报.*是图片.*无法提取文本/)
            await expect(extractResourceText(store('开业视频', '.mp4', 'x', 'video'))).rejects.toThrow(/开业视频.*是视频.*无法提取文本/)
        })

        it('reports a pdf without any text, like a scan', async () => {
            await expect(extractResourceText(store('扫描件', '.pdf', pdf('')))).rejects.toThrow(/扫描件.*没有可提取的文字.*文字识别/)
        })

        it('reports an empty text file', async () => {
            await expect(extractResourceText(store('空文件', '.txt', '  \n '))).rejects.toThrow(/空文件.*没有可提取的文字/)
        })

        it('names the resource when the file cannot be parsed', async () => {
            await expect(extractResourceText(store('坏文档', '.docx', 'not a zip'))).rejects.toThrow(/坏文档.*无法读取文本/)
        })

        it('reports a file that is gone', async () => {
            const file = store('手册', '.txt', 'x')
            fs.rmSync(file.path)
            await expect(extractResourceText(file)).rejects.toThrow(/手册.*文件已丢失/)
        })
    })

    describe('limit', () => {
        it('keeps the first characters and says how long the text was', async () => {
            const text = await extractResourceText(store('长文档', '.txt', 'a'.repeat(120000)), 50000)
            expect(text.startsWith('a'.repeat(50000) + '\n')).toBe(true)
            expect(text).toContain('[内容已截断,原文共 120000 个字符]')
        })

        it('adds no note when the text fits', async () => {
            expect(await extractResourceText(store('短文档', '.txt', 'hello'), 50000)).toBe('hello')
        })

        it('reads the limit from RESOURCE_TEXT_MAX_CHARS, 50000 by default', () => {
            expect(getResourceTextMaxChars({})).toBe(50000)
            expect(getResourceTextMaxChars({ RESOURCE_TEXT_MAX_CHARS: '1200' } as any)).toBe(1200)
            expect(getResourceTextMaxChars({ RESOURCE_TEXT_MAX_CHARS: 'abc' } as any)).toBe(50000)
            expect(getResourceTextMaxChars({ RESOURCE_TEXT_MAX_CHARS: '-5' } as any)).toBe(50000)
        })
    })

    describe('cache', () => {
        it('serves the same file again without parsing it, until the file is replaced', async () => {
            const file = store('手册', '.txt', 'first version')
            expect(await extractResourceText(file)).toBe('first version')
            const spy = jest.spyOn(fs.promises, 'readFile')
            expect(await extractResourceText(file)).toBe('first version')
            expect(spy).not.toHaveBeenCalled()
            spy.mockRestore()

            // a replacement of another size is a different entry
            fs.writeFileSync(file.path, 'second version, longer')
            expect(await extractResourceText(file)).toBe('second version, longer')
        })

        it('does not return a text cut for another limit', async () => {
            const file = store('长文档', '.txt', 'b'.repeat(100))
            expect(await extractResourceText(file, 10)).toContain('[内容已截断')
            expect(await extractResourceText(file, 1000)).toBe('b'.repeat(100))
        })
    })
})
