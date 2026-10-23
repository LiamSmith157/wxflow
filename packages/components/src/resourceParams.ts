// Resource selection shared by the nodes that take a resource of the library: the parameter (a dropdown that also accepts
// typed values) and the load methods that fill it. A pick is stored as `res://id/<id>`, so renaming the resource later does
// not break the flow; `res://name/<name>` can be typed, with variables.
import { DataSource } from 'typeorm'
import { ICommonObject, IDatabaseEntity, INodeData, INodeOptionsValue, INodeParams, ResourceKind } from './Interface'
import { canExtractText } from './resourceFormats'

export const resourceParam = (label: string, name: string, description: string, loadMethod: string): INodeParams => ({
    label,
    name,
    type: 'asyncOptions',
    loadMethod,
    freeSolo: true,
    description,
    acceptVariable: true
})

/** The media parameter of the WeChat send nodes: a resource, an http(s) URL or the full path of a local file */
export const mediaParam = (label: string, description: string, loadMethod: string): INodeParams =>
    resourceParam(label, 'wechatMedia', description, loadMethod)

const UNGROUPED = 'Ungrouped'

const listResourcesWhere =
    (accept: (resource: { kind: ResourceKind; ext: string }) => boolean) =>
    async (_: INodeData, options: ICommonObject = {}): Promise<INodeOptionsValue[]> => {
        const appDataSource = options.appDataSource as DataSource
        const databaseEntities = options.databaseEntities as IDatabaseEntity
        // the server sets the workspace in the search options from the signed-in user
        if (!appDataSource || !databaseEntities?.['Resource']) return []
        const resources = await appDataSource.getRepository(databaseEntities['Resource']).findBy({ ...(options.searchOptions || {}) })
        return resources
            .filter((r: any) => accept(r))
            .map((r: any) => ({
                label: r.name,
                name: `res://id/${r.id}`,
                description: r.groupName || undefined,
                group: r.groupName || UNGROUPED,
                resource: {
                    id: r.id,
                    kind: r.kind,
                    ext: r.ext,
                    updatedDate: r.updatedDate ? new Date(r.updatedDate).toISOString() : undefined
                }
            }))
            .sort((a: INodeOptionsValue, b: INodeOptionsValue) => {
                // grouped resources first, in group order; the ungrouped ones last
                const rank = (o: INodeOptionsValue) => (o.group === UNGROUPED ? 1 : 0)
                return rank(a) - rank(b) || (a.group ?? '').localeCompare(b.group ?? '') || a.label.localeCompare(b.label)
            })
    }

const listResources = (kinds?: ResourceKind[]) => listResourcesWhere((r) => !kinds || kinds.includes(r.kind))

export const listImageResources = listResources(['image'])
export const listVideoResources = listResources(['video'])
export const listAllResources = listResources()

/** What a model call can take along: images, and the documents whose text can be extracted (no videos, zips or old .doc files) */
export const listAttachableResources = listResourcesWhere((r) => r.kind === 'image' || (r.kind === 'file' && canExtractText(r.ext)))
