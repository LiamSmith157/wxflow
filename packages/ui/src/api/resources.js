import client from './client'

const getResources = (params) => client.get('/resources', { params })

const form = (file, fields = {}) => {
    const body = new FormData()
    Object.entries(fields).forEach(([key, value]) => {
        if (value !== undefined && value !== null) body.append(key, value)
    })
    // the file goes last so the other fields are known when the server starts reading it
    body.append('file', file)
    return body
}

const MULTIPART = { headers: { 'Content-type': 'multipart/form-data' } }

// fields: { name, groupName }
const createResource = (file, fields) => client.post('/resources', form(file, fields), MULTIPART)

// patch: { name?, groupName? }; an empty groupName clears the group
const updateResource = (id, patch) => client.put(`/resources/${id}`, patch)

const replaceResourceFile = (id, file) => client.put(`/resources/${id}/file`, form(file), MULTIPART)

const deleteResource = (id) => client.delete(`/resources/${id}`)

// byNameOnly: only the flows that break when the resource is renamed
const getResourceUsages = (id, byNameOnly = false) => client.get(`/resources/${id}/usages`, { params: byNameOnly ? { byName: 1 } : {} })

// the file as a Blob, for thumbnails and downloads (the request carries the sign-in, a plain <img src> would not on every setup)
const getResourceFile = (id, download = false) =>
    client.get(`/resources/${id}/file`, { params: download ? { download: 1 } : {}, responseType: 'blob' })

export default {
    getResources,
    createResource,
    updateResource,
    replaceResourceFile,
    deleteResource,
    getResourceUsages,
    getResourceFile
}
