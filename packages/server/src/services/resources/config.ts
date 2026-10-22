import os from 'os'
import path from 'path'

export const DEFAULT_RESOURCE_MAX_MB = 50

export interface ResourceConfig {
    /** Where resource files live: `~/.wxflow/resources`, always on the local disk */
    root: string
    /** Largest accepted file, in bytes */
    maxBytes: number
}

export const defaultResourcesRoot = (): string => path.join(os.homedir(), '.wxflow', 'resources')

export const getResourceConfig = (env: NodeJS.ProcessEnv = process.env): ResourceConfig => {
    const mb = Number(env.RESOURCE_MAX_MB)
    return {
        root: defaultResourcesRoot(),
        maxBytes: Math.round((Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_RESOURCE_MAX_MB) * 1024 * 1024)
    }
}
