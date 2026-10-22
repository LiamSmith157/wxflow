// File handling for the resource library. Files are stored as `<root>/<workspaceId>/<resourceId><ext>`: the name the
// user sees never reaches the file system, so Chinese names, spaces and duplicates across workspaces are not a problem.
import fs from 'fs'
import path from 'path'

const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/

const safeSegment = (value: string, what: string): string => {
    if (!SAFE_SEGMENT.test(value)) throw new Error(`invalid ${what} for a resource path: ${value}`)
    return value
}

/** Uploads land here first and are moved into place only once they passed the checks */
export const uploadDir = (root: string): string => path.join(root, '.upload')

export const storedPath = (root: string, workspaceId: string, resourceId: string, ext: string): string =>
    path.join(root, safeSegment(workspaceId, 'workspace'), `${safeSegment(resourceId, 'resource')}${ext}`)

export const readHead = async (file: string, bytes: number): Promise<Buffer> => {
    const handle = await fs.promises.open(file, 'r')
    try {
        const buffer = Buffer.alloc(bytes)
        const { bytesRead } = await handle.read(buffer, 0, bytes, 0)
        return buffer.subarray(0, bytesRead)
    } finally {
        await handle.close()
    }
}

/** Move a file, replacing the destination. Falls back to copy + delete when the two are on different volumes. */
export const moveFile = async (src: string, dest: string): Promise<void> => {
    await fs.promises.mkdir(path.dirname(dest), { recursive: true })
    try {
        await fs.promises.rename(src, dest)
    } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e
        await fs.promises.copyFile(src, dest)
        await fs.promises.rm(src, { force: true })
    }
}

export const removeQuiet = async (file: string): Promise<void> => {
    try {
        await fs.promises.rm(file, { force: true })
    } catch {
        /* a leftover temp file is cleaned up by the next upload or restart */
    }
}

/** The file is held open by another program (the WeChat DLL reading it, for one) */
export const isBusyError = (e: unknown): boolean => ['EBUSY', 'EPERM', 'EACCES'].includes((e as NodeJS.ErrnoException)?.code ?? '')
