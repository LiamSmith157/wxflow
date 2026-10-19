// jsdom pulls in ESM-only dependencies that jest cannot load; the nodes under test never use it
jest.mock('jsdom', () => ({ JSDOM: class JSDOM {} }))
jest.mock('./utils', () => ({
    getNodeModulesPackagePath: () => require('path').resolve(__dirname, '..', '..', 'components')
}))
jest.mock('./utils/getRunningExpressApp', () => ({ getRunningExpressApp: jest.fn() }))

import type { NodesPool as NodesPoolType } from './NodesPool'

const AGENTFLOW_NODES = [
    'startAgentflow',
    'agentAgentflow',
    'llmAgentflow',
    'conditionAgentflow',
    'conditionAgentAgentflow',
    'directReplyAgentflow',
    'customFunctionAgentflow',
    'toolAgentflow',
    'retrieverAgentflow',
    'httpAgentflow',
    'iterationAgentflow',
    'loopAgentflow',
    'humanInputAgentflow',
    'executeFlowAgentflow',
    'stickyNoteAgentflow'
]

const REMOVED_CATEGORIES = [
    'Agents',
    'Chains',
    'LLMs',
    'Multi Agents',
    'Sequential Agents',
    'Output Parsers',
    'Prompts',
    'Engine',
    'Response Synthesizer',
    'Graph',
    'Moderation',
    'Memory',
    'Cache',
    'Retrievers'
]

const KEPT_CATEGORIES = [
    'Agent Flows',
    'Chat Models',
    'Tools',
    'Tools (MCP)',
    'Embeddings',
    'Vector Stores',
    'Document Loaders',
    'Text Splitters',
    'Record Manager'
]

const REMOVED_NODE_NAMES = [
    'conversationChain',
    'llmChain',
    'supervisor',
    'worker',
    'seqAgent',
    'seqStart',
    'bufferMemory',
    'inMemoryCache',
    'chainTool',
    'retrieverTool',
    'queryEngineTool',
    'webBrowser',
    'getVariable',
    'setVariable',
    'ifElseFunction',
    'stickyNote'
]

// The registry is loaded from the compiled nodes, so this suite needs `pnpm build` of packages/components first
const componentsDist = require('path').resolve(__dirname, '..', '..', 'components', 'dist', 'nodes')
const componentsBuilt = require('fs').existsSync(componentsDist)
if (!componentsBuilt) console.warn(`Skipping the node registry tests: ${componentsDist} does not exist, build packages/components first`)
;(componentsBuilt ? describe : describe.skip)('node registry built from flowise-components', () => {
    // required lazily so that a missing build skips the suite instead of failing while importing flowise-components
    let nodesService: typeof import('./services/nodes').default
    let getRunningExpressApp: jest.Mock
    let pool: NodesPoolType
    let nodes: NodesPoolType['componentNodes']

    beforeAll(async () => {
        const { NodesPool } = require('./NodesPool')
        nodesService = require('./services/nodes').default
        getRunningExpressApp = require('./utils/getRunningExpressApp').getRunningExpressApp
        pool = new NodesPool()
        await pool.initialize()
        nodes = pool.componentNodes
    }, 300000)

    it('loads the nodes of the build', () => {
        expect(Object.keys(nodes).length).toBeGreaterThan(150)
    })

    it('contains every agentflow v2 node', () => {
        const missing = AGENTFLOW_NODES.filter((name) => !nodes[name])

        expect(missing).toEqual([])
    })

    it('contains the categories that agentflow nodes and document stores load from', () => {
        const categories = new Set(Object.values(nodes).map((node) => node.category))

        expect(KEPT_CATEGORIES.filter((category) => !categories.has(category))).toEqual([])
    })

    it('does not contain any node of a removed category', () => {
        const leftovers = Object.values(nodes)
            .filter((node) => REMOVED_CATEGORIES.includes(node.category))
            .map((node) => `${node.category}/${node.name}`)

        expect(leftovers).toEqual([])
    })

    it('does not contain any LlamaIndex node', () => {
        const leftovers = Object.values(nodes)
            .filter((node) => node.tags?.includes('LlamaIndex'))
            .map((node) => node.name)

        expect(leftovers).toEqual([])
    })

    it('only keeps the custom function node in the Utilities category', () => {
        const utilities = Object.values(nodes)
            .filter((node) => node.category === 'Utilities')
            .map((node) => node.name)

        expect(utilities).toEqual(['customFunction'])
    })

    it('does not know the names of removed nodes', () => {
        expect(REMOVED_NODE_NAMES.filter((name) => nodes[name])).toEqual([])
    })

    describe('nodes service', () => {
        beforeEach(() => {
            getRunningExpressApp.mockReturnValue({ nodesPool: pool })
        })

        it.each(REMOVED_NODE_NAMES)('answers 404 when the removed node %s is requested by name', async (name) => {
            await expect(nodesService.getNodeByName(name)).rejects.toMatchObject({ statusCode: 404 })
        })

        it('still returns an agentflow node by name', async () => {
            await expect(nodesService.getNodeByName('agentAgentflow')).resolves.toMatchObject({ name: 'agentAgentflow' })
        })

        it('lists no node for a removed category', async () => {
            await expect(nodesService.getAllNodesForCategory('Memory')).resolves.toEqual([])
        })
    })
})
