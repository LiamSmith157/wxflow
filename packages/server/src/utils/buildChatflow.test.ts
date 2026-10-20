import { StatusCodes } from 'http-status-codes'

jest.mock('wxflow-components', () => ({
    convertSpeechToText: jest.fn(),
    addSingleFileToStorage: jest.fn(),
    addArrayFilesToStorage: jest.fn(),
    mapMimeTypeToInputField: jest.fn(),
    mapExtToInputField: jest.fn(),
    getFileFromUpload: jest.fn(),
    removeSpecificFileFromUpload: jest.fn()
}))

jest.mock('./index', () => ({ databaseEntities: {} }))

jest.mock('./buildAgentflow', () => ({ executeAgentFlow: jest.fn() }))

jest.mock('../utils/getRunningExpressApp', () => ({ getRunningExpressApp: jest.fn() }))

jest.mock('./validateKey', () => ({ validateFlowAPIKey: jest.fn() }))

jest.mock('./quotaUsage', () => ({
    checkPredictions: jest.fn(),
    checkStorage: jest.fn(),
    updatePredictionsUsage: jest.fn(),
    updateStorageUsage: jest.fn()
}))

jest.mock('./logger', () => ({
    __esModule: true,
    default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}))

import { executeFlow, utilBuildChatflow } from './buildChatflow'
import { executeAgentFlow } from './buildAgentflow'
import { getRunningExpressApp } from '../utils/getRunningExpressApp'
import { validateFlowAPIKey } from './validateKey'
import { createMockRequest } from './mockRequest'
import { FLOWISE_COUNTER_STATUS, FLOWISE_METRIC_COUNTERS } from '../Interface.Metrics'

const mockExecuteAgentFlow = executeAgentFlow as jest.Mock
const mockGetRunningExpressApp = getRunningExpressApp as jest.Mock
const mockValidateFlowAPIKey = validateFlowAPIKey as jest.Mock

const makeApp = (chatflow: Record<string, unknown> | null) => {
    const incrementCounter = jest.fn()
    const abortControllerPool = { add: jest.fn(), remove: jest.fn() }
    const repositories: Record<string, unknown> = {
        ChatFlow: { findOneBy: jest.fn().mockResolvedValue(chatflow) },
        Workspace: { findOneBy: jest.fn().mockResolvedValue({ id: 'ws-1', organizationId: 'org-1' }) },
        Organization: { findOneBy: jest.fn().mockResolvedValue({ id: 'org-1', subscriptionId: 'sub-1' }) }
    }
    const app = {
        AppDataSource: { getRepository: (entity: { name: string }) => repositories[entity.name] },
        identityManager: { getProductIdFromSubscription: jest.fn().mockResolvedValue('product-1') },
        usageCacheManager: {},
        sseStreamer: {},
        telemetry: {},
        cachePool: {},
        nodesPool: { componentNodes: {} },
        metricsProvider: { incrementCounter },
        abortControllerPool
    }
    mockGetRunningExpressApp.mockReturnValue(app)
    return { incrementCounter, abortControllerPool }
}

describe('buildChatflow', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        delete process.env.MODE
        mockValidateFlowAPIKey.mockResolvedValue(true)
    })

    describe('utilBuildChatflow', () => {
        it.each(['CHATFLOW', 'MULTIAGENT', 'ASSISTANT'])('should reject a %s flow with 400 without executing anything', async (type) => {
            const { incrementCounter, abortControllerPool } = makeApp({ id: 'flow-1', type, workspaceId: 'ws-1' })

            await expect(utilBuildChatflow(createMockRequest({ chatflowId: 'flow-1' }), true)).rejects.toMatchObject({
                statusCode: StatusCodes.BAD_REQUEST
            })

            expect(mockExecuteAgentFlow).not.toHaveBeenCalled()
            expect(abortControllerPool.add).not.toHaveBeenCalled()
            expect(incrementCounter).not.toHaveBeenCalled()
        })

        it('should reject an unknown flow with 404', async () => {
            makeApp(null)

            await expect(utilBuildChatflow(createMockRequest({ chatflowId: 'missing' }), true)).rejects.toMatchObject({
                statusCode: StatusCodes.NOT_FOUND
            })
            expect(mockExecuteAgentFlow).not.toHaveBeenCalled()
        })

        it('should execute an AGENTFLOW with the agentflow engine and record the success metric', async () => {
            const chatflow = { id: 'flow-1', type: 'AGENTFLOW', workspaceId: 'ws-1' }
            const { incrementCounter, abortControllerPool } = makeApp(chatflow)
            mockExecuteAgentFlow.mockResolvedValue({ text: 'hello' })

            const result = await utilBuildChatflow(
                createMockRequest({ chatflowId: 'flow-1', body: { question: 'hi', streaming: false } }),
                true
            )

            expect(result).toEqual({ text: 'hello' })
            expect(mockExecuteAgentFlow).toHaveBeenCalledTimes(1)
            expect(mockExecuteAgentFlow.mock.calls[0][0]).toMatchObject({
                chatflow,
                orgId: 'org-1',
                workspaceId: 'ws-1',
                subscriptionId: 'sub-1',
                productId: 'product-1',
                isInternal: true,
                incomingInput: expect.objectContaining({ question: 'hi' })
            })
            expect(abortControllerPool.add).toHaveBeenCalled()
            expect(abortControllerPool.remove).toHaveBeenCalled()
            expect(incrementCounter).toHaveBeenCalledWith(FLOWISE_METRIC_COUNTERS.CHATFLOW_PREDICTION_INTERNAL, {
                status: FLOWISE_COUNTER_STATUS.SUCCESS
            })
        })

        it('should record the failure metric when the agentflow engine throws', async () => {
            const { incrementCounter } = makeApp({ id: 'flow-1', type: 'AGENTFLOW', workspaceId: 'ws-1' })
            mockExecuteAgentFlow.mockRejectedValue(new Error('boom'))

            await expect(utilBuildChatflow(createMockRequest({ chatflowId: 'flow-1' }), false)).rejects.toMatchObject({
                statusCode: StatusCodes.INTERNAL_SERVER_ERROR
            })
            expect(incrementCounter).toHaveBeenCalledWith(FLOWISE_METRIC_COUNTERS.CHATFLOW_PREDICTION_EXTERNAL, {
                status: FLOWISE_COUNTER_STATUS.FAILURE
            })
        })

        it('should reject an external request with 401 when the API key is invalid', async () => {
            makeApp({ id: 'flow-1', type: 'AGENTFLOW', workspaceId: 'ws-1' })
            mockValidateFlowAPIKey.mockResolvedValue(false)

            await expect(utilBuildChatflow(createMockRequest({ chatflowId: 'flow-1' }), false)).rejects.toMatchObject({
                statusCode: StatusCodes.UNAUTHORIZED
            })
            expect(mockExecuteAgentFlow).not.toHaveBeenCalled()
        })
    })

    describe('executeFlow', () => {
        it('should reject a non-AGENTFLOW flow before touching uploads or the engine', async () => {
            await expect(
                executeFlow({
                    chatflow: { id: 'flow-1', type: 'CHATFLOW' },
                    incomingInput: { question: 'hi' }
                } as any)
            ).rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST })

            expect(mockExecuteAgentFlow).not.toHaveBeenCalled()
        })

        it('should pass an AGENTFLOW through to the agentflow engine', async () => {
            mockExecuteAgentFlow.mockResolvedValue({ text: 'ok' })
            const chatflow = { id: 'flow-1', type: 'AGENTFLOW' }

            const result = await executeFlow({ chatflow, chatId: 'chat-1', incomingInput: { question: 'hi' } } as any)

            expect(result).toEqual({ text: 'ok' })
            expect(mockExecuteAgentFlow.mock.calls[0][0]).toMatchObject({ chatflow, chatId: 'chat-1' })
        })
    })
})
