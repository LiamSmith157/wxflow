import fs from 'fs'
import path from 'path'
import { getUserHome } from './utils'

/**
 * Read a config value: WXFLOW_<name> wins, FLOWISE_<name> is the legacy fallback.
 * Pass the bare name, e.g. getEnv('SECRETKEY_OVERWRITE').
 * Empty strings are treated as unset.
 */
export const getEnv = (name: string): string | undefined => {
    const value = process.env[`WXFLOW_${name}`]
    if (value !== undefined && value !== '') return value
    const legacy = process.env[`FLOWISE_${name}`]
    if (legacy !== undefined && legacy !== '') return legacy
    return undefined
}

/**
 * Default data directory: ~/.wxflow, unless only the legacy ~/.flowise exists.
 * Never moves files, so existing encryption keys, databases and uploads stay usable.
 */
export const getDefaultDataDir = (): string => {
    const home = getUserHome()
    const current = path.join(home, '.wxflow')
    const legacy = path.join(home, '.flowise')
    if (!fs.existsSync(current) && fs.existsSync(legacy)) return legacy
    return current
}
