import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { EXCHANGE_SUBDIRS, ExchangeConfig } from './exchange'

export interface ExchangeCheck {
    ok: boolean
    /** Directory as wxflow sees it */
    dir: string
    /** Directory as the DLL sees it */
    hostDir: string
    mapped: boolean
    /** Why the check failed, written for the operator */
    error?: string
}

/**
 * The exchange directory must already exist (a container without the mounted volume would silently use its own
 * filesystem) and be writable; the standard subdirectories are created inside it.
 */
export const checkExchange = async (cfg: ExchangeConfig): Promise<ExchangeCheck> => {
    const base = { dir: cfg.dir, hostDir: cfg.hostDir, mapped: cfg.mapped }
    try {
        const stat = await fs.promises.stat(cfg.dir)
        if (!stat.isDirectory()) return { ...base, ok: false, error: `交换目录 ${cfg.dir} 不是目录` }
    } catch {
        return {
            ...base,
            ok: false,
            error: `交换目录不存在: ${cfg.dir}。Docker 部署请确认已挂载 ${cfg.hostDir} 到容器内的 ${cfg.dir};直接安装请先创建该目录`
        }
    }
    try {
        for (const sub of EXCHANGE_SUBDIRS) await fs.promises.mkdir(path.join(cfg.dir, sub), { recursive: true })
        const probe = path.join(cfg.dir, `.probe-${crypto.randomUUID()}`)
        await fs.promises.writeFile(probe, 'wxflow')
        await fs.promises.rm(probe, { force: true })
    } catch (e) {
        return { ...base, ok: false, error: `交换目录不可写: ${cfg.dir}(${(e as Error).message})` }
    }
    return { ...base, ok: true }
}
