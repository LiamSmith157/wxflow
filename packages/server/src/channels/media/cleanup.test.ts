import fs from 'fs'
import os from 'os'
import path from 'path'
import { cleanupMedia, removeTemporary } from './cleanup'
import { checkMediaDir } from './selfCheck'

const HOUR = 3600 * 1000
let root: string

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
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

describe('cleanupMedia', () => {
    it('removes tmp files older than 24h and keeps newer ones', async () => {
        const now = Date.now()
        const old = touch('tmp/old.jpg', 25 * HOUR, now)
        const fresh = touch('tmp/fresh.jpg', 23 * HOUR, now)
        const r = await cleanupMedia(root, { now })
        expect(r.tmp).toBe(1)
        expect(fs.existsSync(old)).toBe(false)
        expect(fs.existsSync(fresh)).toBe(true)
    })

    it('keeps fetched images and voice for the retention days, then removes them', async () => {
        const now = Date.now()
        const oldImg = touch('images/a.jpg', 8 * 24 * HOUR, now)
        const newImg = touch('images/b.jpg', 6 * 24 * HOUR, now)
        const oldVoice = touch('voice/a.wav', 8 * 24 * HOUR, now)
        const r = await cleanupMedia(root, { now, retentionDays: 7 })
        expect(r).toEqual({ tmp: 0, images: 1, voice: 1 })
        expect(fs.existsSync(oldImg)).toBe(false)
        expect(fs.existsSync(oldVoice)).toBe(false)
        expect(fs.existsSync(newImg)).toBe(true)
    })

    it('honours a custom retention period', async () => {
        const now = Date.now()
        const img = touch('images/a.jpg', 2 * 24 * HOUR, now)
        await cleanupMedia(root, { now, retentionDays: 1 })
        expect(fs.existsSync(img)).toBe(false)
    })

    it('never touches files outside tmp/, images/ and voice/', async () => {
        const now = Date.now()
        const other = touch('other/keep.bin', 400 * 24 * HOUR, now)
        await cleanupMedia(root, { now })
        expect(fs.existsSync(other)).toBe(true)
    })

    it('does not fail when the directories do not exist', async () => {
        await expect(cleanupMedia(root)).resolves.toEqual({ tmp: 0, images: 0, voice: 0 })
    })
})

describe('removeTemporary', () => {
    it('deletes a downloaded file after the send, and only those', async () => {
        const tmp = touch('tmp/t.png', 0, Date.now())
        const local = touch('images/a.png', 0, Date.now())
        await removeTemporary({ path: local, temporary: false })
        expect(fs.existsSync(local)).toBe(true)
        await removeTemporary({ path: tmp, temporary: true })
        expect(fs.existsSync(tmp)).toBe(false)
    })
})

describe('checkMediaDir', () => {
    it('creates the working directory and its subdirectories when they do not exist yet', async () => {
        const fresh = path.join(root, 'wechat')
        const r = await checkMediaDir(fresh)
        expect(r).toEqual({ ok: true })
        for (const d of ['tmp', 'images', 'voice']) expect(fs.existsSync(path.join(fresh, d))).toBe(true)
        expect(fs.readdirSync(fresh).some((n) => n.startsWith('.probe-'))).toBe(false)
    })

    it('passes for an existing writable directory', async () => {
        expect((await checkMediaDir(root)).ok).toBe(true)
    })

    it('reports a directory that cannot be created, naming it', async () => {
        const file = path.join(root, 'f')
        fs.writeFileSync(file, 'x')
        const blocked = path.join(file, 'wechat')
        const r = await checkMediaDir(blocked)
        expect(r.ok).toBe(false)
        expect(r.error).toContain('媒体目录不可用')
        expect(r.error).toContain(blocked)
        expect(r.error).not.toContain('交换目录')
    })
})
