import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { getResourceConfig } from './config'
import { createResourceService } from './core'

export * from './core'

export default createResourceService({
    getDataSource: () => getRunningExpressApp().AppDataSource,
    config: () => getResourceConfig()
})
