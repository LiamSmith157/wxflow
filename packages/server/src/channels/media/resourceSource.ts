// `res://` media references: a file kept in the resource library of the workspace the flow runs in.
//   res://id/<id>      written by the selection control in the node, survives renaming the resource
//   res://name/<name>  typed by hand or built with a variable (the variable is already replaced when it gets here)
import fs from 'fs'
import { toNameKey } from '../../services/resources/naming'
import {
    resourceByIdMissing,
    resourceByNameMissing,
    resourceFileMissing,
    resourceNoWorkspace,
    resourceRefInvalid,
    resourceWrongKind
} from './errors'
import { MediaResolver, MediaSource } from './resolver'

export const RESOURCE_ID_PREFIX = 'res://id/'
export const RESOURCE_NAME_PREFIX = 'res://name/'

export interface ResourceRecord {
    id: string
    workspaceId: string
    name: string
    kind: string
    ext: string
}

/** What this source needs from the resource library; the resource service provides it */
export interface ResourceLookup {
    findById(workspaceId: string, id: string): Promise<ResourceRecord | null>
    findByNameKey(workspaceId: string, nameKey: string): Promise<ResourceRecord | null>
    pathOf(resource: ResourceRecord): string
}

export const createResourceSource = (lookup: ResourceLookup): MediaSource => ({
    name: 'resource',
    matches: (value) => value.startsWith('res://'),
    async resolve(value, ctx) {
        if (!ctx.workspaceId) throw resourceNoWorkspace()
        let resource: ResourceRecord | null
        if (value.startsWith(RESOURCE_ID_PREFIX)) {
            const id = value.slice(RESOURCE_ID_PREFIX.length).trim()
            resource = id ? await lookup.findById(ctx.workspaceId, id) : null
            if (!resource) throw resourceByIdMissing(id)
        } else if (value.startsWith(RESOURCE_NAME_PREFIX)) {
            const name = value.slice(RESOURCE_NAME_PREFIX.length).trim()
            if (!name) throw resourceRefInvalid(value)
            resource = await lookup.findByNameKey(ctx.workspaceId, toNameKey(name))
            if (!resource) throw resourceByNameMissing(name)
        } else {
            throw resourceRefInvalid(value)
        }

        if (ctx.resourceKinds && !ctx.resourceKinds.includes(resource.kind as never)) {
            throw resourceWrongKind(resource.name, resource.kind, ctx.resourceKinds)
        }
        const file = lookup.pathOf(resource)
        if (!fs.existsSync(file)) throw resourceFileMissing(resource.name)
        return { path: file, temporary: false }
    }
})

/** Make `res://` references usable wherever the resolver is used (send nodes and the save-time check) */
export const registerResourceSource = (resolver: MediaResolver, lookup: ResourceLookup): void => {
    resolver.register(createResourceSource(lookup))
}
