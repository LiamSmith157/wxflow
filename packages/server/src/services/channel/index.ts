import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { createChannelSettingsService } from './settings'
import { createChannelSubscriptionService } from './subscriptions'

export * from './settings'
export * from './subscriptions'

const getDataSource = () => getRunningExpressApp().AppDataSource

export const channelSettingsService = createChannelSettingsService(getDataSource)
export const channelSubscriptionService = createChannelSubscriptionService(getDataSource)
