import client from './client'

const getUpsertHistory = (id, params = {}) => client.get(`/upsert-history/${id}`, { params: { order: 'DESC', ...params } })

export default {
    getUpsertHistory
}
