import { IChannelRuntime } from 'wxflow-components'
import channelInstancesService from '../services/channel-instances'
import { channelSettingsService } from '../services/channel'
import { createChannelSender } from './ChannelSender'
import { getChannelRegistry } from './ChannelRegistry'
import { getChannelConfig } from './config'
import { getMediaResolver } from './media/resolverInstance'
import { createChannelRuntime } from './runtime'
import { getGatewayStatus } from './wechat/gatewayService'

const sender = createChannelSender({
    registry: getChannelRegistry(),
    getSettings: (workspaceId) => channelSettingsService.getSettings(workspaceId)
})

export const getChannelSender = () => sender

/** The channel handle for one run of a flow in a workspace */
export const createRunChannelRuntime = (workspaceId: string, event?: Record<string, any>): IChannelRuntime =>
    createChannelRuntime(
        {
            registry: getChannelRegistry(),
            sender,
            resolver: getMediaResolver(),
            config: getChannelConfig(),
            listWorkspaceInstances: (ws, channel) => channelInstancesService.listWorkspaceInstances(ws, channel),
            gatewayStatus: getGatewayStatus
        },
        { workspaceId, event }
    )
