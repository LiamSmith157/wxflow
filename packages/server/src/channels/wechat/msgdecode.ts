// msg.insert event payload -> structured WeChat message.
// Pipeline: row.message_content {b64, enc} -> bytes -> (zstd?) -> utf-8 string.
// Text messages (type 1) carry the plain text directly; rich types carry XML, from which only the title is extracted.
import { decompress } from 'fzstd'

export interface WeChatMessage {
    talker: string
    sender: string
    direction: 'in' | 'out'
    isGroup: boolean
    /** Main message type (local_type >> 32 when composite) */
    msgType: number
    content: string
    /** u64 as string, never used in arithmetic */
    svrid: string
    localId: string
    ts: number
    /** wxids mentioned in a group message (msgsource <atuserlist>); empty for private chats */
    atList: string[]
    warnings: string[]
}

export interface DecodeResult {
    msg: WeChatMessage | null
    warnings: string[]
}

const decodeContent = (field: unknown, warnings: string[]): string => {
    if (field == null) return ''
    if (typeof field === 'string') return field
    const f = field as { b64?: string; enc?: string }
    if (!f.b64) return ''
    let bytes = new Uint8Array(Buffer.from(f.b64, 'base64'))
    const zstdMagic = bytes.length >= 4 && bytes[0] === 0x28 && bytes[1] === 0xb5 && bytes[2] === 0x2f && bytes[3] === 0xfd
    if (f.enc === 'zstd' || zstdMagic) {
        try {
            bytes = decompress(bytes)
        } catch (e) {
            warnings.push(`zstd解压失败: ${(e as Error).message}`)
            return ''
        }
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

const mainType = (localType: unknown): number => {
    const t = typeof localType === 'string' ? Number(localType) : Number(localType ?? 0)
    if (!Number.isFinite(t)) return 0
    return t > 0xffffffff ? Math.floor(t / 2 ** 32) : t
}

const extractDisplayText = (xml: string, type: number): string => {
    if (type === 1) return xml
    const title = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/.exec(xml)
    return title ? (title[1] || '').trim() : ''
}

/** Column names the msgsource XML may live in; the first one that yields an <atuserlist> wins */
const SOURCE_FIELDS = ['source', 'origin_source', 'msgsource']

const extractAtList = (row: Record<string, any>, warnings: string[]): string[] => {
    for (const f of SOURCE_FIELDS) {
        if (row[f] == null) continue
        const xml = decodeContent(row[f], warnings)
        const m = /<atuserlist>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/atuserlist>/.exec(xml)
        if (m) {
            return m[1]
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean)
        }
    }
    return []
}

export const decodeMessageInsert = (data: unknown): DecodeResult => {
    const warnings: string[] = []
    if (data == null || typeof data !== 'object') return { msg: null, warnings: ['事件数据非对象'] }
    const d = data as Record<string, any>
    const row = d.row
    if (!row || typeof row !== 'object') return { msg: null, warnings: ['事件缺 row'] }
    if (d.op && d.op !== 'insert' && d.op !== 'update') return { msg: null, warnings: [] }

    let content = ''
    try {
        const raw = decodeContent(row.message_content, warnings)
        const mt = mainType(row.local_type)
        content = extractDisplayText(raw, mt).trim()
        if (mt !== 1 && !content && raw) warnings.push(`type=${mt} 文本提取为空(非文本消息)`)
    } catch (e) {
        warnings.push(`内容解码异常: ${(e as Error).message}`)
    }

    const talker = typeof d.talker === 'string' ? d.talker : ''
    let sender = typeof d.sender === 'string' ? d.sender : ''
    const isGroup = talker.endsWith('@chatroom')

    // Group message content is "senderWxid:\nbody"; strip the prefix so matching works on the body only
    if (isGroup && content.includes(':\n')) {
        const idx = content.indexOf(':\n')
        const prefix = content.slice(0, idx)
        if (prefix.length < 64) {
            content = content.slice(idx + 2)
            if (!sender) sender = prefix
        }
    }

    return {
        msg: {
            talker,
            sender,
            direction: d.direction === 'out' ? 'out' : 'in',
            isGroup,
            msgType: mainType(row.local_type),
            content,
            svrid: String(row.server_id ?? ''),
            localId: String(row.local_id ?? ''),
            ts: Number(row.sort_seq) || Date.now(),
            atList: isGroup ? extractAtList(row, warnings) : [],
            warnings
        },
        warnings
    }
}
