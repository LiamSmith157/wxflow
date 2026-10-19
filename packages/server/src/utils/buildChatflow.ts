import { Request } from 'express'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { omit } from 'lodash'
import {
    IFileUpload,
    convertSpeechToText,
    ICommonObject,
    addSingleFileToStorage,
    addArrayFilesToStorage,
    mapMimeTypeToInputField,
    mapExtToInputField,
    getFileFromUpload,
    removeSpecificFileFromUpload
} from 'flowise-components'
import { StatusCodes } from 'http-status-codes'
import { IncomingInput, ChatType, IExecuteFlowParams, MODE } from '../Interface'
import { InternalFlowiseError } from '../errors/internalFlowiseError'
import { databaseEntities } from '.'
import { ChatFlow } from '../database/entities/ChatFlow'
import { getRunningExpressApp } from '../utils/getRunningExpressApp'
import { validateFileMimeTypeAndExtensionMatch } from './fileValidation'
import { validateFlowAPIKey } from './validateKey'
import logger from './logger'
import { checkPredictions, checkStorage, updatePredictionsUsage, updateStorageUsage } from './quotaUsage'
import { getErrorMessage } from '../errors/utils'
import { FLOWISE_METRIC_COUNTERS, FLOWISE_COUNTER_STATUS, IMetricsProvider } from '../Interface.Metrics'
import { OMIT_QUEUE_JOB_DATA } from './constants'
import { executeAgentFlow } from './buildAgentflow'
import { Workspace } from '../enterprise/database/entities/workspace.entity'
import { Organization } from '../enterprise/database/entities/organization.entity'

const assertAgentflow = (chatflow: ChatFlow) => {
    if (chatflow.type !== 'AGENTFLOW') {
        throw new InternalFlowiseError(
            StatusCodes.BAD_REQUEST,
            `Flow type ${chatflow.type} is not supported, only AGENTFLOW can be executed`
        )
    }
}

/*
 * Prepare uploads and files, then execute the agentflow
 */
export const executeFlow = async ({
    componentNodes,
    incomingInput,
    chatflow,
    chatId,
    evaluationRunId,
    appDataSource,
    telemetry,
    cachePool,
    usageCacheManager,
    sseStreamer,
    baseURL,
    isInternal,
    files,
    signal,
    isTool,
    chatType,
    orgId,
    workspaceId,
    subscriptionId,
    productId
}: IExecuteFlowParams) => {
    assertAgentflow(chatflow)

    // Ensure incomingInput has all required properties with default values
    incomingInput = {
        history: [],
        streaming: false,
        ...incomingInput
    }

    let overrideConfig = incomingInput.overrideConfig ?? {}
    const uploads = incomingInput.uploads
    const chatflowid = chatflow.id

    /* Process file uploads from the chat
     * - Images
     * - Files
     * - Audio
     */
    let fileUploads: IFileUpload[] = []
    let uploadedFilesContent = ''
    if (uploads) {
        fileUploads = uploads
        for (let i = 0; i < fileUploads.length; i += 1) {
            await checkStorage(orgId, subscriptionId, usageCacheManager)

            const upload = fileUploads[i]

            // if upload in an image or audio
            if ((upload.type === 'file' || upload.type === 'audio') && upload.data) {
                const filename = upload.name
                const splitDataURI = upload.data.split(',')
                const bf = Buffer.from(splitDataURI.pop() || '', 'base64')
                const mime = splitDataURI[0].split(':')[1].split(';')[0]

                // Validate file extension, MIME type, and content to prevent security vulnerabilities
                validateFileMimeTypeAndExtensionMatch(filename, mime)

                const { totalSize } = await addSingleFileToStorage(mime, bf, filename, orgId, chatflowid, chatId)
                await updateStorageUsage(orgId, workspaceId, totalSize, usageCacheManager)
                upload.type = 'stored-file'
                // Omit upload.data since we don't store the content in database
                fileUploads[i] = omit(upload, ['data'])
            }

            if (upload.type === 'url' && upload.data) {
                const filename = upload.name
                const urlData = upload.data
                fileUploads[i] = { data: urlData, name: filename, type: 'url', mime: upload.mime ?? 'image/png' }
            }

            // Run Speech to Text conversion
            if (upload.mime === 'audio/webm' || upload.mime === 'audio/mp4' || upload.mime === 'audio/ogg') {
                logger.debug(`[server]: [${orgId}]: Attempting a speech to text conversion...`)
                let speechToTextConfig: ICommonObject = {}
                if (chatflow.speechToText) {
                    const speechToTextProviders = JSON.parse(chatflow.speechToText)
                    for (const provider in speechToTextProviders) {
                        const providerObj = speechToTextProviders[provider]
                        if (providerObj.status) {
                            speechToTextConfig = providerObj
                            speechToTextConfig['name'] = provider
                            break
                        }
                    }
                }
                if (speechToTextConfig) {
                    const options: ICommonObject = {
                        orgId,
                        chatId,
                        chatflowid,
                        appDataSource,
                        databaseEntities: databaseEntities
                    }
                    const speechToTextResult = await convertSpeechToText(upload, speechToTextConfig, options)
                    logger.debug(`[server]: [${orgId}]: Speech to text result: ${speechToTextResult}`)
                    if (speechToTextResult) {
                        incomingInput.question = speechToTextResult
                    }
                }
            }

            if (upload.type === 'file:full' && upload.data) {
                upload.type = 'stored-file:full'
                // Omit upload.data since we don't store the content in database
                uploadedFilesContent += `<doc name='${upload.name}'>${upload.data}</doc>\n\n`
                fileUploads[i] = omit(upload, ['data'])
            }
        }
    }

    // Process form data body with files
    if (files?.length) {
        overrideConfig = { ...incomingInput }
        for (const file of files) {
            await checkStorage(orgId, subscriptionId, usageCacheManager)

            const fileNames: string[] = []
            const fileBuffer = await getFileFromUpload(file.path ?? file.key)
            // Address file name with special characters: https://github.com/expressjs/multer/issues/1104
            file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8')

            // Validate file extension, MIME type, and content to prevent security vulnerabilities
            validateFileMimeTypeAndExtensionMatch(file.originalname, file.mimetype)

            const { path: storagePath, totalSize } = await addArrayFilesToStorage(
                file.mimetype,
                fileBuffer,
                file.originalname,
                fileNames,
                orgId,
                chatflowid
            )
            await updateStorageUsage(orgId, workspaceId, totalSize, usageCacheManager)

            const fileInputFieldFromMimeType = mapMimeTypeToInputField(file.mimetype)

            const fileExtension = path.extname(file.originalname)

            const fileInputFieldFromExt = mapExtToInputField(fileExtension)

            let fileInputField = 'txtFile'

            if (fileInputFieldFromExt !== 'txtFile') {
                fileInputField = fileInputFieldFromExt
            } else if (fileInputFieldFromMimeType !== 'txtFile') {
                fileInputField = fileInputFieldFromExt
            }

            if (overrideConfig[fileInputField]) {
                const existingFileInputField = overrideConfig[fileInputField].replace('FILE-STORAGE::', '')
                const existingFileInputFieldArray = JSON.parse(existingFileInputField)

                const newFileInputField = storagePath.replace('FILE-STORAGE::', '')
                const newFileInputFieldArray = JSON.parse(newFileInputField)

                const updatedFieldArray = existingFileInputFieldArray.concat(newFileInputFieldArray)

                overrideConfig[fileInputField] = `FILE-STORAGE::${JSON.stringify(updatedFieldArray)}`
            } else {
                overrideConfig[fileInputField] = storagePath
            }

            await removeSpecificFileFromUpload(file.path ?? file.key)
        }
        if (overrideConfig.vars && typeof overrideConfig.vars === 'string') {
            overrideConfig.vars = JSON.parse(overrideConfig.vars)
        }
        incomingInput = {
            ...incomingInput,
            overrideConfig,
            chatId
        }
    }

    return executeAgentFlow({
        componentNodes,
        incomingInput,
        chatflow,
        chatId,
        evaluationRunId,
        appDataSource,
        telemetry,
        cachePool,
        usageCacheManager,
        sseStreamer,
        baseURL,
        isInternal,
        chatType,
        uploadedFilesContent,
        fileUploads,
        signal,
        isTool,
        orgId,
        workspaceId,
        subscriptionId,
        productId
    })
}

/**
 * Build/Data Preparation for execute function
 * @param {Request} req
 * @param {boolean} isInternal
 */
export const utilBuildChatflow = async (req: Request, isInternal: boolean = false, chatType?: ChatType): Promise<any> => {
    const appServer = getRunningExpressApp()

    const chatflowid = req.params.id

    // Check if chatflow exists
    const chatflow = await appServer.AppDataSource.getRepository(ChatFlow).findOneBy({
        id: chatflowid
    })
    if (!chatflow) {
        throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Chatflow ${chatflowid} not found`)
    }
    assertAgentflow(chatflow)

    const httpProtocol = req.get('x-forwarded-proto') || req.protocol
    const baseURL = `${httpProtocol}://${req.get('host')}`
    const incomingInput: IncomingInput = req.body || {} // Ensure incomingInput is never undefined
    const chatId = incomingInput.chatId ?? incomingInput.overrideConfig?.sessionId ?? uuidv4()
    const files = (req.files as Express.Multer.File[]) || []
    const abortControllerId = `${chatflow.id}_${chatId}`
    const isTool = req.get('flowise-tool') === 'true'
    const isEvaluation: boolean = req.headers['X-Flowise-Evaluation'] || req.body.evaluation
    const evaluationRunId = req.body.evaluationRunId

    let organizationId = ''

    try {
        // Validate API Key if its external API request
        if (!isInternal) {
            const isKeyValidated = await validateFlowAPIKey(req, chatflow)
            if (!isKeyValidated) {
                throw new InternalFlowiseError(StatusCodes.UNAUTHORIZED, `Unauthorized`)
            }
        }

        // This can be public API, so we can only get orgId from the chatflow
        const chatflowWorkspaceId = chatflow.workspaceId
        const workspace = await appServer.AppDataSource.getRepository(Workspace).findOneBy({
            id: chatflowWorkspaceId
        })
        if (!workspace) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Workspace ${chatflowWorkspaceId} not found`)
        }
        const workspaceId = workspace.id

        const org = await appServer.AppDataSource.getRepository(Organization).findOneBy({
            id: workspace.organizationId
        })
        if (!org) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Organization ${workspace.organizationId} not found`)
        }

        const orgId = org.id
        organizationId = orgId
        const subscriptionId = org.subscriptionId as string
        const productId = await appServer.identityManager.getProductIdFromSubscription(subscriptionId)

        await checkPredictions(orgId, subscriptionId, appServer.usageCacheManager)

        const executeData: IExecuteFlowParams = {
            incomingInput, // Use the defensively created incomingInput variable
            chatflow,
            chatId,
            baseURL,
            isInternal,
            files,
            isEvaluation,
            evaluationRunId,
            appDataSource: appServer.AppDataSource,
            sseStreamer: appServer.sseStreamer,
            telemetry: appServer.telemetry,
            cachePool: appServer.cachePool,
            componentNodes: appServer.nodesPool.componentNodes,
            isTool, // used to disable streaming if incoming request its from ChatflowTool
            chatType,
            usageCacheManager: appServer.usageCacheManager,
            orgId,
            workspaceId,
            subscriptionId,
            productId
        }

        if (process.env.MODE === MODE.QUEUE) {
            const predictionQueue = appServer.queueManager.getQueue('prediction')
            const job = await predictionQueue.addJob(omit(executeData, OMIT_QUEUE_JOB_DATA))
            logger.debug(`[server]: [${orgId}/${chatflow.id}/${chatId}]: Job added to queue: ${job.id}`)

            const queueEvents = predictionQueue.getQueueEvents()
            const result = await job.waitUntilFinished(queueEvents)
            appServer.abortControllerPool.remove(abortControllerId)
            if (!result) {
                throw new Error('Job execution failed')
            }
            await updatePredictionsUsage(orgId, subscriptionId, workspaceId, appServer.usageCacheManager)
            incrementSuccessMetricCounter(appServer.metricsProvider, isInternal)
            return result
        } else {
            // Add abort controller to the pool
            const signal = new AbortController()
            appServer.abortControllerPool.add(abortControllerId, signal)
            executeData.signal = signal

            const result = await executeFlow(executeData)

            appServer.abortControllerPool.remove(abortControllerId)
            await updatePredictionsUsage(orgId, subscriptionId, workspaceId, appServer.usageCacheManager)
            incrementSuccessMetricCounter(appServer.metricsProvider, isInternal)
            return result
        }
    } catch (e) {
        logger.error(`[server]:${organizationId}/${chatflow.id}/${chatId} Error:`, e)
        appServer.abortControllerPool.remove(`${chatflow.id}_${chatId}`)
        incrementFailedMetricCounter(appServer.metricsProvider, isInternal)
        if (e instanceof InternalFlowiseError && e.statusCode === StatusCodes.UNAUTHORIZED) {
            throw e
        } else {
            throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, getErrorMessage(e))
        }
    }
}

/**
 * Increment success metric counter
 * @param {IMetricsProvider} metricsProvider
 * @param {boolean} isInternal
 */
const incrementSuccessMetricCounter = (metricsProvider: IMetricsProvider, isInternal: boolean) => {
    metricsProvider?.incrementCounter(
        isInternal ? FLOWISE_METRIC_COUNTERS.CHATFLOW_PREDICTION_INTERNAL : FLOWISE_METRIC_COUNTERS.CHATFLOW_PREDICTION_EXTERNAL,
        { status: FLOWISE_COUNTER_STATUS.SUCCESS }
    )
}

/**
 * Increment failed metric counter
 * @param {IMetricsProvider} metricsProvider
 * @param {boolean} isInternal
 */
const incrementFailedMetricCounter = (metricsProvider: IMetricsProvider, isInternal: boolean) => {
    metricsProvider?.incrementCounter(
        isInternal ? FLOWISE_METRIC_COUNTERS.CHATFLOW_PREDICTION_INTERNAL : FLOWISE_METRIC_COUNTERS.CHATFLOW_PREDICTION_EXTERNAL,
        { status: FLOWISE_COUNTER_STATUS.FAILURE }
    )
}
