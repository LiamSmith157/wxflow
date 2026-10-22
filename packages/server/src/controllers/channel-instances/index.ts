import { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { getChannelConfig } from '../../channels/config'
import { getChannelRegistry } from '../../channels/ChannelRegistry'
import { sendTestImage } from '../../channels/media/testImage'
import { getGatewayStatus } from '../../channels/wechat/gatewayService'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import channelInstancesService, { Actor } from '../../services/channel-instances'
import { channelSettingsService } from '../../services/channel'

const getActor = (req: Request): Actor => {
    const workspaceId = req.user?.activeWorkspaceId
    if (!workspaceId) throw new InternalFlowiseError(StatusCodes.NOT_FOUND, 'Error: channelInstances - active workspace not found!')
    const canManage = !!req.user?.isOrganizationAdmin || !!req.user?.permissions?.includes('channelInstances:manage')
    return { workspaceId, canManage }
}

const listInstances = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const channel = typeof req.query.channel === 'string' ? req.query.channel : undefined
        return res.json(await channelInstancesService.listInstances(getActor(req), channel))
    } catch (error) {
        next(error)
    }
}

const assignInstance = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const actor = getActor(req)
        if (!req.params.id)
            throw new InternalFlowiseError(StatusCodes.PRECONDITION_FAILED, 'Error: channelInstances.assign - id not provided!')
        if (!req.body || !('workspaceId' in req.body)) {
            throw new InternalFlowiseError(
                StatusCodes.PRECONDITION_FAILED,
                'Error: channelInstances.assign - workspaceId (or null) required!'
            )
        }
        const target = req.body.workspaceId
        if (target !== null && typeof target !== 'string') {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Error: channelInstances.assign - workspaceId must be a string or null')
        }
        return res.json(await channelInstancesService.assignInstance(req.params.id, target, actor))
    } catch (error) {
        next(error)
    }
}

const getStatus = async (_req: Request, res: Response, next: NextFunction) => {
    try {
        return res.json(getGatewayStatus())
    } catch (error) {
        next(error)
    }
}

const getSettings = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return res.json(await channelSettingsService.getSettings(getActor(req).workspaceId))
    } catch (error) {
        next(error)
    }
}

const updateSettings = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const actor = getActor(req)
        const body = req.body ?? {}
        // explicit allowlist: only these two fields are writable
        const patch: { masterEnabled?: boolean; sendRateLimitPerMinute?: number } = {}
        if (body.masterEnabled !== undefined) patch.masterEnabled = body.masterEnabled
        if (body.sendRateLimitPerMinute !== undefined) patch.sendRateLimitPerMinute = body.sendRateLimitPerMinute
        return res.json(await channelSettingsService.updateSettings(actor.workspaceId, patch))
    } catch (error) {
        next(error)
    }
}

const sendTest = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const actor = getActor(req)
        const to = typeof req.body?.to === 'string' ? req.body.to.trim() : ''
        if (!to)
            throw new InternalFlowiseError(StatusCodes.PRECONDITION_FAILED, 'Error: channelInstances.testImage - recipient (to) required!')
        const visible = await channelInstancesService.listInstances(actor)
        const instance = visible.find((i) => i.id === req.params.id)
        if (!instance) throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Channel instance ${req.params.id} not found`)
        if (!instance.online) throw new InternalFlowiseError(StatusCodes.CONFLICT, '实例离线,无法发送测试图片')
        const registry = getChannelRegistry()
        if (!registry.has(instance.channel)) throw new InternalFlowiseError(StatusCodes.SERVICE_UNAVAILABLE, '渠道网关未运行')
        const config = getChannelConfig()
        const result = await sendTestImage(
            registry.get(instance.channel),
            config.exchange,
            instance.instanceKey,
            to,
            config.sendWaitSeconds * 1000
        )
        return res.json(result)
    } catch (error) {
        next(error)
    }
}

export default { listInstances, assignInstance, getStatus, getSettings, updateSettings, sendTest }
