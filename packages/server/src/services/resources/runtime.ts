import { IResourceFile, IResourceRuntime, ResourceKind } from 'wxflow-components'
import { resourceOnly } from '../../channels/media/errors'
import { RESOURCE_ID_PREFIX, RESOURCE_NAME_PREFIX, ResourceLookup, findResource } from '../../channels/media/resourceSource'

/** What the runtime needs from the resource service */
export type ResourceRuntimeLookup = ResourceLookup

/** The resource handle for one run of a flow in a workspace */
export const createResourceRuntime = (lookup: ResourceRuntimeLookup, workspaceId: string): IResourceRuntime => ({
    workspaceId,
    async load(ref: string, options?: { kinds?: ResourceKind[] }): Promise<IResourceFile> {
        const value = typeof ref === 'string' ? ref.trim() : ''
        if (!value.startsWith(RESOURCE_ID_PREFIX) && !value.startsWith(RESOURCE_NAME_PREFIX)) throw resourceOnly(value)
        const r = await findResource(lookup, value, workspaceId, options?.kinds, '使用')
        return {
            id: r.id,
            name: r.name,
            groupName: r.groupName ?? null,
            kind: r.kind as ResourceKind,
            mimeType: r.mimeType ?? '',
            ext: r.ext,
            size: r.size ?? 0,
            path: lookup.pathOf(r),
            ref: `${RESOURCE_ID_PREFIX}${r.id}`
        }
    }
})
