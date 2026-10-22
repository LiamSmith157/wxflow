import { randomUUID } from 'crypto'
import fs from 'fs'
import { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import multer from 'multer'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import resourcesService, { Actor, ListFilter, UploadedFile } from '../../services/resources'
import { getResourceConfig } from '../../services/resources/config'
import { uploadDir, removeQuiet } from '../../services/resources/store'

const getActor = (req: Request): Actor => {
    const workspaceId = req.user?.activeWorkspaceId
    if (!workspaceId) throw new InternalFlowiseError(StatusCodes.NOT_FOUND, 'Error: resources - active workspace not found!')
    return { workspaceId }
}

/** multer reads the file name of a multipart upload as latin1 unless told otherwise; repair names that were decoded that way */
export const decodeFileName = (name: string): string => {
    if (/[^\u0000-ÿ]/.test(name)) return name
    const converted = Buffer.from(name, 'latin1').toString('utf8')
    return converted.includes('�') ? name : converted
}

/** Accept one file in the field `file`, written to the resource upload folder; refuses files over the size limit while receiving */
export const receiveFile = (req: Request, res: Response, next: NextFunction) => {
    const { root, maxBytes } = getResourceConfig()
    fs.mkdirSync(uploadDir(root), { recursive: true })
    const upload = multer({
        storage: multer.diskStorage({ destination: uploadDir(root), filename: (_req, _file, cb) => cb(null, randomUUID()) }),
        limits: { fileSize: maxBytes, files: 1 }
    }).single('file')
    upload(req, res, (error: unknown) => {
        if (!error) return next()
        const code = (error as { code?: string }).code
        if (code === 'LIMIT_FILE_SIZE') {
            return next(new InternalFlowiseError(StatusCodes.REQUEST_TOO_LONG, `文件超过大小上限 ${Math.round(maxBytes / 1024 / 1024)}MB`))
        }
        next(new InternalFlowiseError(StatusCodes.BAD_REQUEST, `上传失败: ${(error as Error).message}`))
    })
}

const uploadedFile = (req: Request): UploadedFile => {
    const file = req.file
    if (!file) throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Error: resources - file required!')
    return { path: file.path, originalName: decodeFileName(file.originalname) }
}

const KINDS = new Set(['image', 'video', 'file'])

const parseFilter = (req: Request): ListFilter => {
    const filter: ListFilter = {}
    const { kind, groupName, ungrouped, search } = req.query
    if (typeof kind === 'string' && KINDS.has(kind)) filter.kind = kind as ListFilter['kind']
    if (typeof groupName === 'string' && groupName) filter.groupName = groupName
    if (ungrouped === '1' || ungrouped === 'true') filter.ungrouped = true
    if (typeof search === 'string' && search.trim()) filter.search = search
    return filter
}

const list = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return res.json(await resourcesService.list(getActor(req), parseFilter(req)))
    } catch (error) {
        next(error)
    }
}

const create = async (req: Request, res: Response, next: NextFunction) => {
    let file: UploadedFile | undefined
    try {
        const actor = getActor(req)
        file = uploadedFile(req)
        const created = await resourcesService.create(actor, file, { name: req.body?.name, groupName: req.body?.groupName })
        return res.status(StatusCodes.CREATED).json(created)
    } catch (error) {
        if (file) await removeQuiet(file.path)
        else if (req.file) await removeQuiet(req.file.path)
        next(error)
    }
}

const update = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const body = req.body ?? {}
        const patch: { name?: unknown; groupName?: unknown } = {}
        if ('name' in body) patch.name = body.name
        if ('groupName' in body) patch.groupName = body.groupName
        return res.json(await resourcesService.update(getActor(req), req.params.id, patch))
    } catch (error) {
        next(error)
    }
}

const replaceFile = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const actor = getActor(req)
        return res.json(await resourcesService.replaceFile(actor, req.params.id, uploadedFile(req)))
    } catch (error) {
        if (req.file) await removeQuiet(req.file.path)
        next(error)
    }
}

const remove = async (req: Request, res: Response, next: NextFunction) => {
    try {
        await resourcesService.remove(getActor(req), req.params.id)
        return res.status(StatusCodes.NO_CONTENT).end()
    } catch (error) {
        next(error)
    }
}

const usages = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const byNameOnly = req.query.byName === '1' || req.query.byName === 'true'
        return res.json(await resourcesService.usages(getActor(req), req.params.id, { byNameOnly }))
    } catch (error) {
        next(error)
    }
}

/** Images and videos are shown inline; everything else, and any request with ?download=1, is sent as an attachment */
const sendFile = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const actor = getActor(req)
        const resource = await resourcesService.get(actor, req.params.id)
        const file = resourcesService.pathOf({ workspaceId: actor.workspaceId, id: resource.id, ext: resource.ext })
        if (!fs.existsSync(file)) throw new InternalFlowiseError(StatusCodes.NOT_FOUND, '资源文件不存在,请重新上传')
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('Cache-Control', 'private, no-cache')
        const download = req.query.download === '1' || req.query.download === 'true' || resource.kind === 'file'
        if (download) {
            return res.download(file, resource.originalName, { headers: { 'Content-Type': resource.mimeType } })
        }
        return res.type(resource.mimeType).sendFile(file)
    } catch (error) {
        next(error)
    }
}

export default { list, create, update, replaceFile, remove, usages, sendFile, receiveFile }
