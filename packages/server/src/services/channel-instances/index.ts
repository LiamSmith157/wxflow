import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { createChannelInstanceService } from './core'

export * from './core'

export default createChannelInstanceService(() => getRunningExpressApp().AppDataSource)
