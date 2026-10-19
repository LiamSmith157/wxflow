import { StatusCodes } from 'http-status-codes'

jest.mock('../../utils/buildChatflow', () => ({ utilBuildChatflow: jest.fn() }))

import predictionsService from './index'
import { utilBuildChatflow } from '../../utils/buildChatflow'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import { ChatType } from '../../Interface'

const mockUtilBuildChatflow = utilBuildChatflow as jest.Mock
const req = { params: { id: 'flow-1' } } as any

describe('predictionsService.buildChatflow', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('returns the engine result and executes as an external request', async () => {
        mockUtilBuildChatflow.mockResolvedValue({ text: 'hello' })

        await expect(predictionsService.buildChatflow(req, ChatType.EXTERNAL)).resolves.toEqual({ text: 'hello' })

        expect(mockUtilBuildChatflow).toHaveBeenCalledWith(req, false, ChatType.EXTERNAL)
    })

    it.each([StatusCodes.BAD_REQUEST, StatusCodes.UNAUTHORIZED, StatusCodes.NOT_FOUND])(
        'keeps the status code of a %s client error',
        async (statusCode) => {
            mockUtilBuildChatflow.mockRejectedValue(new InternalFlowiseError(statusCode, 'client error'))

            await expect(predictionsService.buildChatflow(req)).rejects.toMatchObject({ statusCode, message: 'client error' })
        }
    )

    it('wraps unexpected errors as 500', async () => {
        mockUtilBuildChatflow.mockRejectedValue(new Error('boom'))

        await expect(predictionsService.buildChatflow(req)).rejects.toMatchObject({
            statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
            message: expect.stringContaining('boom')
        })
    })

    it('wraps server errors raised as InternalFlowiseError as 500', async () => {
        mockUtilBuildChatflow.mockRejectedValue(new InternalFlowiseError(StatusCodes.BAD_GATEWAY, 'upstream down'))

        await expect(predictionsService.buildChatflow(req)).rejects.toMatchObject({ statusCode: StatusCodes.INTERNAL_SERVER_ERROR })
    })
})
