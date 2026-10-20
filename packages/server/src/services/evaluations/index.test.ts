jest.mock('wxflow-components', () => ({ EvaluationRunner: class EvaluationRunner {} }))
jest.mock('../../utils', () => ({ getAppVersion: jest.fn() }))
jest.mock('../../utils/getRunningExpressApp', () => ({ getRunningExpressApp: jest.fn() }))
jest.mock('../../utils/stripProtectedFields', () => ({ stripProtectedFields: jest.fn((x: unknown) => x) }))
jest.mock('../../enterprise/utils/ControllerServiceUtils', () => ({ getWorkspaceSearchOptions: jest.fn().mockReturnValue({}) }))
jest.mock('../evaluator', () => ({ __esModule: true, default: {} }))
jest.mock('./CostCalculator', () => ({ calculateCost: jest.fn(), formatCost: jest.fn() }))
jest.mock('./EvaluatorRunner', () => ({ runAdditionalEvaluators: jest.fn() }))
jest.mock('./LLMEvaluationRunner', () => ({ LLMEvaluationRunner: class LLMEvaluationRunner {} }))

import evaluationsService from './index'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'

const mockGetRunningExpressApp = getRunningExpressApp as jest.Mock

const RUN_DATE = new Date('2026-01-10T00:00:00Z')
const BEFORE_RUN = new Date('2026-01-01T00:00:00Z')
const AFTER_RUN = new Date('2026-01-20T00:00:00Z')

const setup = (rows: { evaluation?: unknown; dataset?: unknown; chatflows?: Record<string, unknown> }) => {
    const chatflowLookup = jest.fn().mockImplementation(async ({ id }: { id: string }) => rows.chatflows?.[id] ?? null)
    const repositories: Record<string, unknown> = {
        Evaluation: { findOneBy: jest.fn().mockResolvedValue(rows.evaluation ?? null) },
        Dataset: { findOneBy: jest.fn().mockResolvedValue(rows.dataset ?? null) },
        ChatFlow: { findOneBy: chatflowLookup }
    }
    mockGetRunningExpressApp.mockReturnValue({
        AppDataSource: { getRepository: (entity: { name: string }) => repositories[entity.name] }
    })
    return { chatflowLookup }
}

const evaluation = (overrides: Record<string, unknown> = {}) => ({
    id: 'eval-1',
    runDate: RUN_DATE,
    datasetId: 'dataset-1',
    datasetName: 'Dataset',
    chatflowId: JSON.stringify(['flow-1']),
    chatflowName: JSON.stringify(['Flow One']),
    additionalConfig: JSON.stringify({ chatflowTypes: ['Agentflow v2'] }),
    ...overrides
})

describe('evaluationsService.isOutdated', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('is not outdated when the dataset and flows were not changed after the run', async () => {
        setup({
            evaluation: evaluation(),
            dataset: { updatedDate: BEFORE_RUN },
            chatflows: { 'flow-1': { updatedDate: BEFORE_RUN, type: 'AGENTFLOW' } }
        })

        const result = await evaluationsService.isOutdated('eval-1', 'ws-1')

        expect(result).toMatchObject({ isOutdated: false, chatflows: [], errors: [] })
    })

    it('reports a flow changed after the run as an Agentflow v2', async () => {
        setup({
            evaluation: evaluation(),
            dataset: { updatedDate: BEFORE_RUN },
            chatflows: { 'flow-1': { updatedDate: AFTER_RUN, type: 'AGENTFLOW' } }
        })

        const result = await evaluationsService.isOutdated('eval-1', 'ws-1')

        expect(result.isOutdated).toBe(true)
        expect(result.chatflows).toEqual([
            { chatflowName: 'Flow One', chatflowId: 'flow-1', chatflowType: 'Agentflow v2', isOutdated: true }
        ])
    })

    it('reports a dataset changed after the run', async () => {
        const dataset = { updatedDate: AFTER_RUN }
        setup({
            evaluation: evaluation(),
            dataset,
            chatflows: { 'flow-1': { updatedDate: BEFORE_RUN, type: 'AGENTFLOW' } }
        })

        const result = await evaluationsService.isOutdated('eval-1', 'ws-1')

        expect(result).toMatchObject({ isOutdated: true, dataset })
    })

    it('reports a missing flow as an error and outdated', async () => {
        setup({ evaluation: evaluation(), dataset: { updatedDate: BEFORE_RUN }, chatflows: {} })

        const result = await evaluationsService.isOutdated('eval-1', 'ws-1')

        expect(result.isOutdated).toBe(true)
        expect(result.errors).toEqual([{ message: 'Chatflow Flow One not found', id: 'flow-1' }])
    })

    it('looks up every selected flow in the flows table, including legacy Custom Assistant entries', async () => {
        const { chatflowLookup } = setup({
            evaluation: evaluation({
                chatflowId: JSON.stringify(['flow-1', 'assistant-1']),
                chatflowName: JSON.stringify(['Flow One', 'Old Assistant']),
                additionalConfig: JSON.stringify({ chatflowTypes: ['Agentflow v2', 'Custom Assistant'] })
            }),
            dataset: { updatedDate: BEFORE_RUN },
            chatflows: { 'flow-1': { updatedDate: BEFORE_RUN, type: 'AGENTFLOW' } }
        })

        const result = await evaluationsService.isOutdated('eval-1', 'ws-1')

        expect(chatflowLookup).toHaveBeenCalledTimes(2)
        expect(result.errors).toEqual([{ message: 'Chatflow Old Assistant not found', id: 'assistant-1' }])
    })

    it('reports a missing dataset as an error', async () => {
        setup({ evaluation: evaluation(), dataset: null, chatflows: { 'flow-1': { updatedDate: BEFORE_RUN, type: 'AGENTFLOW' } } })

        const result = await evaluationsService.isOutdated('eval-1', 'ws-1')

        expect(result.isOutdated).toBe(true)
        expect(result.errors).toEqual([{ message: 'Dataset Dataset not found', id: 'dataset-1' }])
    })

    it('throws when the evaluation does not exist', async () => {
        setup({ evaluation: null })

        await expect(evaluationsService.isOutdated('missing', 'ws-1')).rejects.toMatchObject({ statusCode: 500 })
    })
})
