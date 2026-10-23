// Resources attached to a model call (LLM and Agent nodes): images go to the model as image input, documents as text. The
// message built here exists for this one call only; callers drop it before the messages are stored or returned.
import fs from 'fs'
import { ICommonObject, INodeParams, IResourceFile, IResourceRuntime } from '../../src/Interface'
import { resourceParam } from '../../src/resourceParams'
import { extractResourceText } from '../../src/resourceText'
import { IChatMessage } from './Interface.Agentflow'

const RESOURCE_ROW = 'resource'

/**
 * The "attach resources" parameter of a model node. The array itself is marked acceptVariable: variables are only replaced
 * in parameters marked at the top level, not in the fields of their rows.
 */
export const attachResourcesParam = (label: string, name: string): INodeParams => ({
    label,
    name,
    description:
        'Resources of the resource library to take along in this call: images are shown to the model (the model needs image input turned on), documents (pdf, docx, xlsx, xls, pptx, txt) are given as text. A big document is cut at the character limit; use a Document Store to search big documents instead',
    type: 'array',
    optional: true,
    acceptVariable: true,
    array: [
        resourceParam(
            'Resource',
            RESOURCE_ROW,
            'Pick a resource from the resource library, or enter res://name/<resource name> (the name may contain variables). Only resources of the library can be attached, not file paths or URLs',
            'listAttachableResources'
        )
    ]
})

export interface IResourceAttachments {
    /** The message for the model call, marked temporary */
    message: IChatMessage
    /** What was attached, for the execution record (no content) */
    resources: Array<{ name: string; kind: string }>
}

const refsOf = (rows: unknown): string[] => {
    if (!Array.isArray(rows)) return []
    return rows
        .map((row) => (row && typeof row === 'object' ? (row as ICommonObject)[RESOURCE_ROW] : undefined))
        .map((ref) => (typeof ref === 'string' ? ref.trim() : ''))
        .filter(Boolean)
}

const imageContent = async (resource: IResourceFile) => {
    const data = await fs.promises.readFile(resource.path)
    return { type: 'image_url', image_url: { url: `data:${resource.mimeType || 'image/png'};base64,${data.toString('base64')}` } }
}

/**
 * Load the attached resources of a node. Returns undefined when there are none. Fails, naming the resource, when a resource
 * is a video, is not in the library, has no text, or is an image while the model does not take images.
 */
export const buildResourceAttachments = async (
    rows: unknown,
    options: ICommonObject,
    modelConfig: ICommonObject | undefined
): Promise<IResourceAttachments | undefined> => {
    const refs = refsOf(rows)
    if (refs.length === 0) return undefined
    const runtime = options.resources as IResourceRuntime | undefined
    if (!runtime) throw new Error('资源库不可用:当前运行环境没有提供资源支持')

    const content: ICommonObject[] = []
    const resources: IResourceAttachments['resources'] = []
    for (const ref of refs) {
        const resource = await runtime.load(ref, { kinds: ['image', 'file'] })
        if (resource.kind === 'image') {
            if (!modelConfig?.allowImageUploads) {
                throw new Error(`资源 \`${resource.name}\` 是图片,所选模型没有开启图片输入,请在模型设置中开启 Allow Image Uploads`)
            }
            content.push(await imageContent(resource))
        } else {
            const text = await extractResourceText(resource)
            content.push({ type: 'text', text: `以下是资源《${resource.name}》的内容:\n\n${text}` })
        }
        resources.push({ name: resource.name, kind: resource.kind })
    }
    return { message: { role: 'user', content: content as any, _isTemporaryResourceMessage: true }, resources }
}

/** Put the attachment before the last user message, so that the question comes after what it is about */
export const insertResourceAttachments = (messages: any[], attachments: IResourceAttachments | undefined): void => {
    if (!attachments) return
    for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i] as ICommonObject
        if (m && !Array.isArray(m) && typeof m === 'object' && m.role === 'user') {
            messages.splice(i, 0, attachments.message)
            return
        }
    }
    messages.push(attachments.message)
}

/** Messages as they may be stored or shown in the execution: without what was attached for the call */
export const withoutResourceAttachments = <T>(messages: T[]): T[] => messages.filter((m: any) => !m?._isTemporaryResourceMessage)
