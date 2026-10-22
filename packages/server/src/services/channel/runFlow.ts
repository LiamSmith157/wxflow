import { v4 as uuidv4 } from 'uuid'
import { ChannelEvent } from '../../channels/types'
import { ChatType } from '../../Interface'
import { createMockRequest } from '../../utils/mockRequest'
import { utilBuildChatflow } from '../../utils/buildChatflow'
import { SubscriptionView } from './subscriptions'

/** The event as the flow sees it: `{{ $wechat.<field> }}` resolves against this object */
export const toFlowEvent = (event: ChannelEvent): Record<string, any> => ({
    ...(event.data && typeof event.data === 'object' ? event.data : {}),
    channel: event.channel,
    instance: event.instance,
    event: event.event
})

/**
 * Start one run of a subscribed flow. Runs go through the normal prediction path (execution record, credentials,
 * workspace context) exactly like MCP calls do. Messages of one conversation share a session so agents keep their
 * memory; events without a conversation get a fresh session.
 */
export const runChannelFlow = async (subscription: SubscriptionView, event: ChannelEvent): Promise<void> => {
    const flowEvent = toFlowEvent(event)
    const talker = typeof flowEvent.talker === 'string' && flowEvent.talker ? flowEvent.talker : ''
    const chatId = talker ? `${event.channel}:${event.instance}:${talker}` : uuidv4()
    const question = typeof flowEvent.content === 'string' && flowEvent.content ? flowEvent.content : ' '
    const req = createMockRequest({
        chatflowId: subscription.chatflowId,
        body: { streaming: false, question, chatId, wechat: flowEvent }
    })
    await utilBuildChatflow(req, true, ChatType.CHANNEL)
}
