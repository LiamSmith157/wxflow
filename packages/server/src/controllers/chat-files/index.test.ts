import { Request, Response, NextFunction } from 'express'
import * as fs from 'fs'
import { StatusCodes } from 'http-status-codes'

const mockStreamStorageFile = jest.fn()

jest.mock('flowise-components', () => ({ streamStorageFile: (...args: unknown[]) => mockStreamStorageFile(...args) }))
jest.mock('../../utils/getRunningExpressApp', () => ({ getRunningExpressApp: jest.fn() }))

import chatFilesController from './index'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'

const mockGetRunningExpressApp = getRunningExpressApp as jest.Mock

const setup = (chatflow: unknown, workspace: unknown) => {
    const repositories: Record<string, unknown> = {
        ChatFlow: { findOneBy: jest.fn().mockResolvedValue(chatflow) },
        Workspace: { findOneBy: jest.fn().mockResolvedValue(workspace) }
    }
    mockGetRunningExpressApp.mockReturnValue({
        AppDataSource: { getRepository: (entity: { name: string }) => repositories[entity.name] }
    })
}

const makeReq = (body: Record<string, unknown>) => ({ body } as unknown as Request)
const makeRes = () => {
    const res: Record<string, jest.Mock> = {}
    res.setHeader = jest.fn()
    res.send = jest.fn()
    res.status = jest.fn().mockReturnValue(res)
    return res as unknown as Response & Record<string, jest.Mock>
}
const body = { chatflowId: 'flow-1', chatId: 'chat-1', fileName: 'report.txt' }

describe('chatFilesController.downloadChatFile', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it.each(['chatflowId', 'chatId', 'fileName'])('rejects a request without %s', async (missing) => {
        const res = makeRes()
        const next = jest.fn() as NextFunction

        await chatFilesController.downloadChatFile(makeReq({ ...body, [missing]: undefined }), res, next)

        expect(res.status).toHaveBeenCalledWith(500)
        expect(res.send).toHaveBeenCalledWith('Invalid file path')
        expect(mockStreamStorageFile).not.toHaveBeenCalled()
    })

    it('answers 404 when the flow does not exist', async () => {
        setup(null, null)
        const next = jest.fn() as NextFunction

        await chatFilesController.downloadChatFile(makeReq(body), makeRes(), next)

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: StatusCodes.NOT_FOUND }))
        expect(mockStreamStorageFile).not.toHaveBeenCalled()
    })

    it('answers 404 when the workspace of the flow does not exist', async () => {
        setup({ id: 'flow-1', workspaceId: 'ws-1' }, null)
        const next = jest.fn() as NextFunction

        await chatFilesController.downloadChatFile(makeReq(body), makeRes(), next)

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: StatusCodes.NOT_FOUND }))
    })

    it('reads the file of the organization that owns the flow and sends a buffer with a download header', async () => {
        setup({ id: 'flow-1', workspaceId: 'ws-1' }, { id: 'ws-1', organizationId: 'org-1' })
        mockStreamStorageFile.mockResolvedValue(Buffer.from('hello'))
        const res = makeRes()

        await chatFilesController.downloadChatFile(makeReq(body), res, jest.fn())

        expect(mockStreamStorageFile).toHaveBeenCalledWith('flow-1', 'chat-1', 'report.txt', 'org-1')
        expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringContaining('report.txt'))
        expect(res.send).toHaveBeenCalledWith(Buffer.from('hello'))
    })

    it('pipes a file stream into the response', async () => {
        setup({ id: 'flow-1', workspaceId: 'ws-1' }, { id: 'ws-1', organizationId: 'org-1' })
        const stream = Object.create(fs.ReadStream.prototype)
        stream.pipe = jest.fn()
        mockStreamStorageFile.mockResolvedValue(stream)
        const res = makeRes()

        await chatFilesController.downloadChatFile(makeReq(body), res, jest.fn())

        expect(stream.pipe).toHaveBeenCalledWith(res)
        expect(res.send).not.toHaveBeenCalled()
    })

    it('forwards an error when the file cannot be read', async () => {
        setup({ id: 'flow-1', workspaceId: 'ws-1' }, { id: 'ws-1', organizationId: 'org-1' })
        mockStreamStorageFile.mockResolvedValue(undefined)
        const next = jest.fn() as NextFunction

        await chatFilesController.downloadChatFile(makeReq(body), makeRes(), next)

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: StatusCodes.INTERNAL_SERVER_ERROR }))
    })
})
