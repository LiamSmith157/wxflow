import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { ChannelAdapter } from '../types'
import { mediaSubdir } from './workdir'

/** 128x128 green check mark, used by the "send test image" action to check that sending media works end to end */
const TEST_IMAGE_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAIAAABMXPacAAABz0lEQVR42u3bQVLDMBBE0ey4JlflZGbHhhVBUs9oXqov4P9MFbGV18fXpwX3kgAAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADACA+/c8D4BM998fAMn6yw0AAOhWH0C4/loDAMn6AN6pDwCA+gDuqA8gXB9AuD6AwP+dAArd/tMB4vVHA1SoPxegSH0A4fpDAerc/hMBStUfB1Ct/iyAgvUBhOsPAqh5+08BKFt/BEDl+vcDFK9/DiBykfXrbwfIXvB0gOw1t6h/LUCX+jGArRffqP5GgFSCXvWTfwGbQgBItmhXvwTAqiId62e+B+zo0rT+iW/CBwz61j/0KGK3Qd/6R58FbTJoffsffRq6w6B7/dOPo9caXFA/8D5gVbU76mdeyCxpd0f92Buxfxpcc/snX0m+HfGm+uF3wm+kvKx+D4CfoPfVz5+K+JPBffVLHEt5ln4AJA06nlyqcjBrZv1aJ+MG1i93NHFa/YpnQwE0M+h+fLjo6egh9UsfT59Qv/rvA66vDwBA7V8YAAj/xgbA/QMAAIABAGAAABgAAAYAgAEAYAAAGAAABgCAAQBgAAAYAAAGAIABAGCL9g1v56sxKweUOgAAAABJRU5ErkJggg=='

export const getTestImage = (): Buffer => Buffer.from(TEST_IMAGE_BASE64, 'base64')

export interface TestImageResult {
    state: 'ok' | 'fail' | 'pending'
    jobId?: string
    error?: string
}

/**
 * Send the built-in image to a conversation through the real send path. When the DLL cannot open the file or the
 * send fails, its failure reason is returned as the error.
 */
export const sendTestImage = async (
    adapter: ChannelAdapter,
    mediaRoot: string,
    instance: string,
    to: string,
    waitMs: number
): Promise<TestImageResult> => {
    const tmpDir = mediaSubdir(mediaRoot, 'tmp')
    await fs.promises.mkdir(tmpDir, { recursive: true })
    const file = path.join(tmpDir, `wxflow-test-${crypto.randomUUID()}.png`)
    await fs.promises.writeFile(file, getTestImage())
    try {
        const outcome = await adapter.call(instance, 'send.image', { wxid: to, path: file })
        if (!outcome.ok) return { state: 'fail', error: outcome.error?.message ?? 'send.image failed' }
        const jobId = outcome.result?.jobid !== undefined ? String(outcome.result.jobid) : undefined
        if (!jobId) return { state: 'ok' }
        adapter.trackJob(jobId, instance)
        const terminal = await adapter.waitForJob(jobId, waitMs)
        if (!terminal) return { state: 'pending', jobId }
        return terminal.state === 'ok' ? { state: 'ok', jobId } : { state: 'fail', jobId, error: terminal.error ?? 'send failed' }
    } finally {
        await fs.promises.rm(file, { force: true })
    }
}
