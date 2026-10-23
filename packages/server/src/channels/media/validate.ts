import path from 'path'
import { canExtractText } from 'wxflow-components'
import { IReactFlowNode } from '../../Interface'
import { MediaError, resourceNotReadable, resourceOnly } from './errors'
import { MediaContext, MediaResolver } from './resolver'

type ResourceKind = 'image' | 'video' | 'file'

/** A parameter of a node that points at a file or at a resource of the library */
interface MediaParam {
    /** The values to check, from the inputs of the node */
    values: (inputs: Record<string, any>) => unknown[]
    /** Kinds of library resource the node accepts (any when absent) */
    kinds?: ResourceKind[]
    /** Only `res://` references are accepted (no URL, no local path) */
    resourceOnly?: boolean
    /** Files among the resources must have text that can be extracted (LLM and Agent attachments) */
    textFiles?: boolean
    /** What the node does with the resource, for the message about a wrong kind */
    usage?: string
}

/** The values of the rows of an array parameter, such as the attached resources of a model node */
const rowValues =
    (param: string, field = 'resource') =>
    (inputs: Record<string, any>): unknown[] =>
        Array.isArray(inputs[param]) ? inputs[param].map((row: any) => row?.[field]) : []

/** Nodes whose parameters point at a file or at a resource of the library, and what each one accepts */
export const MEDIA_NODE_PARAMS: Record<string, MediaParam> = {
    wechatSendImageAgentflow: { values: (i) => [i.wechatMedia], kinds: ['image'] },
    wechatSendFileAgentflow: { values: (i) => [i.wechatMedia] },
    wechatSendVideoAgentflow: { values: (i) => [i.wechatMedia], kinds: ['video'] },
    loadResourceAgentflow: { values: (i) => [i.loadResourceRef], resourceOnly: true, usage: '使用' },
    llmAgentflow: { values: rowValues('llmResources'), kinds: ['image', 'file'], resourceOnly: true, textFiles: true, usage: '使用' },
    agentAgentflow: { values: rowValues('agentResources'), kinds: ['image', 'file'], resourceOnly: true, textFiles: true, usage: '使用' }
}
export const MEDIA_NODE_NAMES = new Set(Object.keys(MEDIA_NODE_PARAMS))

export interface MediaWarning {
    id: string
    label: string
    name: string
    issues: string[]
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp']

/**
 * Check the fixed media parameters of a flow: a local path whose file does not exist (or a value that is neither a
 * URL nor a full path) yields a warning that names what to check, and so does a library resource that is gone, of the
 * wrong kind or (for attachments of a model) without text. Parameters that only take library resources also warn about
 * paths and URLs. Values with variables and URLs are not checked (they are only known at run time), and nothing is ever
 * downloaded here.
 */
export const findMediaWarnings = async (nodes: IReactFlowNode[], resolver: MediaResolver, ctx: MediaContext): Promise<MediaWarning[]> => {
    const warnings: MediaWarning[] = []
    for (const node of nodes) {
        const spec = MEDIA_NODE_PARAMS[node.data?.name]
        if (!spec) continue
        const issues: string[] = []
        for (const raw of spec.values(node.data.inputs ?? {})) {
            const value = typeof raw === 'string' ? raw.trim() : ''
            if (!value || value.includes('{{')) continue
            if (spec.resourceOnly) {
                if (!value.startsWith('res://')) {
                    issues.push(resourceOnly(value).message)
                    continue
                }
            } else if (/^https?:\/\//i.test(value)) {
                continue
            }
            try {
                const media = await resolver.resolve(value, { ...ctx, resourceKinds: spec.kinds, resourceUsage: spec.usage })
                // the stored file keeps the extension of the resource: an image is read as one, any other file as a document
                const ext = path.extname(media.path).toLowerCase()
                if (spec.textFiles && !IMAGE_EXTENSIONS.includes(ext) && !canExtractText(ext))
                    issues.push(resourceNotReadable(value, ext).message)
            } catch (e) {
                if (e instanceof MediaError) issues.push(e.message)
                // anything else (a custom source failing for its own reasons) is not a file-missing problem
            }
        }
        if (issues.length) warnings.push({ id: node.id, label: node.data.label, name: node.data.name, issues })
    }
    return warnings
}
