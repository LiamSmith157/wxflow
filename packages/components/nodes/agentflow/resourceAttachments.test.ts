import fs from 'fs'
import os from 'os'
import path from 'path'
import { IResourceFile, IResourceRuntime } from '../../src/Interface'
import { clearResourceTextCache } from '../../src/resourceText'
import {
    attachResourcesParam,
    buildResourceAttachments,
    insertResourceAttachments,
    withoutResourceAttachments
} from './resourceAttachments'

let dir: string
let library: IResourceFile[]

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])

const add = (over: Partial<IResourceFile> & { name: string; ext: string }, content: string | Buffer = 'x'): IResourceFile => {
    const id = `id-${library.length + 1}`
    const file = path.join(dir, `${id}${over.ext}`)
    fs.writeFileSync(file, content)
    const resource: IResourceFile = {
        id,
        groupName: null,
        kind: 'file',
        mimeType: 'text/plain',
        size: Buffer.byteLength(content),
        path: file,
        ref: `res://id/${id}`,
        ...over
    }
    library.push(resource)
    return resource
}

/** Resolves like the server runtime: library references only, and only the kinds asked for */
const runtime: IResourceRuntime = {
    workspaceId: 'wsA',
    async load(ref, options) {
        if (!ref.startsWith('res://')) throw new Error(`\`${ref}\` 不是资源库中的资源:这里只能使用资源库中的资源`)
        const found = library.find((r) => r.ref === ref || `res://name/${r.name}` === ref)
        if (!found) throw new Error(`资源 \`${ref}\` 不存在`)
        if (options?.kinds && !options.kinds.includes(found.kind)) throw new Error(`资源 \`${found.name}\` 是${found.kind},不能使用`)
        return found
    }
}

const opts = (): any => ({ resources: runtime })
const rows = (...refs: string[]) => refs.map((resource) => ({ resource }))
const IMAGES_ON = { allowImageUploads: true }

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wxflow-attach-'))
    library = []
    clearResourceTextCache()
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('attachResourcesParam', () => {
    const param = attachResourcesParam('Attach Resources', 'llmResources')

    it('is an optional array marked acceptVariable itself, because variables are only replaced at the top level', () => {
        expect(param).toMatchObject({ name: 'llmResources', type: 'array', optional: true, acceptVariable: true })
    })

    it('has one dropdown per row that lists images and readable documents and also takes typed values', () => {
        expect(param.array).toHaveLength(1)
        expect(param.array![0]).toMatchObject({
            name: 'resource',
            type: 'asyncOptions',
            loadMethod: 'listAttachableResources',
            freeSolo: true,
            acceptVariable: true
        })
    })
})

describe('buildResourceAttachments', () => {
    it('returns nothing when no resource is attached, and ignores rows left empty', async () => {
        expect(await buildResourceAttachments(undefined, opts(), IMAGES_ON)).toBeUndefined()
        expect(await buildResourceAttachments([], opts(), IMAGES_ON)).toBeUndefined()
        expect(await buildResourceAttachments([{ resource: '' }, { resource: '  ' }, {}], opts(), IMAGES_ON)).toBeUndefined()
    })

    it('gives an image to the model as image input', async () => {
        const r = add({ name: '海报-北京', ext: '.png', kind: 'image', mimeType: 'image/png' }, PNG)
        const out = await buildResourceAttachments(rows(r.ref), opts(), IMAGES_ON)
        expect(out?.message.role).toBe('user')
        expect(out?.message._isTemporaryResourceMessage).toBe(true)
        expect(out?.message.content).toEqual([{ type: 'image_url', image_url: { url: `data:image/png;base64,${PNG.toString('base64')}` } }])
        expect(out?.resources).toEqual([{ name: '海报-北京', kind: 'image' }])
    })

    it('gives a document as text that says which resource it is', async () => {
        const r = add({ name: '产品手册', ext: '.txt' }, '保修期二十四个月')
        const out = await buildResourceAttachments(rows(r.ref), opts(), {})
        expect(out?.message.content).toEqual([{ type: 'text', text: '以下是资源《产品手册》的内容:\n\n保修期二十四个月' }])
        expect(out?.resources).toEqual([{ name: '产品手册', kind: 'file' }])
    })

    it('keeps the order of the rows when images and documents are mixed', async () => {
        const doc = add({ name: '产品手册', ext: '.txt' }, '手册内容')
        const img = add({ name: '海报-北京', ext: '.png', kind: 'image', mimeType: 'image/png' }, PNG)
        const out = await buildResourceAttachments(rows(img.ref, 'res://name/产品手册'), opts(), IMAGES_ON)
        expect((out?.message.content as any[]).map((c) => c.type)).toEqual(['image_url', 'text'])
        expect(out?.resources.map((r) => r.name)).toEqual(['海报-北京', doc.name])
    })

    it('fails when the model does not take images, telling how to turn them on', async () => {
        const r = add({ name: '海报-北京', ext: '.png', kind: 'image', mimeType: 'image/png' }, PNG)
        await expect(buildResourceAttachments(rows(r.ref), opts(), { allowImageUploads: false })).rejects.toThrow(
            /海报-北京.*没有开启图片输入.*Allow Image Uploads/
        )
        await expect(buildResourceAttachments(rows(r.ref), opts(), undefined)).rejects.toThrow(/没有开启图片输入/)
    })

    it('fails for a document without readable text, naming the resource', async () => {
        const zipped = add({ name: '素材包', ext: '.zip' })
        await expect(buildResourceAttachments(rows(zipped.ref), opts(), IMAGES_ON)).rejects.toThrow(/素材包.*\.zip.*不支持提取文本/)
        const old = add({ name: '合同模板', ext: '.doc' })
        await expect(buildResourceAttachments(rows(old.ref), opts(), IMAGES_ON)).rejects.toThrow(/合同模板.*docx/)
    })

    it('fails for a video, which cannot be attached', async () => {
        const v = add({ name: '开业视频', ext: '.mp4', kind: 'video' })
        await expect(buildResourceAttachments(rows(v.ref), opts(), IMAGES_ON)).rejects.toThrow(/开业视频.*video/)
    })

    it('fails for a file path or a URL, because only library resources can be attached', async () => {
        await expect(buildResourceAttachments(rows('C:\\data\\a.pdf'), opts(), IMAGES_ON)).rejects.toThrow(/只能使用资源库中的资源/)
        await expect(buildResourceAttachments(rows('https://example.com/a.pdf'), opts(), IMAGES_ON)).rejects.toThrow(
            /只能使用资源库中的资源/
        )
    })

    it('fails when the run has no resource library', async () => {
        await expect(buildResourceAttachments(rows('res://id/x'), {}, IMAGES_ON)).rejects.toThrow('资源库不可用')
    })

    it('reads the file again on each call, so a replaced file is used next time', async () => {
        const r = add({ name: '产品手册', ext: '.txt' }, 'old text')
        const first = await buildResourceAttachments(rows(r.ref), opts(), {})
        expect((first?.message.content as any[])[0].text).toContain('old text')
        fs.writeFileSync(r.path, 'a newer and longer text')
        const second = await buildResourceAttachments(rows(r.ref), opts(), {})
        expect((second?.message.content as any[])[0].text).toContain('a newer and longer text')
    })
})

describe('insertResourceAttachments', () => {
    const attachments = { message: { role: 'user', content: 'attached', _isTemporaryResourceMessage: true }, resources: [] }

    it('puts the attachment before the last user message', () => {
        const messages: any[] = [
            { role: 'system', content: 's' },
            { role: 'user', content: 'first' },
            { role: 'assistant', content: 'a' },
            { role: 'user', content: 'question' }
        ]
        insertResourceAttachments(messages, attachments)
        expect(messages.map((m) => m.content)).toEqual(['s', 'first', 'a', 'attached', 'question'])
    })

    it('appends it when there is no user message', () => {
        const messages: any[] = [{ role: 'system', content: 's' }]
        insertResourceAttachments(messages, attachments)
        expect(messages.map((m) => m.content)).toEqual(['s', 'attached'])
    })

    it('changes nothing when nothing is attached', () => {
        const messages: any[] = [{ role: 'user', content: 'question' }]
        insertResourceAttachments(messages, undefined)
        expect(messages).toEqual([{ role: 'user', content: 'question' }])
    })
})

describe('withoutResourceAttachments', () => {
    it('drops the attachment and keeps the other messages as they are', () => {
        const keep = [
            { role: 'user', content: 'question' },
            { role: 'assistant', content: 'answer' }
        ]
        expect(
            withoutResourceAttachments([keep[0], { role: 'user', content: 'attached', _isTemporaryResourceMessage: true }, keep[1]])
        ).toEqual(keep)
    })
})
