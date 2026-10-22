import client from './client'

const checkValidation = (id) => client.get(`/validation/${id}`)

// warnings about fixed media paths of WeChat send nodes that do not exist; shown after a save, never blocking it
const checkMediaWarnings = (id) => client.get(`/validation/${id}/media-warnings`)

export default {
    checkValidation,
    checkMediaWarnings
}
