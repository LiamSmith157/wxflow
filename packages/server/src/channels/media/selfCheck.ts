import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { MEDIA_SUBDIRS } from './workdir'

export interface MediaDirCheck {
    ok: boolean
    /** Why the check failed, written for the operator */
    error?: string
}

/** The media working directory (and its subdirectories) must be creatable and writable */
export const checkMediaDir = async (root: string): Promise<MediaDirCheck> => {
    try {
        for (const sub of MEDIA_SUBDIRS) await fs.promises.mkdir(path.join(root, sub), { recursive: true })
        const probe = path.join(root, `.probe-${crypto.randomUUID()}`)
        await fs.promises.writeFile(probe, 'wxflow')
        await fs.promises.rm(probe, { force: true })
    } catch (e) {
        return { ok: false, error: `媒体目录不可用: ${root}(${(e as Error).message}),请检查该目录的权限和磁盘空间` }
    }
    return { ok: true }
}
