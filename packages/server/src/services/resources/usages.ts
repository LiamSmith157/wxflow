// Which flows use a resource. A reference is a media value that is exactly `res://id/<id>` or `res://name/<name>`;
// a name that contains a variable ("{{ ... }}") is only known at run time and cannot be counted.
import { toNameKey } from './naming'

export const ID_PREFIX = 'res://id/'
export const NAME_PREFIX = 'res://name/'

export interface FlowRefs {
    ids: Set<string>
    /** Lower-cased names, without variables */
    nameKeys: Set<string>
}

const collectStrings = (value: unknown, out: string[], depth = 0): void => {
    if (depth > 6) return
    if (typeof value === 'string') out.push(value)
    else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out, depth + 1))
    else if (value && typeof value === 'object')
        Object.values(value as Record<string, unknown>).forEach((v) => collectStrings(v, out, depth + 1))
}

/** Read the references out of a saved flow. Unparseable flow data counts as "no references". */
export const scanFlowRefs = (flowData: string | undefined | null): FlowRefs => {
    const refs: FlowRefs = { ids: new Set(), nameKeys: new Set() }
    let nodes: any[] = []
    try {
        nodes = JSON.parse(flowData ?? '{}')?.nodes ?? []
    } catch {
        return refs
    }
    const values: string[] = []
    for (const node of Array.isArray(nodes) ? nodes : []) collectStrings(node?.data?.inputs, values)
    for (const raw of values) {
        const value = raw.trim()
        if (value.startsWith(ID_PREFIX)) refs.ids.add(value.slice(ID_PREFIX.length))
        else if (value.startsWith(NAME_PREFIX)) {
            const name = value.slice(NAME_PREFIX.length)
            if (!name.includes('{{')) refs.nameKeys.add(toNameKey(name))
        }
    }
    return refs
}

export interface FlowUsage {
    id: string
    name: string
    /** How the flow points at the resource */
    via: 'id' | 'name' | 'both'
}

export interface ResourceKey {
    id: string
    nameKey: string
}

export interface FlowRecord {
    id: string
    name: string
    flowData?: string | null
}

/** Usages of several resources with one pass over the flows */
export const computeUsages = (resources: ResourceKey[], flows: FlowRecord[]): Map<string, FlowUsage[]> => {
    const result = new Map<string, FlowUsage[]>(resources.map((r) => [r.id, []]))
    for (const flow of flows) {
        const refs = scanFlowRefs(flow.flowData)
        if (refs.ids.size === 0 && refs.nameKeys.size === 0) continue
        for (const resource of resources) {
            const byId = refs.ids.has(resource.id)
            const byName = refs.nameKeys.has(resource.nameKey)
            if (byId || byName)
                result.get(resource.id)!.push({ id: flow.id, name: flow.name, via: byId && byName ? 'both' : byId ? 'id' : 'name' })
        }
    }
    return result
}
