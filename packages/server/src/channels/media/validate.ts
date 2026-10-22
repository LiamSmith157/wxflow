import { IReactFlowNode } from '../../Interface'
import { MediaError } from './errors'
import { MediaContext, MediaResolver } from './resolver'

/** Nodes whose `wechatMedia` parameter points at a file */
export const MEDIA_NODE_NAMES = new Set(['wechatSendImageAgentflow', 'wechatSendFileAgentflow', 'wechatSendVideoAgentflow'])

export interface MediaWarning {
    id: string
    label: string
    name: string
    issues: string[]
}

/**
 * Check the fixed media parameters of a flow: a path that does not exist in the exchange directory yields a
 * warning that names the Windows folder to check. Values with variables and URLs are not checked (they are only
 * known at run time), and nothing is ever downloaded here.
 */
export const findMediaWarnings = async (nodes: IReactFlowNode[], resolver: MediaResolver, ctx: MediaContext): Promise<MediaWarning[]> => {
    const warnings: MediaWarning[] = []
    for (const node of nodes) {
        if (!MEDIA_NODE_NAMES.has(node.data?.name)) continue
        const raw = node.data.inputs?.wechatMedia
        const value = typeof raw === 'string' ? raw.trim() : ''
        if (!value || value.includes('{{') || /^https?:\/\//i.test(value)) continue
        try {
            await resolver.resolve(value, ctx)
        } catch (e) {
            if (e instanceof MediaError) warnings.push({ id: node.id, label: node.data.label, name: node.data.name, issues: [e.message] })
            // anything else (a custom source failing for its own reasons) is not a file-missing problem
        }
    }
    return warnings
}
