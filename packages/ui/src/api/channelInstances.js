import client from './client'

const getInstances = (params) => client.get('/channel-instances', { params })

// workspaceId: a workspace id to assign the instance to, or null to unassign it
const assignInstance = (id, workspaceId) => client.put(`/channel-instances/${id}/assignment`, { workspaceId })

const getGatewayStatus = () => client.get('/channel-instances/gateway-status')

const getSettings = () => client.get('/channel-instances/settings')

const updateSettings = (body) => client.put('/channel-instances/settings', body)

const sendTestImage = (id, to) => client.post(`/channel-instances/${id}/test-image`, { to })

export default {
    getInstances,
    assignInstance,
    getGatewayStatus,
    getSettings,
    updateSettings,
    sendTestImage
}
