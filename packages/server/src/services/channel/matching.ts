import { WechatFilters } from './subscriptions'

/** Whether the event satisfies the filters a flow configured on its Start node */
export const matchesFilters = (eventType: string, filters: WechatFilters, data: Record<string, any> | null | undefined): boolean => {
    const d = data ?? {}
    switch (eventType) {
        case 'msg.insert': {
            if (typeof d.talker !== 'string' || !d.talker) return false
            const direction = filters.direction ?? 'in'
            if (direction !== 'any' && d.direction !== direction) return false
            if (filters.talkers?.length && !filters.talkers.includes(d.talker)) return false
            if (filters.chatScope === 'group' && !d.isGroup) return false
            if (filters.chatScope === 'c2c' && d.isGroup) return false
            if (filters.msgTypes?.length && !filters.msgTypes.includes(String(d.msgType))) return false
            return true
        }
        case 'quickkey.hit':
            return !filters.keys?.length || filters.keys.includes(String(d.key ?? ''))
        case 'session.switch':
            return !filters.to?.length || filters.to.includes(String(d.to ?? ''))
        case 'msg.media':
            return !filters.media || filters.media === 'any' || d.media === filters.media
        case 'msg.pay': {
            if (!data || typeof data !== 'object') return false
            if (filters.kinds?.length && !filters.kinds.includes(String(d.kind ?? ''))) return false
            const direction = filters.payDirection ?? 'any'
            // events of undetermined direction (empty) are only received with "any"
            if (direction !== 'any' && (d.direction ?? '') !== direction) return false
            return true
        }
        default:
            // login / logout: no filters
            return true
    }
}
