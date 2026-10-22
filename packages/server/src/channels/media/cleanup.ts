import fs from 'fs'
import path from 'path'
import { GatewayLogger } from '../wechat/WeChatGateway'
import { mediaSubdir } from './workdir'
import { ResolvedMedia } from './resolver'

const HOUR_MS = 60 * 60 * 1000
export const TMP_MAX_AGE_MS = 24 * HOUR_MS
export const DEFAULT_FETCHED_RETENTION_DAYS = 7

/** Delete the temporary file of one send; files that were not downloaded for this send are left alone */
export const removeTemporary = async (media: Pick<ResolvedMedia, 'path' | 'temporary'>): Promise<void> => {
    if (media.temporary) await fs.promises.rm(media.path, { force: true })
}

const removeOlderThan = async (dir: string, maxAgeMs: number, now: number): Promise<number> => {
    let removed = 0
    let entries: fs.Dirent[]
    try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true })
    } catch {
        return 0
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            removed += await removeOlderThan(full, maxAgeMs, now)
            continue
        }
        try {
            const stat = await fs.promises.stat(full)
            if (now - stat.mtimeMs > maxAgeMs) {
                await fs.promises.rm(full, { force: true })
                removed++
            }
        } catch {
            /* file vanished or is locked: try again next round */
        }
    }
    return removed
}

export interface CleanupOptions {
    now?: number
    retentionDays?: number
}

export interface CleanupResult {
    tmp: number
    images: number
    voice: number
}

/** tmp/ files older than 24h, plus images/ and voice/ files older than the retention period */
export const cleanupMedia = async (
    root: string,
    { now = Date.now(), retentionDays = DEFAULT_FETCHED_RETENTION_DAYS }: CleanupOptions = {}
): Promise<CleanupResult> => {
    const retentionMs = retentionDays * 24 * HOUR_MS
    return {
        tmp: await removeOlderThan(mediaSubdir(root, 'tmp'), TMP_MAX_AGE_MS, now),
        images: await removeOlderThan(mediaSubdir(root, 'images'), retentionMs, now),
        voice: await removeOlderThan(mediaSubdir(root, 'voice'), retentionMs, now)
    }
}

export const parseRetentionDays = (raw: string | undefined): number => {
    const n = Number(raw)
    return Number.isFinite(n) && n >= 1 ? n : DEFAULT_FETCHED_RETENTION_DAYS
}

/** Clean once now and then every hour; returns a function that stops the schedule */
export const startCleanupSchedule = (root: string, logger: GatewayLogger, retentionDays: number): (() => void) => {
    const run = () =>
        cleanupMedia(root, { retentionDays })
            .then((r) => {
                if (r.tmp + r.images + r.voice > 0) logger.info(`[wechat-media] 清理完成: tmp=${r.tmp} images=${r.images} voice=${r.voice}`)
            })
            .catch((e) => logger.warn(`[wechat-media] 清理失败: ${(e as Error).message}`))
    void run()
    const timer = setInterval(run, HOUR_MS)
    timer.unref?.()
    return () => clearInterval(timer)
}
