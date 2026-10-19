import { Request, Response, NextFunction } from 'express'
import { StatusCodes } from 'http-status-codes'

jest.mock('../../services/agentflowv2-generator', () => ({
    __esModule: true,
    default: {
        generateAgentflowv2: jest.fn(),
        generateInstruction: jest.fn()
    }
}))

import agentflowv2GeneratorController from './index'
import agentflowv2Service from '../../services/agentflowv2-generator'

const mockService = agentflowv2Service as jest.Mocked<typeof agentflowv2Service>

const makeReq = (overrides: Partial<Request> = {}): Request =>
    ({ body: undefined, params: {}, query: {}, ...overrides } as unknown as Request)
const makeRes = () => ({ json: jest.fn() } as unknown as Response)
const makeNext = (): NextFunction => jest.fn()

describe('agentflowv2GeneratorController', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('generateInstruction', () => {
        it('should return error when body is not provided', async () => {
            const next = makeNext()

            await agentflowv2GeneratorController.generateInstruction(makeReq({ body: undefined }), makeRes(), next)

            expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: StatusCodes.PRECONDITION_FAILED }))
            expect(mockService.generateInstruction).not.toHaveBeenCalled()
        })

        it('should pass task and selectedChatModel to the service and return its result', async () => {
            const body = { task: 'summarize emails', selectedChatModel: { name: 'chatOpenAI', inputs: {} } }
            mockService.generateInstruction.mockResolvedValue({ content: 'You are an email summarizer.' })
            const res = makeRes()

            await agentflowv2GeneratorController.generateInstruction(makeReq({ body }), res, makeNext())

            expect(mockService.generateInstruction).toHaveBeenCalledWith(body.task, body.selectedChatModel)
            expect(res.json).toHaveBeenCalledWith({ content: 'You are an email summarizer.' })
        })

        it('should forward service errors to next', async () => {
            const error = new Error('model failed')
            mockService.generateInstruction.mockRejectedValue(error)
            const next = makeNext()

            await agentflowv2GeneratorController.generateInstruction(
                makeReq({ body: { task: 't', selectedChatModel: {} } }),
                makeRes(),
                next
            )

            expect(next).toHaveBeenCalledWith(error)
        })
    })
})
