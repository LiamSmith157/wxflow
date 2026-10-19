import { StatusCodes } from 'http-status-codes'
import { ChatFlow } from '../database/entities/ChatFlow'
import { getRunningExpressApp } from '../utils/getRunningExpressApp'
import { IUploadFileSizeAndTypes, IReactFlowNode } from '../Interface'
import { InternalFlowiseError } from '../errors/internalFlowiseError'

type IUploadConfig = {
    isSpeechToTextEnabled: boolean
    isImageUploadAllowed: boolean
    isRAGFileUploadAllowed: boolean
    imgUploadSizeAndTypes: IUploadFileSizeAndTypes[]
    fileUploadSizeAndTypes: IUploadFileSizeAndTypes[]
}

/**
 * Method that checks if uploads are enabled in the chatflow
 * @param {string} chatflowid
 */
export const utilGetUploadsConfig = async (chatflowid: string): Promise<IUploadConfig> => {
    const appServer = getRunningExpressApp()
    const chatflow = await appServer.AppDataSource.getRepository(ChatFlow).findOneBy({
        id: chatflowid
    })
    if (!chatflow) {
        throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Chatflow ${chatflowid} not found`)
    }

    const flowObj = JSON.parse(chatflow.flowData)
    const nodes: IReactFlowNode[] = flowObj.nodes

    let isSpeechToTextEnabled = false
    let isImageUploadAllowed = false

    /*
     * Check for STT
     */
    if (chatflow.speechToText) {
        const speechToTextProviders = JSON.parse(chatflow.speechToText)
        for (const provider in speechToTextProviders) {
            if (provider !== 'none') {
                const providerObj = speechToTextProviders[provider]
                if (providerObj.status) {
                    isSpeechToTextEnabled = true
                    break
                }
            }
        }
    }

    /*
     * Condition for isImageUploadAllowed
     * 1.) one of the agentflow nodes has allowImageUploads ON in its model config
     */
    const imgUploadSizeAndTypes: IUploadFileSizeAndTypes[] = []
    nodes.forEach((node) => {
        if (node.data.category === 'Agent Flows') {
            if (
                node.data.inputs?.agentModelConfig?.allowImageUploads ||
                node.data.inputs?.llmModelConfig?.allowImageUploads ||
                node.data.inputs?.conditionAgentModelConfig?.allowImageUploads
            ) {
                imgUploadSizeAndTypes.push({
                    fileTypes: 'image/gif;image/jpeg;image/png;image/webp;'.split(';'),
                    maxUploadSize: 5
                })
                isImageUploadAllowed = true
            }
        }
    })

    return {
        isSpeechToTextEnabled,
        isImageUploadAllowed,
        isRAGFileUploadAllowed: false,
        imgUploadSizeAndTypes,
        fileUploadSizeAndTypes: []
    }
}
