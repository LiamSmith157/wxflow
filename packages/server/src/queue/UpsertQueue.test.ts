jest.mock('./BaseQueue', () => ({
    BaseQueue: class BaseQueue {
        protected queue = {}
        constructor(..._args: unknown[]) {}
    }
}))

const mockPreviewChunks = jest.fn()
const mockProcessLoader = jest.fn()
const mockInsertIntoVectorStore = jest.fn()
const mockExecuteDocStoreUpsert = jest.fn()

jest.mock('../services/documentstore', () => ({
    previewChunks: (...args: unknown[]) => mockPreviewChunks(...args),
    processLoader: (...args: unknown[]) => mockProcessLoader(...args),
    insertIntoVectorStore: (...args: unknown[]) => mockInsertIntoVectorStore(...args),
    executeDocStoreUpsert: (...args: unknown[]) => mockExecuteDocStoreUpsert(...args)
}))
jest.mock('../utils/logger', () => ({
    __esModule: true,
    default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}))

import { UpsertQueue } from './UpsertQueue'

const makeQueue = () =>
    new UpsertQueue('upsert', {} as any, {
        appDataSource: { name: 'ds' } as any,
        telemetry: { name: 'telemetry' } as any,
        cachePool: { name: 'cache' } as any,
        usageCacheManager: { name: 'usage' } as any,
        componentNodes: { startAgentflow: {} } as any
    })

describe('UpsertQueue.processJob', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it.each([
        ['preview a loader', { isPreviewOnly: true }, () => mockPreviewChunks],
        ['process a loader', { isProcessWithoutUpsert: true }, () => mockProcessLoader],
        ['insert into the vector store', { isVectorStoreInsert: true }, () => mockInsertIntoVectorStore],
        ['upsert through a document store', { storeId: 'store-1' }, () => mockExecuteDocStoreUpsert]
    ])('dispatches the document store job to %s', async (_label, job, handler) => {
        handler().mockResolvedValue('done')

        const result = await makeQueue().processJob({ ...job } as any)

        expect(result).toBe('done')
        expect(handler()).toHaveBeenCalledTimes(1)
    })

    it('injects the app services into the job before running it', async () => {
        mockExecuteDocStoreUpsert.mockResolvedValue('done')

        await makeQueue().processJob({ storeId: 'store-1' } as any)

        expect(mockExecuteDocStoreUpsert.mock.calls[0][0]).toMatchObject({
            storeId: 'store-1',
            appDataSource: { name: 'ds' },
            telemetry: { name: 'telemetry' },
            cachePool: { name: 'cache' },
            usageCacheManager: { name: 'usage' },
            componentNodes: { startAgentflow: {} }
        })
    })

    it('rejects a job that is not a document store job (chatflow upserts are gone)', async () => {
        await expect(makeQueue().processJob({ chatflow: { id: 'flow-1' } } as any)).rejects.toThrow('Unknown upsert job type')

        for (const handler of [mockPreviewChunks, mockProcessLoader, mockInsertIntoVectorStore, mockExecuteDocStoreUpsert]) {
            expect(handler).not.toHaveBeenCalled()
        }
    })
})
