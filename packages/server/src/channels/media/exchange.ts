// The exchange directory is the one place both wxflow and AIHelpLib.dll can read and write. wxflow sees it
// as `dir` (/exchange in a container); the DLL sees the same directory as `hostDir` (a Windows path).
// Path handling is string based on purpose: the Windows flavor must work even when wxflow itself runs on Linux.
import os from 'os'
import path from 'path'

export interface ExchangeConfig {
    /** The exchange directory as wxflow sees it */
    dir: string
    /** The same directory as the DLL (Windows) sees it; defaults to `dir` */
    hostDir: string
    /** True when hostDir was configured explicitly (container deployment) */
    mapped: boolean
}

export const EXCHANGE_SUBDIRS = ['assets', 'tmp', 'images', 'voice', 'resources'] as const
export type ExchangeSubdir = (typeof EXCHANGE_SUBDIRS)[number]

export class ExchangePathError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'ExchangePathError'
    }
}

type PathFlavor = typeof path.posix | typeof path.win32

const isWindowsStyle = (p: string): boolean => /^[A-Za-z]:([\\/]|$)/.test(p) || p.startsWith('\\\\')

const flavorOf = (p: string): PathFlavor => (isWindowsStyle(p) ? path.win32 : path.posix)

export const isAbsoluteAnyFlavor = (p: string): boolean => isWindowsStyle(p) || p.startsWith('/')

export const getExchangeConfig = (env: NodeJS.ProcessEnv = process.env): ExchangeConfig => {
    const dir = env.WECHAT_EXCHANGE_DIR?.trim() || path.join(os.homedir(), '.wxflow', 'exchange')
    const configuredHost = env.WECHAT_EXCHANGE_DIR_HOST?.trim()
    return { dir, hostDir: configuredHost || dir, mapped: !!configuredHost }
}

const caseFold = (flavor: PathFlavor, p: string): string => (flavor === path.win32 ? p.toLowerCase() : p)

/** Segments of `p` below `root`, or null when `p` is outside `root` */
const segmentsBelow = (root: string, p: string): string[] | null => {
    const flavor = flavorOf(root)
    const normRoot = flavor.normalize(root).replace(/[\\/]+$/, '')
    const normP = flavor.normalize(p)
    const rel = flavor.relative(caseFold(flavor, normRoot), caseFold(flavor, normP))
    if (rel === '') return []
    if (rel.startsWith('..') || flavor.isAbsolute(rel)) return null
    // re-split the original (case preserved) path by the number of segments
    const originalRel = normP.slice(normRoot.length).replace(/^[\\/]+/, '')
    return originalRel.split(/[\\/]+/).filter(Boolean)
}

/** Whether `p` (in wxflow's view) is the exchange directory or inside it */
export const isInsideExchange = (cfg: ExchangeConfig, p: string): boolean => isAbsoluteAnyFlavor(p) && segmentsBelow(cfg.dir, p) !== null

/** Convert a path in wxflow's view into the path the DLL must use */
export const toHostPath = (cfg: ExchangeConfig, containerPath: string): string => {
    const segs = segmentsBelow(cfg.dir, containerPath)
    if (!segs) throw new ExchangePathError(`路径不在交换目录内: ${containerPath}`)
    return flavorOf(cfg.hostDir).join(cfg.hostDir, ...segs)
}

/** Convert a path reported by the DLL into the path wxflow can read */
export const fromHostPath = (cfg: ExchangeConfig, hostPath: string): string => {
    const segs = segmentsBelow(cfg.hostDir, hostPath)
    if (!segs) throw new ExchangePathError(`DLL 返回的路径不在交换目录内: ${hostPath}`)
    return flavorOf(cfg.dir).join(cfg.dir, ...segs)
}

/** Absolute path of a subdirectory in wxflow's view */
export const exchangeSubdir = (cfg: ExchangeConfig, sub: ExchangeSubdir): string => flavorOf(cfg.dir).join(cfg.dir, sub)

/** Absolute path of a subdirectory as the DLL sees it */
export const hostSubdir = (cfg: ExchangeConfig, sub: ExchangeSubdir): string => flavorOf(cfg.hostDir).join(cfg.hostDir, sub)
