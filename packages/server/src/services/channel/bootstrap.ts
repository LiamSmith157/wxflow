import { ChannelHub } from '../../channels/ChannelHub'
import channelInstancesService from '../channel-instances'
import { createChannelDispatcher, DispatcherLogger } from './dispatcher'
import { channelSettingsService, channelSubscriptionService } from './index'
import { runChannelFlow } from './runFlow'

/** Subscribe the event dispatcher and the instance bookkeeping to the channel hub */
export const initChannelServices = (hub: ChannelHub, logger: DispatcherLogger) => {
    hub.subscribeInstanceChanges((channel, pool) => channelInstancesService.syncPool(channel, pool))
    const dispatcher = createChannelDispatcher({
        getInstanceWorkspace: (channel, instanceKey) => channelInstancesService.getInstanceWorkspace(channel, instanceKey),
        getSettings: (workspaceId) => channelSettingsService.getSettings(workspaceId),
        findEnabled: (workspaceId, channel, eventType) => channelSubscriptionService.findEnabled(workspaceId, channel, eventType),
        runFlow: (subscription, event) => runChannelFlow(subscription, event),
        logger
    })
    hub.subscribeEvents((event) => dispatcher.handleEvent(event))
    return dispatcher
}
