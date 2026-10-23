import { IResourceRuntime } from 'wxflow-components'
import resourcesService from './index'
import { createResourceRuntime } from './runtime'

/** The resource handle for one run of a flow in a workspace */
export const createRunResourceRuntime = (workspaceId: string): IResourceRuntime => createResourceRuntime(resourcesService, workspaceId)
