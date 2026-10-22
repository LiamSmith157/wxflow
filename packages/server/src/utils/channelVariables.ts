import { get } from 'lodash'

const BLOCKED_PATH = /(^|\.)(__proto__|constructor|prototype)(\.|$)/

export const WECHAT_VAR_PREFIX = '$wechat.'

/**
 * Value of a `{{ $wechat.<field> }}` reference as text. A field the event does not have resolves to an empty
 * string so the node keeps running; objects and arrays are JSON-serialized.
 */
export const resolveWechatRef = (reference: string, wechat: Record<string, any> | undefined | null): string => {
    const subPath = reference.slice(WECHAT_VAR_PREFIX.length)
    // lodash.get follows __proto__/constructor/prototype, so those paths never resolve
    if (!subPath || BLOCKED_PATH.test(subPath)) return ''
    const value = get(wechat, subPath)
    if (value == null) return ''
    return typeof value === 'object' ? JSON.stringify(value) : String(value)
}
