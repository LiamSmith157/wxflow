import { StatusCodes } from 'http-status-codes'

jest.mock('flowise-components', () => ({}))
jest.mock('../utils/getRunningExpressApp', () => ({ getRunningExpressApp: jest.fn() }))

import { utilGetUploadsConfig } from './getUploadsConfig'
import { getRunningExpressApp } from '../utils/getRunningExpressApp'

const mockGetRunningExpressApp = getRunningExpressApp as jest.Mock

const agentNode = (inputs: Record<string, unknown> = {}) => ({ id: 'agentAgentflow_0', data: { category: 'Agent Flows', inputs } })

const setChatflow = (chatflow: Record<string, unknown> | null) => {
    mockGetRunningExpressApp.mockReturnValue({
        AppDataSource: { getRepository: () => ({ findOneBy: jest.fn().mockResolvedValue(chatflow) }) }
    })
}

const flowData = (nodes: unknown[], edges: unknown[] = []) => JSON.stringify({ nodes, edges })

describe('utilGetUploadsConfig', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('throws 404 when the flow does not exist', async () => {
        setChatflow(null)

        await expect(utilGetUploadsConfig('missing')).rejects.toMatchObject({ statusCode: StatusCodes.NOT_FOUND })
    })

    it('reports no uploads for a flow without any upload settings', async () => {
        setChatflow({ flowData: flowData([agentNode()]) })

        await expect(utilGetUploadsConfig('flow-1')).resolves.toEqual({
            isSpeechToTextEnabled: false,
            isImageUploadAllowed: false,
            isRAGFileUploadAllowed: false,
            imgUploadSizeAndTypes: [],
            fileUploadSizeAndTypes: []
        })
    })

    it.each(['agentModelConfig', 'llmModelConfig', 'conditionAgentModelConfig'])(
        'allows image uploads when a node enables allowImageUploads in %s',
        async (key) => {
            setChatflow({ flowData: flowData([agentNode({ [key]: { allowImageUploads: true } })]) })

            const config = await utilGetUploadsConfig('flow-1')

            expect(config.isImageUploadAllowed).toBe(true)
            expect(config.imgUploadSizeAndTypes).toEqual([
                { fileTypes: ['image/gif', 'image/jpeg', 'image/png', 'image/webp', ''], maxUploadSize: 5 }
            ])
        }
    )

    it('enables speech to text when a provider other than none has status on', async () => {
        const speechToText = JSON.stringify({ none: { status: true }, openAIWhisper: { status: true } })
        setChatflow({ flowData: flowData([agentNode()]), speechToText })

        const config = await utilGetUploadsConfig('flow-1')

        expect(config.isSpeechToTextEnabled).toBe(true)
    })

    it('does not enable speech to text when only none or disabled providers are configured', async () => {
        const speechToText = JSON.stringify({ none: { status: true }, openAIWhisper: { status: false } })
        setChatflow({ flowData: flowData([agentNode()]), speechToText })

        const config = await utilGetUploadsConfig('flow-1')

        expect(config.isSpeechToTextEnabled).toBe(false)
    })

    it('never reports RAG file uploads, even when a vector store with fileUpload is connected to a file loader', async () => {
        const vectorStore = { id: 'pinecone_0', data: { category: 'Vector Stores', inputs: { fileUpload: true }, inputParams: [] } }
        const loader = {
            id: 'pdfFile_0',
            data: { category: 'Document Loaders', inputs: {}, inputParams: [{ type: 'file', fileType: '.pdf, .txt' }] }
        }
        const edge = { source: 'pdfFile_0', target: 'pinecone_0', targetHandle: 'pinecone_0-input-document-Document' }
        setChatflow({ flowData: flowData([agentNode(), vectorStore, loader], [edge]) })

        const config = await utilGetUploadsConfig('flow-1')

        expect(config.isRAGFileUploadAllowed).toBe(false)
        expect(config.fileUploadSizeAndTypes).toEqual([])
    })
})
