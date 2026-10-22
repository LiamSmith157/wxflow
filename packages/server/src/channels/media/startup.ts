import { getChannelConfig } from '../config'
import { setMediaDirCheck } from '../wechat/gatewayService'
import { GatewayLogger } from '../wechat/WeChatGateway'
import { startCleanupSchedule } from './cleanup'
import { checkMediaDir, MediaDirCheck } from './selfCheck'

let stopCleanup: (() => void) | undefined

/** Startup self-check of the media working directory plus the periodic cleanup. Never throws: problems are reported in the gateway status. */
export const initMediaDir = async (logger: GatewayLogger, env: NodeJS.ProcessEnv = process.env): Promise<MediaDirCheck> => {
    const config = getChannelConfig(env)
    const check = await checkMediaDir(config.mediaRoot)
    setMediaDirCheck(check)
    if (check.ok) {
        logger.info(`[wechat-media] 媒体目录就绪: ${config.mediaRoot}`)
        stopCleanup?.()
        stopCleanup = startCleanupSchedule(config.mediaRoot, logger, config.fetchedRetentionDays)
    } else {
        logger.warn(`[wechat-media] 媒体目录自检失败: ${check.error}`)
    }
    return check
}

export const stopMediaDir = (): void => {
    stopCleanup?.()
    stopCleanup = undefined
}
