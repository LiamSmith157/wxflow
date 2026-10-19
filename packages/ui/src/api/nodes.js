import client from './client'

const getAllNodes = () => client.get('/nodes', { params: { client: 'agentflowv2' } })

const getSpecificNode = (name) => client.get(`/nodes/${name}`, { params: { client: 'agentflowv2' } })
const getNodesByCategory = (name) => client.get(`/nodes/category/${name}`, { params: { client: 'agentflowv2' } })

// Chat models for model pickers (AI generators, prompt generator). LlamaIndex variants are not supported by agentflow.
const getChatModels = async () => {
    const response = await client.get(`/nodes/category/Chat Models`)
    response.data = response.data.filter((node) => !node.tags?.includes('LlamaIndex'))
    return response
}

const executeCustomFunctionNode = (body) => client.post(`/node-custom-function`, body)

const executeNodeLoadMethod = (name, body) => client.post(`/node-load-method/${name}`, body)

export default {
    getAllNodes,
    getSpecificNode,
    executeCustomFunctionNode,
    getNodesByCategory,
    getChatModels,
    executeNodeLoadMethod
}
