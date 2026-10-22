import { StatusCodes } from 'http-status-codes'
import { EntityManager, In, QueryRunner } from 'typeorm'
import { v4 as uuidv4 } from 'uuid'
import { ChatFlow } from '../../database/entities/ChatFlow'
import { ChatMessage } from '../../database/entities/ChatMessage'
import { ChatMessageFeedback } from '../../database/entities/ChatMessageFeedback'
import { DocumentStore } from '../../database/entities/DocumentStore'
import { DocumentStoreFileChunk } from '../../database/entities/DocumentStoreFileChunk'
import { Execution } from '../../database/entities/Execution'
import { Tool } from '../../database/entities/Tool'
import { Variable } from '../../database/entities/Variable'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import { getErrorMessage } from '../../errors/utils'
import chatflowService from '../chatflows'
import chatMessagesService from '../chat-messages'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { utilGetChatMessage } from '../../utils/getChatMessage'
import { getStoragePath, parseJsonBody } from 'wxflow-components'
import path from 'path'
import { checkUsageLimit } from '../../utils/quotaUsage'
import documenStoreService from '../documentstore'
import executionService, { ExecutionFilters } from '../executions'
import toolsService from '../tools'
import variableService from '../variables'
import { ChatMessageRatingType, ChatType, Platform } from '../../Interface'
import { sanitizeNullBytes } from '../../utils/sanitize.util'

type ExportInput = {
    agentflowv2: boolean
    chat_message: boolean
    chat_feedback: boolean
    document_store: boolean
    execution: boolean
    tool: boolean
    variable: boolean
}

type ExportData = {
    AgentFlowV2: ChatFlow[]
    ChatMessage: ChatMessage[]
    ChatMessageFeedback: ChatMessageFeedback[]
    DocumentStore: DocumentStore[]
    DocumentStoreFileChunk: DocumentStoreFileChunk[]
    Execution: Execution[]
    Tool: Tool[]
    Variable: Variable[]
}

const convertExportInput = (body: any): ExportInput => {
    try {
        if (!body || typeof body !== 'object') throw new Error('Invalid ExportInput object in request body')
        if (body.agentflowv2 && typeof body.agentflowv2 !== 'boolean') throw new Error('Invalid agentflowv2 property in ExportInput object')
        if (body.chat_message && typeof body.chat_message !== 'boolean')
            throw new Error('Invalid chat_message property in ExportInput object')
        if (body.chat_feedback && typeof body.chat_feedback !== 'boolean')
            throw new Error('Invalid chat_feedback property in ExportInput object')
        if (body.document_store && typeof body.document_store !== 'boolean')
            throw new Error('Invalid document_store property in ExportInput object')
        if (body.execution && typeof body.execution !== 'boolean') throw new Error('Invalid execution property in ExportInput object')
        if (body.tool && typeof body.tool !== 'boolean') throw new Error('Invalid tool property in ExportInput object')
        if (body.variable && typeof body.variable !== 'boolean') throw new Error('Invalid variable property in ExportInput object')
        return body as ExportInput
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: exportImportService.convertExportInput - ${getErrorMessage(error)}`
        )
    }
}

const FileDefaultName = 'ExportData.json'
const exportData = async (exportInput: ExportInput, activeWorkspaceId: string): Promise<{ FileDefaultName: string } & ExportData> => {
    try {
        let AgentFlowV2: ChatFlow[] | { data: ChatFlow[]; total: number } =
            exportInput.agentflowv2 === true ? await chatflowService.getAllChatflows('AGENTFLOW', activeWorkspaceId) : []
        AgentFlowV2 = 'data' in AgentFlowV2 ? AgentFlowV2.data : AgentFlowV2

        let allChatflow: ChatFlow[] | { data: ChatFlow[]; total: number } =
            exportInput.chat_message === true || exportInput.chat_feedback === true
                ? await chatflowService.getAllChatflows(undefined, activeWorkspaceId)
                : []
        allChatflow = 'data' in allChatflow ? allChatflow.data : allChatflow
        const chatflowIds = allChatflow.map((chatflow) => chatflow.id)

        let ChatMessage: ChatMessage[] =
            exportInput.chat_message === true ? await chatMessagesService.getMessagesByChatflowIds(chatflowIds) : []

        let ChatMessageFeedback: ChatMessageFeedback[] =
            exportInput.chat_feedback === true ? await chatMessagesService.getMessagesFeedbackByChatflowIds(chatflowIds) : []

        let DocumentStore: DocumentStore[] | { data: DocumentStore[]; total: number } =
            exportInput.document_store === true ? await documenStoreService.getAllDocumentStores(activeWorkspaceId) : []
        DocumentStore = 'data' in DocumentStore ? DocumentStore.data : DocumentStore

        const documentStoreIds = DocumentStore.map((documentStore) => documentStore.id)

        let DocumentStoreFileChunk: DocumentStoreFileChunk[] =
            exportInput.document_store === true
                ? await documenStoreService.getAllDocumentFileChunksByDocumentStoreIds(documentStoreIds)
                : []

        const filters: ExecutionFilters = { workspaceId: activeWorkspaceId }
        const { data: totalExecutions } = exportInput.execution === true ? await executionService.getAllExecutions(filters) : { data: [] }
        let Execution: Execution[] = exportInput.execution === true ? totalExecutions : []

        let Tool: Tool[] | { data: Tool[]; total: number } =
            exportInput.tool === true ? await toolsService.getAllTools(activeWorkspaceId) : []
        Tool = 'data' in Tool ? Tool.data : Tool

        let Variable: Variable[] | { data: Variable[]; total: number } =
            exportInput.variable === true ? await variableService.getAllVariables(activeWorkspaceId) : []
        const variables = 'data' in Variable ? Variable.data : Variable
        Variable = variables.map((v) => ({ ...v, value: '' }))

        return {
            FileDefaultName,
            AgentFlowV2,
            ChatMessage,
            ChatMessageFeedback,
            DocumentStore,
            DocumentStoreFileChunk,
            Execution,
            Tool,
            Variable
        }
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: exportImportService.exportData - ${getErrorMessage(error)}`
        )
    }
}

async function replaceDuplicateIdsForChatFlow(queryRunner: QueryRunner, originalData: ExportData, chatflows: ChatFlow[]) {
    try {
        const ids = chatflows.map((chatflow) => chatflow.id)
        const records = await queryRunner.manager.find(ChatFlow, {
            where: { id: In(ids) }
        })
        if (records.length < 0) return originalData
        for (let record of records) {
            const oldId = record.id
            const newId = uuidv4()
            originalData = JSON.parse(JSON.stringify(originalData).replaceAll(oldId, newId))
        }
        return originalData
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: exportImportService.replaceDuplicateIdsForChatflow - ${getErrorMessage(error)}`
        )
    }
}

async function replaceDuplicateIdsForChatMessage(
    queryRunner: QueryRunner,
    originalData: ExportData,
    chatMessages: ChatMessage[],
    activeWorkspaceId?: string
) {
    try {
        const chatmessageChatflowIds = chatMessages.map((chatMessage) => {
            return { id: chatMessage.chatflowid, qty: 0 }
        })
        const originalDataChatflowIds = [...originalData.AgentFlowV2.map((agentFlowV2) => agentFlowV2.id)]
        chatmessageChatflowIds.forEach((item) => {
            if (originalDataChatflowIds.includes(item.id)) {
                item.qty += 1
            }
        })
        const databaseChatflowIds = await (
            await queryRunner.manager.find(ChatFlow, {
                where: {
                    id: In(chatmessageChatflowIds.map((chatmessageChatflowId) => chatmessageChatflowId.id)),
                    workspaceId: activeWorkspaceId
                }
            })
        ).map((chatflow) => chatflow.id)
        chatmessageChatflowIds.forEach((item) => {
            if (databaseChatflowIds.includes(item.id)) {
                item.qty += 1
            }
        })

        const missingChatflowIds = chatmessageChatflowIds.filter((item) => item.qty === 0).map((item) => item.id)
        if (missingChatflowIds.length > 0) {
            chatMessages = chatMessages.filter((chatMessage) => !missingChatflowIds.includes(chatMessage.chatflowid))
            originalData.ChatMessage = chatMessages
        }

        const ids = chatMessages.map((chatMessage) => chatMessage.id)
        const records = await queryRunner.manager.find(ChatMessage, {
            where: { id: In(ids) }
        })
        if (records.length < 0) return originalData

        // Replace duplicate ChatMessage ids found in db with new ids,
        // and update corresponding messageId references in ChatMessageFeedback
        const idMap: { [key: string]: string } = {}
        const dbExistingIds = new Set(records.map((record) => record.id))
        originalData.ChatMessage = originalData.ChatMessage.map((item) => {
            if (dbExistingIds.has(item.id)) {
                const newId = uuidv4()
                idMap[item.id] = newId
                return { ...item, id: newId }
            }
            return item
        })
        originalData.ChatMessageFeedback = originalData.ChatMessageFeedback.map((item) => {
            if (idMap[item.messageId]) {
                return { ...item, messageId: idMap[item.messageId] }
            }
            return item
        })
        return originalData
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: exportImportService.replaceDuplicateIdsForChatMessage - ${getErrorMessage(error)}`
        )
    }
}

async function replaceExecutionIdForChatMessage(
    queryRunner: QueryRunner,
    originalData: ExportData,
    chatMessages: ChatMessage[],
    activeWorkspaceId?: string
) {
    try {
        // step 1 - get all execution ids from chatMessages
        const chatMessageExecutionIds = chatMessages
            .map((chatMessage) => {
                return { id: chatMessage.executionId, qty: 0 }
            })
            .filter((item): item is { id: string; qty: number } => item !== undefined)

        // step 2 - increase qty if execution id is in importData.Execution
        const originalDataExecutionIds = originalData.Execution.map((execution) => execution.id)
        chatMessageExecutionIds.forEach((item) => {
            if (originalDataExecutionIds.includes(item.id)) {
                item.qty += 1
            }
        })

        // step 3 - increase qty if execution id is in database
        const databaseExecutionIds = await (
            await queryRunner.manager.find(Execution, {
                where: {
                    id: In(chatMessageExecutionIds.map((chatMessageExecutionId) => chatMessageExecutionId.id)),
                    workspaceId: activeWorkspaceId
                }
            })
        ).map((execution) => execution.id)
        chatMessageExecutionIds.forEach((item) => {
            if (databaseExecutionIds.includes(item.id)) {
                item.qty += 1
            }
        })

        // step 4 - if executionIds not found replace with NULL
        const missingExecutionIds = chatMessageExecutionIds.filter((item) => item.qty === 0).map((item) => item.id)
        chatMessages.forEach((chatMessage) => {
            if (chatMessage.executionId && missingExecutionIds.includes(chatMessage.executionId)) {
                delete chatMessage.executionId
            }
        })

        originalData.ChatMessage = chatMessages

        return originalData
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: exportImportService.replaceExecutionIdForChatMessage - ${getErrorMessage(error)}`
        )
    }
}

async function replaceDuplicateIdsForChatMessageFeedback(
    queryRunner: QueryRunner,
    originalData: ExportData,
    chatMessageFeedbacks: ChatMessageFeedback[],
    activeWorkspaceId?: string
) {
    try {
        const feedbackChatflowIds = chatMessageFeedbacks.map((feedback) => {
            return { id: feedback.chatflowid, qty: 0 }
        })
        const originalDataChatflowIds = [...originalData.AgentFlowV2.map((agentFlowV2) => agentFlowV2.id)]
        feedbackChatflowIds.forEach((item) => {
            if (originalDataChatflowIds.includes(item.id)) {
                item.qty += 1
            }
        })
        const databaseChatflowIds = await (
            await queryRunner.manager.find(ChatFlow, {
                where: { id: In(feedbackChatflowIds.map((feedbackChatflowId) => feedbackChatflowId.id)), workspaceId: activeWorkspaceId }
            })
        ).map((chatflow) => chatflow.id)
        feedbackChatflowIds.forEach((item) => {
            if (databaseChatflowIds.includes(item.id)) {
                item.qty += 1
            }
        })

        const feedbackMessageIds = chatMessageFeedbacks.map((feedback) => {
            return { id: feedback.messageId, qty: 0 }
        })
        const originalDataMessageIds = originalData.ChatMessage.map((chatMessage) => chatMessage.id)
        feedbackMessageIds.forEach((item) => {
            if (originalDataMessageIds.includes(item.id)) {
                item.qty += 1
            }
        })
        const databaseMessageIds = await (
            await queryRunner.manager.find(ChatMessage, {
                where: { id: In(feedbackMessageIds.map((feedbackMessageId) => feedbackMessageId.id)) }
            })
        ).map((chatMessage) => chatMessage.id)
        feedbackMessageIds.forEach((item) => {
            if (databaseMessageIds.includes(item.id)) {
                item.qty += 1
            }
        })

        const missingChatflowIds = feedbackChatflowIds.filter((item) => item.qty === 0).map((item) => item.id)
        const missingMessageIds = feedbackMessageIds.filter((item) => item.qty === 0).map((item) => item.id)

        if (missingChatflowIds.length > 0 || missingMessageIds.length > 0) {
            chatMessageFeedbacks = chatMessageFeedbacks.filter(
                (feedback) => !missingChatflowIds.includes(feedback.chatflowid) && !missingMessageIds.includes(feedback.messageId)
            )
            originalData.ChatMessageFeedback = chatMessageFeedbacks
        }

        const ids = chatMessageFeedbacks.map((chatMessageFeedback) => chatMessageFeedback.id)
        const records = await queryRunner.manager.find(ChatMessageFeedback, {
            where: { id: In(ids) }
        })

        // remove duplicate messageId
        const seenMessageIds = new Set()
        originalData.ChatMessageFeedback = originalData.ChatMessageFeedback.filter((feedback) => {
            if (seenMessageIds.has(feedback.messageId)) {
                return false
            }
            seenMessageIds.add(feedback.messageId)
            return true
        })

        if (records.length < 0) return originalData

        // replace duplicate ids found in db to new id
        const dbExistingIds = new Set(records.map((record) => record.id))
        originalData.ChatMessageFeedback = originalData.ChatMessageFeedback.map((item) => {
            if (dbExistingIds.has(item.id)) {
                const newId = uuidv4()
                return { ...item, id: newId }
            }
            return item
        })
        return originalData
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: exportImportService.replaceDuplicateIdsForChatMessageFeedback - ${getErrorMessage(error)}`
        )
    }
}

async function replaceDuplicateIdsForDocumentStore(queryRunner: QueryRunner, originalData: ExportData, documentStores: DocumentStore[]) {
    try {
        const ids = documentStores.map((documentStore) => documentStore.id)
        const records = await queryRunner.manager.find(DocumentStore, {
            where: { id: In(ids) }
        })
        if (records.length < 0) return originalData
        for (let record of records) {
            const oldId = record.id
            const newId = uuidv4()
            originalData = JSON.parse(JSON.stringify(originalData).replaceAll(oldId, newId))
        }
        return originalData
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: exportImportService.replaceDuplicateIdsForDocumentStore - ${getErrorMessage(error)}`
        )
    }
}

async function replaceDuplicateIdsForDocumentStoreFileChunk(
    queryRunner: QueryRunner,
    originalData: ExportData,
    documentStoreFileChunks: DocumentStoreFileChunk[]
) {
    try {
        const ids = documentStoreFileChunks.map((documentStoreFileChunk) => documentStoreFileChunk.id)
        const records = await queryRunner.manager.find(DocumentStoreFileChunk, {
            where: { id: In(ids) }
        })
        if (records.length < 0) return originalData

        // replace duplicate ids found in db to new id
        const dbExistingIds = new Set(records.map((record) => record.id))
        originalData.DocumentStoreFileChunk = originalData.DocumentStoreFileChunk.map((item) => {
            if (dbExistingIds.has(item.id)) {
                return { ...item, id: uuidv4() }
            }
            return item
        })
        return originalData
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: exportImportService.replaceDuplicateIdsForDocumentStoreFileChunk - ${getErrorMessage(error)}`
        )
    }
}

async function replaceDuplicateIdsForTool(queryRunner: QueryRunner, originalData: ExportData, tools: Tool[]) {
    try {
        const ids = tools.map((tool) => tool.id)
        const records = await queryRunner.manager.find(Tool, {
            where: { id: In(ids) }
        })
        if (records.length < 0) return originalData
        for (let record of records) {
            const oldId = record.id
            const newId = uuidv4()
            originalData = JSON.parse(JSON.stringify(originalData).replaceAll(oldId, newId))
        }
        return originalData
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: exportImportService.replaceDuplicateIdsForTool - ${getErrorMessage(error)}`
        )
    }
}

async function replaceDuplicateIdsForVariable(queryRunner: QueryRunner, originalData: ExportData, variables: Variable[]) {
    try {
        const ids = variables.map((variable) => variable.id)
        const records = await queryRunner.manager.find(Variable, {
            where: { id: In(ids) }
        })
        if (getRunningExpressApp().identityManager.getPlatformType() === Platform.CLOUD)
            originalData.Variable = originalData.Variable.filter((variable) => variable.type !== 'runtime')
        if (records.length < 0) return originalData
        for (let record of records) {
            const oldId = record.id
            const newId = uuidv4()
            originalData = JSON.parse(JSON.stringify(originalData).replaceAll(oldId, newId))
        }
        return originalData
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: exportImportService.replaceDuplicateIdsForVariable - ${getErrorMessage(error)}`
        )
    }
}

async function replaceDuplicateIdsForExecution(queryRunner: QueryRunner, originalData: ExportData, executions: Execution[]) {
    try {
        const ids = executions.map((execution) => execution.id)
        const records = await queryRunner.manager.find(Execution, {
            where: { id: In(ids) }
        })
        if (records.length < 0) return originalData
        for (let record of records) {
            const oldId = record.id
            const newId = uuidv4()
            originalData = JSON.parse(JSON.stringify(originalData).replaceAll(oldId, newId))
        }
        return originalData
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: exportImportService.replaceDuplicateIdsForExecution - ${getErrorMessage(error)}`
        )
    }
}

function reduceSpaceForChatflowFlowData(chatflows: ChatFlow[]) {
    return chatflows.map((chatflow) => {
        return { ...chatflow, flowData: JSON.stringify(JSON.parse(chatflow.flowData)) }
    })
}

function insertWorkspaceId(importedData: any, activeWorkspaceId?: string) {
    if (!activeWorkspaceId) return importedData
    importedData.forEach((item: any) => {
        item.workspaceId = activeWorkspaceId
    })
    return importedData
}

async function saveBatch(manager: EntityManager, entity: any, items: any[], batchSize = 900) {
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize)
        await manager.save(entity, batch)
    }
}

const REMOVED_SEGMENTS = [
    'AgentFlow',
    'AssistantFlow',
    'ChatFlow',
    'AssistantCustom',
    'AssistantOpenAI',
    'AssistantAzure',
    'CustomTemplate'
]

function assertSupportedImportData(importData: ExportData) {
    const raw = importData as unknown as Record<string, unknown>
    const unsupported = REMOVED_SEGMENTS.filter((segment) => Array.isArray(raw[segment]) && (raw[segment] as unknown[]).length > 0)
    if ((importData.AgentFlowV2 ?? []).some((flow) => flow.type !== 'AGENTFLOW'))
        unsupported.push('AgentFlowV2 (flows that are not AGENTFLOW)')
    if (unsupported.length > 0) {
        throw new InternalFlowiseError(
            StatusCodes.BAD_REQUEST,
            `Error: exportImportService.importAll - unsupported data in import file: ${unsupported.join(', ')}`
        )
    }
}

const importData = async (importData: ExportData, orgId: string, activeWorkspaceId: string, subscriptionId: string) => {
    assertSupportedImportData(importData)

    // Initialize missing properties with empty arrays to avoid "undefined" errors
    importData.AgentFlowV2 = importData.AgentFlowV2 || []
    importData.ChatMessage = importData.ChatMessage || []
    importData.ChatMessageFeedback = importData.ChatMessageFeedback || []
    importData.DocumentStore = importData.DocumentStore || []
    importData.DocumentStoreFileChunk = importData.DocumentStoreFileChunk || []
    importData.Execution = importData.Execution || []
    importData.Tool = importData.Tool || []
    importData.Variable = importData.Variable || []

    let queryRunner: QueryRunner
    try {
        queryRunner = getRunningExpressApp().AppDataSource.createQueryRunner()
        await queryRunner.connect()

        try {
            if (importData.AgentFlowV2.length > 0) {
                importData.AgentFlowV2 = reduceSpaceForChatflowFlowData(importData.AgentFlowV2)
                importData.AgentFlowV2 = insertWorkspaceId(importData.AgentFlowV2, activeWorkspaceId)
                const existingChatflowCount = await chatflowService.getAllChatflowsCountByOrganization('AGENTFLOW', orgId)
                const newChatflowCount = importData.AgentFlowV2.length
                await checkUsageLimit(
                    'flows',
                    subscriptionId,
                    getRunningExpressApp().usageCacheManager,
                    existingChatflowCount + newChatflowCount
                )
                importData = await replaceDuplicateIdsForChatFlow(queryRunner, importData, importData.AgentFlowV2)
            }
            if (importData.ChatMessage.length > 0) {
                importData = await replaceDuplicateIdsForChatMessage(queryRunner, importData, importData.ChatMessage, activeWorkspaceId)
                importData = await replaceExecutionIdForChatMessage(queryRunner, importData, importData.ChatMessage, activeWorkspaceId)
            }
            if (importData.ChatMessageFeedback.length > 0)
                importData = await replaceDuplicateIdsForChatMessageFeedback(
                    queryRunner,
                    importData,
                    importData.ChatMessageFeedback,
                    activeWorkspaceId
                )
            if (importData.DocumentStore.length > 0) {
                importData.DocumentStore = insertWorkspaceId(importData.DocumentStore, activeWorkspaceId)
                importData = await replaceDuplicateIdsForDocumentStore(queryRunner, importData, importData.DocumentStore)
            }
            if (importData.DocumentStoreFileChunk.length > 0)
                importData = await replaceDuplicateIdsForDocumentStoreFileChunk(queryRunner, importData, importData.DocumentStoreFileChunk)
            if (importData.Tool.length > 0) {
                importData.Tool = insertWorkspaceId(importData.Tool, activeWorkspaceId)
                importData = await replaceDuplicateIdsForTool(queryRunner, importData, importData.Tool)
            }
            if (importData.Execution.length > 0) {
                importData.Execution = insertWorkspaceId(importData.Execution, activeWorkspaceId)
                importData = await replaceDuplicateIdsForExecution(queryRunner, importData, importData.Execution)
            }
            if (importData.Variable.length > 0) {
                importData.Variable = insertWorkspaceId(importData.Variable, activeWorkspaceId)
                importData = await replaceDuplicateIdsForVariable(queryRunner, importData, importData.Variable)
            }

            importData = sanitizeNullBytes(importData)

            await queryRunner.startTransaction()

            if (importData.AgentFlowV2.length > 0) await queryRunner.manager.save(ChatFlow, importData.AgentFlowV2)
            if (importData.ChatMessage.length > 0) await saveBatch(queryRunner.manager, ChatMessage, importData.ChatMessage)
            if (importData.ChatMessageFeedback.length > 0)
                await queryRunner.manager.save(ChatMessageFeedback, importData.ChatMessageFeedback)
            if (importData.DocumentStore.length > 0) await queryRunner.manager.save(DocumentStore, importData.DocumentStore)
            if (importData.DocumentStoreFileChunk.length > 0)
                await saveBatch(queryRunner.manager, DocumentStoreFileChunk, importData.DocumentStoreFileChunk)
            if (importData.Tool.length > 0) await queryRunner.manager.save(Tool, importData.Tool)
            if (importData.Execution.length > 0) await queryRunner.manager.save(Execution, importData.Execution)
            if (importData.Variable.length > 0) await queryRunner.manager.save(Variable, importData.Variable)

            await queryRunner.commitTransaction()
        } catch (error) {
            if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction()
            throw error
        } finally {
            if (!queryRunner.isReleased) await queryRunner.release()
        }
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: exportImportService.importAll - ${getErrorMessage(error)}`
        )
    }
}

// Export chatflow messages
const exportChatflowMessages = async (
    chatflowId: string,
    chatType?: ChatType[] | string,
    feedbackType?: ChatMessageRatingType[] | string,
    startDate?: string,
    endDate?: string,
    workspaceId?: string
) => {
    try {
        // Parse chatType if it's a string
        let parsedChatTypes: ChatType[] | undefined
        if (chatType) {
            if (typeof chatType === 'string') {
                const parsed = parseJsonBody(chatType)
                parsedChatTypes = Array.isArray(parsed) ? parsed : [chatType as ChatType]
            } else if (Array.isArray(chatType)) {
                parsedChatTypes = chatType
            }
        }

        // Parse feedbackType if it's a string
        let parsedFeedbackTypes: ChatMessageRatingType[] | undefined
        if (feedbackType) {
            if (typeof feedbackType === 'string') {
                const parsed = parseJsonBody(feedbackType)
                parsedFeedbackTypes = Array.isArray(parsed) ? parsed : [feedbackType as ChatMessageRatingType]
            } else if (Array.isArray(feedbackType)) {
                parsedFeedbackTypes = feedbackType
            }
        }

        // Get all chat messages for the chatflow with feedback
        const chatMessages = await utilGetChatMessage({
            chatflowid: chatflowId,
            chatTypes: parsedChatTypes,
            feedbackTypes: parsedFeedbackTypes,
            startDate,
            endDate,
            sortOrder: 'DESC',
            feedback: true,
            activeWorkspaceId: workspaceId
        })

        const storagePath = getStoragePath()
        const exportObj: { [key: string]: any } = {}

        // Process each chat message
        for (const chatmsg of chatMessages) {
            const chatPK = getChatPK(chatmsg)
            const filePaths: string[] = []

            // Handle file uploads
            if (chatmsg.fileUploads) {
                const uploads = parseJsonBody(chatmsg.fileUploads)
                if (Array.isArray(uploads)) {
                    uploads.forEach((file: any) => {
                        if (file.type === 'stored-file') {
                            filePaths.push(path.join(storagePath, chatmsg.chatflowid, chatmsg.chatId, file.name))
                        }
                    })
                }
            }

            // Create message object
            const msg: any = {
                content: chatmsg.content,
                role: chatmsg.role === 'apiMessage' ? 'bot' : 'user',
                time: chatmsg.createdDate
            }

            // Add optional properties
            if (filePaths.length) msg.filePaths = filePaths
            if (chatmsg.sourceDocuments) msg.sourceDocuments = parseJsonBody(chatmsg.sourceDocuments)
            if (chatmsg.usedTools) msg.usedTools = parseJsonBody(chatmsg.usedTools)
            if (chatmsg.fileAnnotations) msg.fileAnnotations = parseJsonBody(chatmsg.fileAnnotations)
            if ((chatmsg as any).feedback) msg.feedback = (chatmsg as any).feedback.content
            if (chatmsg.agentReasoning) msg.agentReasoning = parseJsonBody(chatmsg.agentReasoning)

            // Handle artifacts
            if (chatmsg.artifacts) {
                const artifacts = parseJsonBody(chatmsg.artifacts)
                msg.artifacts = artifacts
                if (Array.isArray(artifacts)) {
                    artifacts.forEach((artifact: any) => {
                        if (artifact.type === 'png' || artifact.type === 'jpeg') {
                            const baseURL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`
                            artifact.data = `${baseURL}/api/v1/get-upload-file?chatflowId=${chatmsg.chatflowid}&chatId=${
                                chatmsg.chatId
                            }&fileName=${artifact.data.replace('FILE-STORAGE::', '')}`
                        }
                    })
                }
            }

            // Group messages by chat session
            if (!exportObj[chatPK]) {
                exportObj[chatPK] = {
                    id: chatmsg.chatId,
                    source: getChatType(chatmsg.chatType as ChatType),
                    sessionId: chatmsg.sessionId ?? null,
                    memoryType: chatmsg.memoryType ?? null,
                    email: (chatmsg as any).leadEmail ?? null,
                    messages: [msg]
                }
            } else {
                exportObj[chatPK].messages.push(msg)
            }
        }

        // Convert to array and reverse message order within each conversation
        const exportMessages = Object.values(exportObj).map((conversation: any) => ({
            ...conversation,
            messages: conversation.messages.reverse()
        }))

        return exportMessages
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: exportImportService.exportChatflowMessages - ${getErrorMessage(error)}`
        )
    }
}

// Helper function to get chat primary key
const getChatPK = (chatmsg: ChatMessage): string => {
    const chatId = chatmsg.chatId
    const memoryType = chatmsg.memoryType
    const sessionId = chatmsg.sessionId

    if (memoryType && sessionId) {
        return `${chatId}_${memoryType}_${sessionId}`
    }
    return chatId
}

// Helper function to get chat type display name
const getChatType = (chatType?: ChatType): string => {
    if (!chatType) return 'Unknown'

    switch (chatType) {
        case ChatType.EVALUATION:
            return 'Evaluation'
        case ChatType.INTERNAL:
            return 'UI'
        case ChatType.EXTERNAL:
            return 'API/Embed'
        case ChatType.MCP:
            return 'MCP'
        case ChatType.SCHEDULED:
            return 'Scheduled'
        case ChatType.WEBHOOK:
            return 'Webhook'
        case ChatType.CHANNEL:
            return 'Channel'
    }
}

export default {
    convertExportInput,
    exportData,
    importData,
    exportChatflowMessages
}
