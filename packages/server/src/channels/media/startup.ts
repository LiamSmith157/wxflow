import { getChannelConfig } from '../config'
import { setExchangeCheck } from '../wechat/gatewayService'
import { GatewayLogger } from '../wechat/WeChatGateway'
import { startCleanupSchedule } from './cleanup'
import { checkExchange, ExchangeCheck } from './selfCheck'

let stopCleanup: (() => void) | undefined

/** Startup self-check of the exchange directory plus the periodic cleanup. Never throws: problems are reported in the gateway status. */
export const initExchange = async (logger: GatewayLogger, env: NodeJS.ProcessEnv = process.env): Promise<ExchangeCheck> => {
    const config = getChannelConfig(env)
    const check = await checkExchange(config.exchange)
    setExchangeCheck(check)
    if (check.ok) {
        logger.info(`[wechat-exchange] 交换目录就绪: ${check.dir}${check.mapped ? ` (Windows: ${check.hostDir})` : ''}`)
        stopCleanup?.()
        stopCleanup = startCleanupSchedule(config.exchange, logger, config.fetchedRetentionDays)
    } else {
        logger.warn(`[wechat-exchange] 交换目录自检失败: ${check.error}`)
    }
    return check
}

export const stopExchange = (): void => {
    stopCleanup?.()
    stopCleanup = undefined
}
