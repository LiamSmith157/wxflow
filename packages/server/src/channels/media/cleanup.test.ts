import fs from 'fs'
import os from 'os'
import path from 'path'
import { ExchangeConfig } from './exchange'
import { cleanupExchange, removeTemporary } from './cleanup'
import { checkExchange } from './selfCheck'

const HOUR = 3600 * 1000
let root: string
let cfg: ExchangeConfig

const touch = (rel: string, ageMs: number, now: number) => {
    const full = path.join(root, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, 'x')
    const t = new Date(now - ageMs)
    fs.utimesSync(full, t, t)
    return full
}

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'wxflow-cleanup-'))
    cfg = { dir: root, hostDir: root, mapped: false }
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

describe('cleanupExchange', () => {
    it('removes tmp files older than 24h and keeps newer ones', async () => {
        const now = Date.now()
        const old = touch('tmp/old.jpg', 25 * HOUR, now)
        const fresh = touch('tmp/fresh.jpg', 23 * HOUR, now)
        const r = await cleanupExchange(cfg, { now })
        expect(r.tmp).toBe(1)
        expect(fs.existsSync(old)).toBe(false)
        expect(fs.existsSync(fresh)).toBe(true)
    })

    it('keeps fetched images and voice for the retention days, then removes them', async () => {
        const now = Date.now()
        const oldImg = touch('images/a.jpg', 8 * 24 * HOUR, now)
        const newImg = touch('images/b.jpg', 6 * 24 * HOUR, now)
        const oldVoice = touch('voice/a.wav', 8 * 24 * HOUR, now)
        const r = await cleanupExchange(cfg, { now, retentionDays: 7 })
        expect(r).toEqual({ tmp: 0, images: 1, voice: 1 })
        expect(fs.existsSync(oldImg)).toBe(false)
        expect(fs.existsSync(oldVoice)).toBe(false)
        expect(fs.existsSync(newImg)).toBe(true)
    })

    it('honours a custom retention period', async () => {
        const now = Date.now()
        const img = touch('images/a.jpg', 2 * 24 * HOUR, now)
        await cleanupExchange(cfg, { now, retentionDays: 1 })
        expect(fs.existsSync(img)).toBe(false)
    })

    it('never touches assets/ or resources/', async () => {
        const now = Date.now()
        const asset = touch('assets/海报/a.jpg', 400 * 24 * HOUR, now)
        const res = touch('resources/r.bin', 400 * 24 * HOUR, now)
        await cleanupExchange(cfg, { now })
        expect(fs.existsSync(asset)).toBe(true)
        expect(fs.existsSync(res)).toBe(true)
    })

    it('does not fail when the directories do not exist', async () => {
        await expect(cleanupExchange(cfg)).resolves.toEqual({ tmp: 0, images: 0, voice: 0 })
    })
})

describe('removeTemporary', () => {
    it('deletes a downloaded file after the send, and only those', async () => {
        const tmp = touch('tmp/t.png', 0, Date.now())
        const asset = touch('assets/a.png', 0, Date.now())
        await removeTemporary({ path: asset, temporary: false })
        expect(fs.existsSync(asset)).toBe(true)
        await removeTemporary({ path: tmp, temporary: true })
        expect(fs.existsSync(tmp)).toBe(false)
    })
})

describe('checkExchange', () => {
    it('passes for a writable directory and creates the subdirectories', async () => {
        const r = await checkExchange(cfg)
        expect(r.ok).toBe(true)
        for (const d of ['assets', 'tmp', 'images', 'voice', 'resources']) expect(fs.existsSync(path.join(root, d))).toBe(true)
        expect(fs.readdirSync(root).some((n) => n.startsWith('.probe-'))).toBe(false)
    })

    it('reports a missing directory without creating it', async () => {
        const missing = path.join(root, 'not-mounted')
        const r = await checkExchange({ dir: missing, hostDir: 'C:\\wxflow\\exchange', mapped: true })
        expect(r.ok).toBe(false)
        expect(r.error).toContain('交换目录不存在')
        expect(r.error).toContain('C:\\wxflow\\exchange')
        expect(fs.existsSync(missing)).toBe(false)
    })

    it('reports a path that is a file', async () => {
        const file = path.join(root, 'f')
        fs.writeFileSync(file, 'x')
        const r = await checkExchange({ dir: file, hostDir: file, mapped: false })
        expect(r.ok).toBe(false)
        expect(r.error).toContain('不是目录')
    })

    it('reports a read-only directory', async () => {
        if (process.getuid?.() === 0) return // root ignores permission bits
        fs.chmodSync(root, 0o500)
        try {
            const r = await checkExchange(cfg)
            expect(r.ok).toBe(false)
            expect(r.error).toContain('不可写')
        } finally {
            fs.chmodSync(root, 0o700)
        }
    })
})
