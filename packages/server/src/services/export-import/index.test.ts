import { StatusCodes } from 'http-status-codes'

jest.mock('flowise-components', () => ({ getStoragePath: jest.fn(), parseJsonBody: jest.fn() }))
jest.mock('../assistants', () => ({ __esModule: true, default: { getAllAssistants: jest.fn().mockResolvedValue([]) } }))
jest.mock('../chatflows', () => ({ __esModule: true, default: { getAllChatflows: jest.fn() } }))
jest.mock('../chat-messages', () => ({ __esModule: true, default: {} }))
jest.mock('../documentstore', () => ({ __esModule: true, default: {} }))
jest.mock('../executions', () => ({ __esModule: true, default: {} }))
jest.mock('../marketplaces', () => ({ __esModule: true, default: {} }))
jest.mock('../tools', () => ({ __esModule: true, default: { getAllTools: jest.fn().mockResolvedValue([]) } }))
jest.mock('../variables', () => ({ __esModule: true, default: { getAllVariables: jest.fn().mockResolvedValue([]) } }))
jest.mock('../../utils/getRunningExpressApp', () => ({ getRunningExpressApp: jest.fn() }))
jest.mock('../../utils/getChatMessage', () => ({ utilGetChatMessage: jest.fn() }))
jest.mock('../../utils/quotaUsage', () => ({ checkUsageLimit: jest.fn() }))

import exportImportService from './index'
import chatflowService from '../chatflows'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'

const mockGetAllChatflows = chatflowService.getAllChatflows as jest.Mock
const mockGetRunningExpressApp = getRunningExpressApp as jest.Mock

const emptyExport = {
    AgentFlowV2: [],
    AssistantCustom: [],
    AssistantOpenAI: [],
    AssistantAzure: [],
    ChatMessage: [],
    ChatMessageFeedback: [],
    CustomTemplate: [],
    DocumentStore: [],
    DocumentStoreFileChunk: [],
    Execution: [],
    Tool: [],
    Variable: []
}

const agentflow = (overrides: Record<string, unknown> = {}) => ({
    id: 'flow-1',
    name: 'flow',
    type: 'AGENTFLOW',
    flowData: '{}',
    ...overrides
})

describe('exportImportService', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('exportData', () => {
        it('exports AGENTFLOW flows and does not include segments for removed flow types', async () => {
            mockGetAllChatflows.mockResolvedValue([agentflow()])

            const result = await exportImportService.exportData({ agentflowv2: true } as any, 'ws-1')

            expect(result.AgentFlowV2).toEqual([agentflow()])
            expect(mockGetAllChatflows).toHaveBeenCalledWith('AGENTFLOW', 'ws-1')
            for (const removed of ['AgentFlow', 'ChatFlow', 'AssistantFlow']) {
                expect(result).not.toHaveProperty(removed)
            }
        })

        it('ignores the removed chatflow and agentflow export flags', async () => {
            mockGetAllChatflows.mockResolvedValue([])

            await exportImportService.exportData({ chatflow: true, agentflow: true, assistantCustom: false } as any, 'ws-1')

            expect(mockGetAllChatflows).not.toHaveBeenCalled()
        })
    })

    describe('importData', () => {
        const runImport = (data: Record<string, unknown>) =>
            exportImportService.importData({ ...emptyExport, ...data } as any, 'org-1', 'ws-1', 'sub-1')

        it.each(['AgentFlow', 'ChatFlow', 'AssistantFlow'])('rejects an import file with a non-empty %s segment', async (segment) => {
            await expect(runImport({ [segment]: [agentflow({ type: 'CHATFLOW' })] })).rejects.toMatchObject({
                statusCode: StatusCodes.BAD_REQUEST,
                message: expect.stringContaining(segment)
            })

            expect(mockGetRunningExpressApp).not.toHaveBeenCalled()
        })

        it.each(['CHATFLOW', 'MULTIAGENT', 'ASSISTANT', undefined])('rejects AgentFlowV2 entries whose type is %s', async (type) => {
            await expect(runImport({ AgentFlowV2: [agentflow({ type })] })).rejects.toMatchObject({
                statusCode: StatusCodes.BAD_REQUEST
            })

            expect(mockGetRunningExpressApp).not.toHaveBeenCalled()
        })

        it('does not reject empty removed segments', async () => {
            mockGetRunningExpressApp.mockImplementation(() => {
                throw new Error('reached the database layer')
            })

            await expect(runImport({ AgentFlow: [], ChatFlow: [], AssistantFlow: [], AgentFlowV2: [agentflow()] })).rejects.toMatchObject({
                statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
                message: expect.stringContaining('reached the database layer')
            })
            expect(mockGetRunningExpressApp).toHaveBeenCalled()
        })
    })
})
