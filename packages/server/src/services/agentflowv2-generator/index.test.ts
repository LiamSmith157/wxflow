import * as fs from 'fs'
import * as path from 'path'

const mockGenerate = jest.fn()

jest.mock('wxflow-components', () => ({
    generateAgentflowv2: (...args: unknown[]) => mockGenerate(...args),
    extractResponseContent: jest.fn(),
    ICommonObject: {}
}))
jest.mock('../../utils', () => ({ databaseEntities: {} }))
jest.mock('../../utils/getRunningExpressApp', () => ({
    getRunningExpressApp: jest.fn().mockReturnValue({
        AppDataSource: {},
        nodesPool: {
            componentNodes: {
                startAgentflow: { category: 'Agent Flows', name: 'startAgentflow', label: 'Start', description: 'start node' }
            }
        }
    })
}))
jest.mock('../../utils/logger', () => ({
    __esModule: true,
    default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}))

import agentflowv2Service from './index'

const examplesDir = path.join(__dirname, '..', '..', '..', 'agentflow-examples')

describe('agentflowv2Service.generateAgentflowv2', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockGenerate.mockResolvedValue({ nodes: [], edges: [] })
        delete process.env.MODE
    })

    it('ships the reference examples next to the package root', () => {
        const examples = fs.readdirSync(examplesDir).filter((file) => file.endsWith('.json'))

        expect(examples.length).toBeGreaterThan(0)
        expect(examples).toContain('Simple RAG.json')
    })

    it('puts every reference example into the system prompt and fills the placeholders', async () => {
        await agentflowv2Service.generateAgentflowv2('translate text', { name: 'chatOpenAI', inputs: {} })

        expect(mockGenerate).toHaveBeenCalledTimes(1)
        const { prompt } = mockGenerate.mock.calls[0][0]
        const examples = fs.readdirSync(examplesDir).filter((file) => file.endsWith('.json'))
        for (const example of examples) {
            expect(prompt).toContain(`<<${example.replace(/\.json$/, '')}>>`)
        }
        expect(prompt).toContain('translate text')
        expect(prompt).not.toContain('{userRequest}')
        expect(prompt).not.toContain('{agentFlow2Nodes}')
    })

    it('keeps going when the model returns an object that matches the schema', async () => {
        await expect(agentflowv2Service.generateAgentflowv2('x', { name: 'chatOpenAI', inputs: {} })).resolves.toEqual({
            nodes: [],
            edges: []
        })
    })
})
