// Variable suggestions for {{ $wechat.<field> }}: the fields the channel layer puts in the WeChat event that
// started the flow. Which fields exist depends on the event type chosen in the Start node.

const COMMON_FIELDS = [
    { name: 'channel', description: 'Channel of the event (wechat)' },
    { name: 'instance', description: 'wxid of the WeChat account that received the event' },
    { name: 'event', description: 'Event name, for example msg.insert' }
]

const FIELDS_BY_EVENT = {
    'msg.insert': [
        { name: 'talker', description: 'Conversation the message belongs to (wxid, or chatroom id for groups)' },
        { name: 'sender', description: 'wxid of the message sender' },
        { name: 'content', description: 'Message text (title for link messages)' },
        { name: 'msgType', description: 'Message type: 1 text, 3 image, 34 voice, 5 link, 6 file, 43 video' },
        { name: 'direction', description: 'in for received messages, out for messages sent by this account' },
        { name: 'isGroup', description: 'true when the conversation is a group chat' },
        { name: 'svrid', description: 'Server message id (use it to fetch an image or voice)' },
        { name: 'localId', description: 'Local message id' },
        { name: 'atList', description: 'wxids mentioned in a group message' }
    ],
    'quickkey.hit': [{ name: 'key', description: 'The quick keyword that was matched' }],
    'session.switch': [
        { name: 'from', description: 'Conversation that was selected before' },
        { name: 'to', description: 'Conversation that is selected now' }
    ],
    'msg.media': [{ name: 'media', description: 'Media type: image, video or file' }],
    'msg.pay': [
        { name: 'kind', description: 'Payment event kind, for example transfer or redpacket' },
        { name: 'direction', description: 'Money flow: in, out or empty' },
        { name: 'amount', description: 'Amount as text, may be missing' },
        { name: 'counterparty', description: 'wxid of the other party' },
        { name: 'memo', description: 'Memo of the payment' },
        { name: 'talker', description: 'Conversation of the event' },
        { name: 'sender', description: 'wxid of the sender' }
    ]
}

/**
 * Suggestion items for a flow whose Start node uses the WeChat Event input type; empty for every other input type.
 * When no event type is chosen yet the message fields are listed, which are the common case; events without fields
 * of their own (login, logout) get only the common ones.
 */
export const getWechatSuggestionItems = (startInputType, wechatEventType) => {
    if (startInputType !== 'wechatEvent') return []
    const eventFields = wechatEventType ? FIELDS_BY_EVENT[wechatEventType] ?? [] : FIELDS_BY_EVENT['msg.insert']
    return [...COMMON_FIELDS, ...eventFields].map((field) => ({
        id: `$wechat.${field.name}`,
        mentionLabel: `$wechat.${field.name}`,
        description: `WeChat Event: ${field.description}`,
        category: 'WeChat Event'
    }))
}
