import { randomUUID } from 'crypto'
import fs from 'fs'
import path from 'path'
import { StatusCodes } from 'http-status-codes'
import { ChatFlow } from '../../database/entities/ChatFlow'
import { Resource, ResourceKind } from '../../database/entities/Resource'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import { ResourceConfig } from './config'
import { ALLOWED_TYPES_HINT, DetectedType, SNIFF_BYTES, detectFileType } from './fileType'
import { normalizeGroup, normalizeName, toNameKey } from './naming'
import { isBusyError, moveFile, readHead, removeQuiet, storedPath } from './store'
import { FlowUsage, computeUsages } from './usages'

/** The slice of TypeORM's DataSource this service needs, so tests can run on an in-memory fake */
export interface ResourceDataSource {
    getRepository(entity: any): any
}

export interface Actor {
    workspaceId: string
}

/** A file that multer already wrote to disk */
export interface UploadedFile {
    path: string
    originalName: string
}

export interface ResourceView {
    id: string
    name: string
    groupName: string | null
    kind: ResourceKind
    mimeType: string
    ext: string
    size: number
    originalName: string
    createdDate: Date
    updatedDate: Date
    /** Flows that point at this resource by id or by a fixed name */
    usageCount?: number
}

export interface ListFilter {
    kind?: ResourceKind
    groupName?: string
    /** Only resources without a group */
    ungrouped?: boolean
    /** Case-insensitive part of the name */
    search?: string
}

const err = (status: number, message: string) => new InternalFlowiseError(status, message)

const KIND_LABEL: Record<ResourceKind, string> = { image: '图片', video: '视频', file: '文件' }

export const createResourceService = (deps: { getDataSource: () => ResourceDataSource; config: () => ResourceConfig }) => {
    const repo = () => deps.getDataSource().getRepository(Resource)
    const flows = () => deps.getDataSource().getRepository(ChatFlow)

    const toView = (r: Resource, usageCount?: number): ResourceView => ({
        id: r.id,
        name: r.name,
        groupName: r.groupName ?? null,
        kind: r.kind,
        mimeType: r.mimeType,
        ext: r.ext,
        size: r.size,
        originalName: r.originalName,
        createdDate: r.createdDate,
        updatedDate: r.updatedDate,
        ...(usageCount === undefined ? {} : { usageCount })
    })

    const pathOf = (r: Pick<Resource, 'workspaceId' | 'id' | 'ext'>): string => storedPath(deps.config().root, r.workspaceId, r.id, r.ext)

    const findById = async (workspaceId: string, id: string): Promise<Resource | null> =>
        (await repo().findOne({ where: { id, workspaceId } })) ?? null

    const findByNameKey = async (workspaceId: string, nameKey: string): Promise<Resource | null> =>
        (await repo().findOne({ where: { workspaceId, nameKey } })) ?? null

    const getOrThrow = async (actor: Actor, id: string): Promise<Resource> => {
        const found = await findById(actor.workspaceId, id)
        if (!found) throw err(StatusCodes.NOT_FOUND, '资源不存在,可能已被删除')
        return found
    }

    const assertNameFree = async (workspaceId: string, nameKey: string, exceptId?: string): Promise<void> => {
        const clash = await findByNameKey(workspaceId, nameKey)
        if (clash && clash.id !== exceptId) throw err(StatusCodes.CONFLICT, `资源名称“${clash.name}”已被使用`)
    }

    /** Check size and type of an uploaded file; the caller removes the file when this throws */
    const inspect = async (file: UploadedFile): Promise<{ detected: DetectedType; size: number }> => {
        const { maxBytes } = deps.config()
        const size = (await fs.promises.stat(file.path)).size
        if (size === 0) throw err(StatusCodes.BAD_REQUEST, '文件是空的')
        if (size > maxBytes) {
            throw err(StatusCodes.REQUEST_TOO_LONG, `文件超过大小上限 ${Math.round(maxBytes / 1024 / 1024)}MB`)
        }
        const detected = detectFileType(await readHead(file.path, SNIFF_BYTES), file.originalName)
        if (!detected) throw err(StatusCodes.UNSUPPORTED_MEDIA_TYPE, `不支持这种文件类型,允许的类型:${ALLOWED_TYPES_HINT}`)
        return { detected, size }
    }

    /** Put a checked file in place. A file that is held open by another program cannot be overwritten. */
    const place = async (from: string, to: string): Promise<void> => {
        try {
            await moveFile(from, to)
        } catch (e) {
            if (isBusyError(e)) throw err(StatusCodes.CONFLICT, '文件正在被使用,请稍后重试')
            throw e
        }
    }

    const create = async (actor: Actor, file: UploadedFile, input: { name?: unknown; groupName?: unknown } = {}): Promise<ResourceView> => {
        try {
            const fallbackName = path.parse(file.originalName).name
            const { name, nameKey } = normalizeName(typeof input.name === 'string' && input.name.trim() ? input.name : fallbackName)
            const groupName = normalizeGroup(input.groupName)
            await assertNameFree(actor.workspaceId, nameKey)
            const { detected, size } = await inspect(file)

            const id = randomUUID()
            const dest = storedPath(deps.config().root, actor.workspaceId, id, detected.ext)
            await place(file.path, dest)
            try {
                const saved = await repo().save(
                    repo().create({
                        id,
                        workspaceId: actor.workspaceId,
                        name,
                        nameKey,
                        groupName,
                        kind: detected.kind,
                        mimeType: detected.mimeType,
                        ext: detected.ext,
                        size,
                        originalName: path.basename(file.originalName).slice(0, 255)
                    })
                )
                return toView(saved)
            } catch (e) {
                await removeQuiet(dest)
                throw e
            }
        } finally {
            await removeQuiet(file.path)
        }
    }

    const flowsOf = async (workspaceId: string): Promise<Array<{ id: string; name: string; flowData?: string }>> =>
        (await flows().find({ where: { workspaceId } })) as Array<{ id: string; name: string; flowData?: string }>

    const list = async (actor: Actor, filter: ListFilter = {}): Promise<ResourceView[]> => {
        const all: Resource[] = await repo().find({ where: { workspaceId: actor.workspaceId } })
        const search = filter.search?.trim().toLowerCase()
        const rows = all.filter(
            (r) =>
                (!filter.kind || r.kind === filter.kind) &&
                (!filter.ungrouped || !r.groupName) &&
                (!filter.groupName || r.groupName === filter.groupName) &&
                (!search || r.nameKey.includes(search))
        )
        const usages = computeUsages(
            rows.map((r) => ({ id: r.id, nameKey: r.nameKey })),
            await flowsOf(actor.workspaceId)
        )
        return rows
            .sort((a, b) => (a.groupName ?? '').localeCompare(b.groupName ?? '') || a.name.localeCompare(b.name))
            .map((r) => toView(r, usages.get(r.id)?.length ?? 0))
    }

    const get = async (actor: Actor, id: string): Promise<ResourceView> => toView(await getOrThrow(actor, id))

    const update = async (actor: Actor, id: string, patch: { name?: unknown; groupName?: unknown }): Promise<ResourceView> => {
        const resource = await getOrThrow(actor, id)
        if (patch.name !== undefined) {
            const { name, nameKey } = normalizeName(patch.name)
            if (nameKey !== resource.nameKey) await assertNameFree(actor.workspaceId, nameKey, resource.id)
            resource.name = name
            resource.nameKey = nameKey
        }
        if (patch.groupName !== undefined) resource.groupName = normalizeGroup(patch.groupName)
        return toView(await repo().save(resource))
    }

    const replaceFile = async (actor: Actor, id: string, file: UploadedFile): Promise<ResourceView> => {
        try {
            const resource = await getOrThrow(actor, id)
            const { detected, size } = await inspect(file)
            if (detected.kind !== resource.kind) {
                throw err(StatusCodes.BAD_REQUEST, `类型必须保持为${KIND_LABEL[resource.kind]},新文件是${KIND_LABEL[detected.kind]}`)
            }
            const oldPath = pathOf(resource)
            const newPath = storedPath(deps.config().root, resource.workspaceId, resource.id, detected.ext)
            await place(file.path, newPath)
            const extChanged = detected.ext !== resource.ext
            resource.mimeType = detected.mimeType
            resource.ext = detected.ext
            resource.size = size
            resource.originalName = path.basename(file.originalName).slice(0, 255)
            const saved = await repo().save(resource)
            if (extChanged) await removeQuiet(oldPath)
            return toView(saved)
        } finally {
            await removeQuiet(file.path)
        }
    }

    const remove = async (actor: Actor, id: string): Promise<void> => {
        const resource = await getOrThrow(actor, id)
        try {
            await fs.promises.rm(pathOf(resource), { force: true })
        } catch (e) {
            if (isBusyError(e)) throw err(StatusCodes.CONFLICT, '文件正在被使用,请稍后重试')
            throw e
        }
        await repo().remove(resource)
    }

    /** Flows that use a resource; `byNameOnly` keeps those whose reference breaks when the resource is renamed */
    const usages = async (actor: Actor, id: string, options: { byNameOnly?: boolean } = {}): Promise<FlowUsage[]> => {
        const resource = await getOrThrow(actor, id)
        const found =
            computeUsages([{ id: resource.id, nameKey: resource.nameKey }], await flowsOf(actor.workspaceId)).get(resource.id) ?? []
        return options.byNameOnly ? found.filter((u) => u.via !== 'id') : found
    }

    return { create, list, get, update, replaceFile, remove, usages, findById, findByNameKey, pathOf, toNameKey }
}

export type ResourceService = ReturnType<typeof createResourceService>
