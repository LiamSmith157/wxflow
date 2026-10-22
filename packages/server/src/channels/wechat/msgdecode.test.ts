import fs from 'fs'
import path from 'path'
import { zstdCompressSync } from 'zlib'
import { decodeMessageInsert } from './msgdecode'

const evt = (row: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
    op: 'insert',
    table: 'Msg_x',
    talker: 'wxid_a',
    sender: 'wxid_a',
    direction: 'in',
    row,
    ...extra
})
const b64 = (s: string) => Buffer.from(s, 'utf-8').toString('base64')

describe('decodeMessageInsert', () => {
    it('decodes raw text content', () => {
        const r = decodeMessageInsert(
            evt({
                local_id: '1',
                server_id: '123',
                local_type: '1',
                sort_seq: '1',
                message_content: { b64: b64('你好，报价'), enc: 'raw', n: 15 }
            })
        )
        expect(r.msg!.content).toBe('你好，报价')
        expect(r.msg!.msgType).toBe(1)
        expect(r.msg!.direction).toBe('in')
        expect(r.msg!.talker).toBe('wxid_a')
        expect(r.msg!.sender).toBe('wxid_a')
    })

    it('decodes zstd-compressed content', () => {
        const z = zstdCompressSync(Buffer.from('这条消息是zstd压缩的中文内容，包含特殊符号 <>&"\' 和 emoji 🎉', 'utf-8'))
        const r = decodeMessageInsert(
            evt({
                local_id: '2',
                server_id: '456',
                local_type: '1',
                sort_seq: '2',
                message_content: { b64: Buffer.from(z).toString('base64'), enc: 'zstd', n: z.length }
            })
        )
        expect(r.msg!.content).toContain('zstd压缩的中文内容')
        expect(r.msg!.content).toContain('🎉')
    })

    it('takes the main type of a composite local_type', () => {
        const r = decodeMessageInsert(
            evt({
                local_id: '3',
                server_id: '789',
                local_type: String(3 * 2 ** 32 + 5),
                sort_seq: '3',
                message_content: { b64: '', enc: 'raw', n: 0 }
            })
        )
        expect(r.msg!.msgType).toBe(3)
    })

    it('detects group chats and passes update ops through', () => {
        const r = decodeMessageInsert(
            evt(
                { local_id: '4', server_id: '1', local_type: '1', sort_seq: '4', message_content: null },
                { talker: '123@chatroom', sender: 'wxid_member', op: 'update' }
            )
        )
        expect(r.msg!.isGroup).toBe(true)
    })

    it('keeps the event with empty content and a warning on zstd garbage', () => {
        const garbage = Buffer.from('not-zstd-at-all-but-marked-zstd')
        const r = decodeMessageInsert(
            evt({
                local_id: '5',
                server_id: '2',
                local_type: '1',
                sort_seq: '5',
                message_content: { b64: garbage.toString('base64'), enc: 'zstd', n: garbage.length }
            })
        )
        expect(r.msg).not.toBeNull()
        expect(r.msg!.content).toBe('')
        expect(r.warnings.some((w) => w.includes('zstd解压失败') || w.includes('内容解码异常'))).toBe(true)
    })

    it('strips the sender-wxid prefix from group message content', () => {
        const r = decodeMessageInsert(
            evt(
                {
                    local_id: '7',
                    server_id: '4',
                    local_type: '1',
                    sort_seq: '7',
                    message_content: { b64: b64('wxid_sddhegptstjt22:\n拆车的变速箱谁有'), enc: 'raw', n: 30 }
                },
                { talker: '6693978156@chatroom', sender: 'wxid_sddhegptstjt22' }
            )
        )
        expect(r.msg!.content).toBe('拆车的变速箱谁有')
        expect(r.msg!.sender).toBe('wxid_sddhegptstjt22')
        expect(r.msg!.isGroup).toBe(true)
    })

    it('falls back to the group prefix when the DLL sender is missing', () => {
        const r = decodeMessageInsert(
            evt(
                {
                    local_id: '8',
                    server_id: '5',
                    local_type: '1',
                    sort_seq: '8',
                    message_content: { b64: b64('wxid_abc:\n报价'), enc: 'raw', n: 12 }
                },
                { talker: '123@chatroom', sender: '' }
            )
        )
        expect(r.msg!.content).toBe('报价')
        expect(r.msg!.sender).toBe('wxid_abc')
    })

    it('does not strip colon-newline in a private chat', () => {
        const r = decodeMessageInsert(
            evt({
                local_id: '9',
                server_id: '6',
                local_type: '1',
                sort_seq: '9',
                message_content: { b64: b64('注意:\n明天开会'), enc: 'raw', n: 12 }
            })
        )
        expect(r.msg!.content).toBe('注意:\n明天开会')
    })

    it('extracts the title of a link message (type 5)', () => {
        const xml = '<appmsg appid="" sdkver="0"><title><![CDATA[报价单第3期]]></title><url>https://x</url></appmsg>'
        const r = decodeMessageInsert(
            evt({
                local_id: '6',
                server_id: '3',
                local_type: '5',
                sort_seq: '6',
                message_content: { b64: Buffer.from(xml).toString('base64'), enc: 'raw', n: xml.length }
            })
        )
        expect(r.msg!.content).toBe('报价单第3期')
    })

    it('returns no message for malformed or non-message payloads', () => {
        expect(decodeMessageInsert(null).msg).toBeNull()
        expect(decodeMessageInsert({ talker: 'x' }).msg).toBeNull()
        expect(decodeMessageInsert({ op: 'delete', row: {} }).msg).toBeNull()
    })

    describe('group @ list (synthetic fixtures)', () => {
        const fixtures = JSON.parse(
            fs.readFileSync(path.join(__dirname, '__fixtures__', 'msginsert-group-at.synthetic.json'), 'utf8')
        ) as Record<string, any>

        it('decodes atList including the bot wxid', () => {
            const r = decodeMessageInsert(fixtures.atSelf)
            expect(r.msg!.atList).toEqual(['wxid_bot'])
            expect(r.msg!.content).toBe('@机器人 我要续费')
        })
        it('lists mentioned people for a message that mentions others', () => {
            expect(decodeMessageInsert(fixtures.atOther).msg!.atList).toEqual(['wxid_xiaowang', 'wxid_other'])
        })
        it('has an empty atList without atuserlist or without a source field', () => {
            expect(decodeMessageInsert(fixtures.noAt).msg!.atList).toEqual([])
            const legacy = decodeMessageInsert(fixtures.legacyNoSource).msg!
            expect(legacy.atList).toEqual([])
            expect(legacy.content).toBe('旧夹具没有 source')
            expect(legacy.isGroup).toBe(true)
        })
        it('has an empty atList in private chats', () => {
            expect(decodeMessageInsert(fixtures.dm).msg!.atList).toEqual([])
        })
    })
})
