/**
 * Strictly no getRepository, appServer here, must be passed as parameter
 */

import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import {
    IChatFlow,
    IComponentCredentials,
    ICredentialDataDecrypted,
    ICredentialReqBody,
    INodeData,
    INodeDependencies,
    INodeDirectedGraph,
    INodeOverrides,
    IOverrideConfig,
    IReactFlowEdge,
    IReactFlowNode,
    IVariable,
    IVariableDict,
    IVariableOverride
} from '../Interface'
import { cloneDeep, get } from 'lodash'
import {
    convertChatHistoryToText,
    handleEscapeCharacters,
    getEncryptionKeyPath,
    getDefaultDataDir,
    getEnv,
    ICommonObject,
    IDatabaseEntity,
    IMessage,
    StorageProviderFactory
} from 'wxflow-components'
import { randomBytes } from 'crypto'
import { AES, enc } from 'crypto-js'

import { ChatFlow } from '../database/entities/ChatFlow'
import { ChatMessage } from '../database/entities/ChatMessage'
import { Credential } from '../database/entities/Credential'
import { Tool } from '../database/entities/Tool'
import { Lead } from '../database/entities/Lead'
import { Variable } from '../database/entities/Variable'
import { DocumentStore } from '../database/entities/DocumentStore'
import { DocumentStoreFileChunk } from '../database/entities/DocumentStoreFileChunk'
import { CustomMcpServer } from '../database/entities/CustomMcpServer'
import { ChannelInstance } from '../database/entities/ChannelInstance'
import {
    CreateSecretCommand,
    GetSecretValueCommand,
    SecretsManagerClient,
    SecretsManagerClientConfig
} from '@aws-sdk/client-secrets-manager'

export const QUESTION_VAR_PREFIX = 'question'
export const FILE_ATTACHMENT_PREFIX = 'file_attachment'
export const CHAT_HISTORY_VAR_PREFIX = 'chat_history'
export const RUNTIME_MESSAGES_LENGTH_VAR_PREFIX = 'runtime_messages_length'
export const LOOP_COUNT_VAR_PREFIX = 'loop_count'
export const CURRENT_DATE_TIME_VAR_PREFIX = 'current_date_time'
export const REDACTED_CREDENTIAL_VALUE = '_FLOWISE_BLANK_07167752-1a71-43b1-bf8f-4f32252165db'

let secretsManagerClient: SecretsManagerClient | null = null
const USE_AWS_SECRETS_MANAGER = process.env.SECRETKEY_STORAGE_TYPE === 'aws'
if (USE_AWS_SECRETS_MANAGER) {
    const region = process.env.SECRETKEY_AWS_REGION || 'us-east-1' // Default region if not provided
    const accessKeyId = process.env.SECRETKEY_AWS_ACCESS_KEY
    const secretAccessKey = process.env.SECRETKEY_AWS_SECRET_KEY

    const secretManagerConfig: SecretsManagerClientConfig = {
        region: region
    }

    if (accessKeyId && secretAccessKey) {
        secretManagerConfig.credentials = {
            accessKeyId,
            secretAccessKey
        }
    }
    secretsManagerClient = new SecretsManagerClient(secretManagerConfig)
}

export const databaseEntities: IDatabaseEntity = {
    ChatFlow: ChatFlow,
    ChatMessage: ChatMessage,
    Tool: Tool,
    Credential: Credential,
    Lead: Lead,
    Variable: Variable,
    DocumentStore: DocumentStore,
    DocumentStoreFileChunk: DocumentStoreFileChunk,
    CustomMcpServer: CustomMcpServer,
    ChannelInstance: ChannelInstance
}

/**
 * Returns the home folder path of the user if
 * none can be found it falls back to the current
 * working directory
 *
 */
export const getUserHome = (): string => {
    let variableName = 'HOME'
    if (process.platform === 'win32') {
        variableName = 'USERPROFILE'
    }

    if (process.env[variableName] === undefined) {
        // If for some reason the variable does not exist
        // fall back to current folder
        return process.cwd()
    }
    return process.env[variableName] as string
}

/**
 * Returns the path of node modules package
 * @param {string} packageName
 * @returns {string}
 */
export const getNodeModulesPackagePath = (packageName: string): string => {
    const checkPaths = [
        path.join(__dirname, '..', 'node_modules', packageName),
        path.join(__dirname, '..', '..', 'node_modules', packageName),
        path.join(__dirname, '..', '..', '..', 'node_modules', packageName),
        path.join(__dirname, '..', '..', '..', '..', 'node_modules', packageName),
        path.join(__dirname, '..', '..', '..', '..', '..', 'node_modules', packageName)
    ]
    for (const checkPath of checkPaths) {
        if (fs.existsSync(checkPath)) {
            return checkPath
        }
    }
    return ''
}

/**
 * Construct graph and node dependencies score
 * @param {IReactFlowNode[]} reactFlowNodes
 * @param {IReactFlowEdge[]} reactFlowEdges
 * @param {{ isNonDirected?: boolean, isReversed?: boolean }} options
 */
export const constructGraphs = (
    reactFlowNodes: IReactFlowNode[],
    reactFlowEdges: IReactFlowEdge[],
    options?: { isNonDirected?: boolean; isReversed?: boolean }
) => {
    const nodeDependencies = {} as INodeDependencies
    const graph = {} as INodeDirectedGraph

    for (let i = 0; i < reactFlowNodes.length; i += 1) {
        const nodeId = reactFlowNodes[i].id
        nodeDependencies[nodeId] = 0
        graph[nodeId] = []
    }

    if (options && options.isReversed) {
        for (let i = 0; i < reactFlowEdges.length; i += 1) {
            const source = reactFlowEdges[i].source
            const target = reactFlowEdges[i].target

            if (Object.prototype.hasOwnProperty.call(graph, target)) {
                graph[target].push(source)
            } else {
                graph[target] = [source]
            }

            nodeDependencies[target] += 1
        }

        return { graph, nodeDependencies }
    }

    for (let i = 0; i < reactFlowEdges.length; i += 1) {
        const source = reactFlowEdges[i].source
        const target = reactFlowEdges[i].target

        if (Object.prototype.hasOwnProperty.call(graph, source)) {
            graph[source].push(target)
        } else {
            graph[source] = [target]
        }

        if (options && options.isNonDirected) {
            if (Object.prototype.hasOwnProperty.call(graph, target)) {
                graph[target].push(source)
            } else {
                graph[target] = [source]
            }
        }
        nodeDependencies[target] += 1
    }

    return { graph, nodeDependencies }
}

/**
 * Get starting node and check if flow is valid
 * @param {INodeDependencies} nodeDependencies
 */
export const getStartingNode = (nodeDependencies: INodeDependencies) => {
    // Find starting node
    const startingNodeIds = [] as string[]
    Object.keys(nodeDependencies).forEach((nodeId) => {
        if (nodeDependencies[nodeId] === 0) {
            startingNodeIds.push(nodeId)
        }
    })

    return { startingNodeIds }
}

/**
 * Save upsert flowData
 * @param {INodeData} nodeData
 * @param {Record<string, any>} upsertHistory
 */
export const saveUpsertFlowData = (nodeData: INodeData, upsertHistory: Record<string, any>): ICommonObject[] => {
    const existingUpsertFlowData = upsertHistory['flowData'] ?? []
    const paramValues: ICommonObject[] = []

    for (const input in nodeData.inputs) {
        const inputParam = nodeData.inputParams.find((inp) => inp.name === input)
        if (!inputParam) continue

        let paramValue: ICommonObject = {}

        if (!nodeData.inputs[input]) {
            continue
        }
        if (
            typeof nodeData.inputs[input] === 'string' &&
            nodeData.inputs[input].startsWith('{{') &&
            nodeData.inputs[input].endsWith('}}')
        ) {
            continue
        }
        // Get file name instead of the base64 string
        if (nodeData.category === 'Document Loaders' && nodeData.inputParams.find((inp) => inp.name === input)?.type === 'file') {
            paramValue = {
                label: inputParam?.label,
                name: inputParam?.name,
                type: inputParam?.type,
                value: getFileName(nodeData.inputs[input])
            }
            paramValues.push(paramValue)
            continue
        }

        paramValue = {
            label: inputParam?.label,
            name: inputParam?.name,
            type: inputParam?.type,
            value: nodeData.inputs[input]
        }
        paramValues.push(paramValue)
    }

    const newFlowData = {
        label: nodeData.label,
        name: nodeData.name,
        category: nodeData.category,
        id: nodeData.id,
        paramValues
    }
    existingUpsertFlowData.push(newFlowData)
    return existingUpsertFlowData
}

/**
 * Get file name from base64 string
 * @param {string} fileBase64
 */
export const getFileName = (fileBase64: string): string => {
    let fileNames = []
    if (fileBase64.startsWith('FILE-STORAGE::')) {
        const names = fileBase64.substring(14)
        if (names.includes('[') && names.includes(']')) {
            const files = JSON.parse(names)
            return files.join(', ')
        } else {
            return fileBase64.substring(14)
        }
    }
    if (fileBase64.startsWith('[') && fileBase64.endsWith(']')) {
        const files = JSON.parse(fileBase64)
        for (const file of files) {
            const splitDataURI = file.split(',')
            const filename = splitDataURI[splitDataURI.length - 1].split(':')[1]
            fileNames.push(filename)
        }
        return fileNames.join(', ')
    } else {
        const splitDataURI = fileBase64.split(',')
        const filename = splitDataURI[splitDataURI.length - 1].split(':')[1]
        return filename
    }
}

export const getGlobalVariable = async (
    overrideConfig?: ICommonObject,
    availableVariables: IVariable[] = [],
    variableOverrides: ICommonObject[] = []
) => {
    // override variables defined in overrideConfig
    // nodeData.inputs.vars is an Object, check each property and override the variable
    if (overrideConfig?.vars && variableOverrides) {
        for (const propertyName of Object.getOwnPropertyNames(overrideConfig.vars)) {
            // Check if this variable is enabled for override
            const override = variableOverrides.find((v) => v.name === propertyName)
            if (!override?.enabled) {
                continue // Skip this variable if it's not enabled for override
            }

            const foundVar = availableVariables.find((v) => v.name === propertyName)
            if (foundVar) {
                // even if the variable was defined as runtime, we override it with static value
                foundVar.type = 'static'
                foundVar.value = overrideConfig.vars[propertyName]
            } else {
                // add it the variables, if not found locally in the db
                availableVariables.push({
                    name: propertyName,
                    type: 'static',
                    value: overrideConfig.vars[propertyName],
                    id: '',
                    updatedDate: new Date(),
                    createdDate: new Date(),
                    workspaceId: ''
                })
            }
        }
    }

    let vars = {}
    if (availableVariables.length) {
        for (const item of availableVariables) {
            let value = item.value

            // read from .env file
            if (item.type === 'runtime') {
                value = process.env[item.name] ?? ''
            }

            Object.defineProperty(vars, item.name, {
                enumerable: true,
                configurable: true,
                writable: true,
                value: value
            })
        }
    }
    return vars
}

/**
 * Get variable value from outputResponses.output
 * @param {string} paramValue
 * @param {IReactFlowNode[]} reactFlowNodes
 * @param {string} question
 * @param {boolean} isAcceptVariable
 * @returns {string}
 */
export const getVariableValue = async (
    paramValue: string | object,
    reactFlowNodes: IReactFlowNode[],
    question: string,
    chatHistory: IMessage[],
    isAcceptVariable = false,
    flowConfig?: ICommonObject,
    uploadedFilesContent?: string,
    availableVariables: IVariable[] = [],
    variableOverrides: ICommonObject[] = []
) => {
    const isObject = typeof paramValue === 'object'
    const initialValue = (isObject ? JSON.stringify(paramValue) : paramValue) ?? ''
    let returnVal = initialValue
    const variableStack = []
    const variableDict = {} as IVariableDict
    let startIdx = 0
    const endIdx = initialValue.length - 1

    while (startIdx < endIdx) {
        const substr = initialValue.substring(startIdx, startIdx + 2)

        // Store the opening double curly bracket
        if (substr === '{{') {
            variableStack.push({ substr, startIdx: startIdx + 2 })
        }

        // Found the complete variable
        if (substr === '}}' && variableStack.length > 0 && variableStack[variableStack.length - 1].substr === '{{') {
            const variableStartIdx = variableStack[variableStack.length - 1].startIdx
            const variableEndIdx = startIdx
            const variableFullPath = initialValue.substring(variableStartIdx, variableEndIdx)

            /**
             * Apply string transformation to convert special chars:
             * FROM: hello i am ben\n\n\thow are you?
             * TO: hello i am benFLOWISE_NEWLINEFLOWISE_NEWLINEFLOWISE_TABhow are you?
             */
            if (isAcceptVariable && variableFullPath === QUESTION_VAR_PREFIX) {
                variableDict[`{{${variableFullPath}}}`] = handleEscapeCharacters(question, false)
            }

            if (isAcceptVariable && variableFullPath === FILE_ATTACHMENT_PREFIX) {
                variableDict[`{{${variableFullPath}}}`] = handleEscapeCharacters(uploadedFilesContent, false)
            }

            if (isAcceptVariable && variableFullPath === CHAT_HISTORY_VAR_PREFIX) {
                variableDict[`{{${variableFullPath}}}`] = handleEscapeCharacters(convertChatHistoryToText(chatHistory), false)
            }

            if (variableFullPath.startsWith('$vars.')) {
                const vars = await getGlobalVariable(flowConfig, availableVariables, variableOverrides)
                const variableValue = get(vars, variableFullPath.replace('$vars.', ''))
                if (variableValue != null) {
                    variableDict[`{{${variableFullPath}}}`] = variableValue
                    returnVal = returnVal.split(`{{${variableFullPath}}}`).join(variableValue)
                }
            }

            if (variableFullPath.startsWith('$flow.') && flowConfig) {
                const variableValue = get(flowConfig, variableFullPath.replace('$flow.', ''))
                if (variableValue != null) {
                    variableDict[`{{${variableFullPath}}}`] = variableValue
                    returnVal = returnVal.split(`{{${variableFullPath}}}`).join(variableValue)
                }
            }

            // Resolve values with following case.
            // 1: <variableNodeId>.data.instance
            // 2: <variableNodeId>.data.instance.pathtokey
            const variableFullPathParts = variableFullPath.split('.')
            const variableNodeId = variableFullPathParts[0]
            const executedNode = reactFlowNodes.find((nd) => nd.id === variableNodeId)
            if (executedNode) {
                let variableValue = get(executedNode.data, 'instance')

                // Handle path such as `<variableNodeId>.data.instance.key`
                if (variableFullPathParts.length > 3) {
                    let variableObj = null
                    switch (typeof variableValue) {
                        case 'string': {
                            const unEscapedVariableValue = handleEscapeCharacters(variableValue, true)
                            if (unEscapedVariableValue.startsWith('{') && unEscapedVariableValue.endsWith('}')) {
                                try {
                                    variableObj = JSON.parse(unEscapedVariableValue)
                                } catch (e) {
                                    // ignore
                                }
                            }
                            break
                        }
                        case 'object': {
                            variableObj = variableValue
                            break
                        }
                        default:
                            break
                    }
                    if (variableObj) {
                        variableObj = get(variableObj, variableFullPathParts.slice(3))
                        variableValue = handleEscapeCharacters(
                            typeof variableObj === 'object' ? JSON.stringify(variableObj) : variableObj,
                            false
                        )
                    }
                }
                if (isAcceptVariable) {
                    variableDict[`{{${variableFullPath}}}`] = variableValue
                } else {
                    returnVal = variableValue
                }
            }
            variableStack.pop()
        }
        startIdx += 1
    }

    if (isAcceptVariable) {
        const variablePaths = Object.keys(variableDict)
        variablePaths.sort() // Sort by length of variable path because longer path could possibly contains nested variable
        variablePaths.forEach((path) => {
            let variableValue: object | string = variableDict[path]
            // Replace all occurrence
            if (typeof variableValue === 'object') {
                // Just get the id of variableValue object if it is agentflow node, to avoid circular JSON error
                if (Object.prototype.hasOwnProperty.call(variableValue, 'predecessorAgents')) {
                    const nodeId = variableValue['id']
                    variableValue = { id: nodeId }
                }

                const stringifiedValue = JSON.stringify(JSON.stringify(variableValue))
                if (stringifiedValue.startsWith('"') && stringifiedValue.endsWith('"')) {
                    // get rid of the double quotes
                    returnVal = returnVal.split(path).join(stringifiedValue.substring(1, stringifiedValue.length - 1))
                } else {
                    returnVal = returnVal.split(path).join(JSON.stringify(variableValue).replace(/"/g, '\\"'))
                }
            } else {
                returnVal = returnVal.split(path).join(variableValue)
            }
        })
        return returnVal
    }
    return isObject ? JSON.parse(returnVal) : returnVal
}

/**
 * Loop through each inputs and resolve variable if necessary
 * @param {INodeData} reactFlowNodeData
 * @param {IReactFlowNode[]} reactFlowNodes
 * @param {string} question
 * @returns {INodeData}
 */
export const resolveVariables = async (
    reactFlowNodeData: INodeData,
    reactFlowNodes: IReactFlowNode[],
    question: string,
    chatHistory: IMessage[],
    flowConfig?: ICommonObject,
    uploadedFilesContent?: string,
    availableVariables: IVariable[] = [],
    variableOverrides: ICommonObject[] = []
): Promise<INodeData> => {
    let flowNodeData = cloneDeep(reactFlowNodeData)

    const getParamValues = async (paramsObj: ICommonObject) => {
        for (const key in paramsObj) {
            const paramValue: string = paramsObj[key]
            if (Array.isArray(paramValue)) {
                const resolvedInstances = []
                for (const param of paramValue) {
                    const resolvedInstance = await getVariableValue(
                        param,
                        reactFlowNodes,
                        question,
                        chatHistory,
                        undefined,
                        flowConfig,
                        uploadedFilesContent,
                        availableVariables,
                        variableOverrides
                    )
                    resolvedInstances.push(resolvedInstance)
                }
                paramsObj[key] = resolvedInstances
            } else {
                const isAcceptVariable = reactFlowNodeData.inputParams.find((param) => param.name === key)?.acceptVariable ?? false
                const resolvedInstance = await getVariableValue(
                    paramValue,
                    reactFlowNodes,
                    question,
                    chatHistory,
                    isAcceptVariable,
                    flowConfig,
                    uploadedFilesContent,
                    availableVariables,
                    variableOverrides
                )
                paramsObj[key] = resolvedInstance
            }
        }
    }

    const paramsObj = flowNodeData['inputs'] ?? {}
    await getParamValues(paramsObj)

    return flowNodeData
}

/**
 * Loop through each inputs and replace their value with override config values
 * @param {INodeData} flowNodeData
 * @param {ICommonObject} overrideConfig
 * @param {INodeOverrides} nodeOverrides
 * @param {IVariableOverride[]} variableOverrides
 * @returns {INodeData}
 */
export const replaceInputsWithConfig = (
    flowNodeData: INodeData,
    overrideConfig: ICommonObject,
    nodeOverrides: INodeOverrides,
    variableOverrides: IVariableOverride[]
) => {
    const types = 'inputs'

    const isParameterEnabled = (nodeType: string, paramName: string): boolean => {
        if (!nodeOverrides[nodeType]) return false
        const parameter = nodeOverrides[nodeType].find((param: any) => param.name === paramName)
        return parameter?.enabled ?? false
    }

    const getParamValues = (inputsObj: ICommonObject) => {
        for (const config in overrideConfig) {
            /**
             * Several conditions:
             * 1. If config is 'analytics', always allow it
             * 2. If config is 'vars', check its object and filter out the variables that are not enabled for override
             * 3. If typeof config's value is an array, check if the parameter is enabled and apply directly
             * 4. If typeof config's value is an object, check if the node id is in the overrideConfig object and if the parameter (systemMessagePrompt) is enabled
             * Example:
             * "systemMessagePrompt": {
             *  "chatPromptTemplate_0": "You are an assistant"
             * }
             * 5. If typeof config's value is a string, check if the parameter is enabled
             * Example:
             * "systemMessagePrompt": "You are an assistant"
             */

            if (config === 'analytics') {
                // pass
            } else if (config === 'vars') {
                if (typeof overrideConfig[config] === 'object') {
                    const filteredVars: ICommonObject = {}

                    const vars = overrideConfig[config]
                    for (const variable in vars) {
                        const override = variableOverrides.find((v) => v.name === variable)
                        if (!override?.enabled) {
                            continue // Skip this variable if it's not enabled for override
                        }
                        filteredVars[variable] = vars[variable]
                    }
                    overrideConfig[config] = filteredVars
                }
            } else if (Array.isArray(overrideConfig[config])) {
                // Handle arrays as direct parameter values
                if (isParameterEnabled(flowNodeData.label, config)) {
                    // If existing value is also an array, concatenate; otherwise replace
                    const existingValue = inputsObj[config]
                    if (Array.isArray(existingValue)) {
                        inputsObj[config] = [...new Set([...existingValue, ...overrideConfig[config]])]
                    } else {
                        inputsObj[config] = overrideConfig[config]
                    }
                }
                continue
            } else if (overrideConfig[config] && typeof overrideConfig[config] === 'object') {
                const nodeIds = Object.keys(overrideConfig[config])
                if (nodeIds.includes(flowNodeData.id)) {
                    // Check if this parameter is enabled
                    if (isParameterEnabled(flowNodeData.label, config)) {
                        const existingValue = inputsObj[config]
                        const overrideValue = overrideConfig[config][flowNodeData.id]

                        // Merge objects instead of completely overriding
                        if (
                            typeof existingValue === 'object' &&
                            typeof overrideValue === 'object' &&
                            !Array.isArray(existingValue) &&
                            !Array.isArray(overrideValue) &&
                            existingValue !== null &&
                            overrideValue !== null
                        ) {
                            inputsObj[config] = Object.assign({}, existingValue, overrideValue)
                        } else if (typeof existingValue === 'string' && existingValue.startsWith('{') && existingValue.endsWith('}')) {
                            try {
                                const parsedExisting = JSON.parse(existingValue)
                                if (typeof overrideValue === 'object' && !Array.isArray(overrideValue)) {
                                    inputsObj[config] = Object.assign({}, parsedExisting, overrideValue)
                                } else {
                                    inputsObj[config] = overrideValue
                                }
                            } catch (e) {
                                inputsObj[config] = overrideValue
                            }
                        } else {
                            inputsObj[config] = overrideValue
                        }
                    }
                    continue
                } else if (nodeIds.some((nodeId) => nodeId.includes(flowNodeData.name))) {
                    /*
                     * "systemMessagePrompt": {
                     *   "chatPromptTemplate_0": "You are an assistant" <---- continue for loop if current node is chatPromptTemplate_1
                     * }
                     */
                    continue
                }
            } else {
                if (!isParameterEnabled(flowNodeData.label, config)) {
                    // Only proceed if the parameter is enabled
                    continue
                }
            }

            let paramValue = inputsObj[config]
            const overrideConfigValue = overrideConfig[config]
            if (overrideConfigValue) {
                if (typeof overrideConfigValue === 'object') {
                    // Handle arrays specifically - concatenate instead of replace
                    if (Array.isArray(overrideConfigValue) && Array.isArray(paramValue)) {
                        paramValue = [...new Set([...paramValue, ...overrideConfigValue])]
                    } else if (Array.isArray(overrideConfigValue)) {
                        paramValue = overrideConfigValue
                    } else {
                        switch (typeof paramValue) {
                            case 'string':
                                if (paramValue.startsWith('{') && paramValue.endsWith('}')) {
                                    try {
                                        paramValue = Object.assign({}, JSON.parse(paramValue), overrideConfigValue)
                                        break
                                    } catch (e) {
                                        // ignore
                                    }
                                }
                                paramValue = overrideConfigValue
                                break
                            case 'object':
                                // Make sure we're not dealing with arrays here
                                if (!Array.isArray(paramValue)) {
                                    paramValue = Object.assign({}, paramValue, overrideConfigValue)
                                } else {
                                    paramValue = overrideConfigValue
                                }
                                break
                            default:
                                paramValue = overrideConfigValue
                                break
                        }
                    }
                } else {
                    paramValue = overrideConfigValue
                }
            }
            // Check if boolean
            if (paramValue === 'true') paramValue = true
            else if (paramValue === 'false') paramValue = false
            inputsObj[config] = paramValue
        }
    }

    const inputsObj = flowNodeData[types] ?? {}

    getParamValues(inputsObj)

    return flowNodeData
}

/**
 * Find all available input params config
 * @param {IReactFlowNode[]} reactFlowNodes
 * @param {IComponentCredentials} componentCredentials
 * @returns {IOverrideConfig[]}
 */
export const findAvailableConfigs = (reactFlowNodes: IReactFlowNode[], componentCredentials: IComponentCredentials) => {
    const configs: IOverrideConfig[] = []

    for (const flowNode of reactFlowNodes) {
        for (const inputParam of flowNode.data.inputParams) {
            let obj: IOverrideConfig | undefined
            if (inputParam.type === 'file') {
                obj = {
                    node: flowNode.data.label,
                    nodeId: flowNode.data.id,
                    label: inputParam.label,
                    name: 'files',
                    type: inputParam.fileType ?? inputParam.type
                }
            } else if (inputParam.type === 'options') {
                obj = {
                    node: flowNode.data.label,
                    nodeId: flowNode.data.id,
                    label: inputParam.label,
                    name: inputParam.name,
                    type: inputParam.options
                        ? inputParam.options
                              ?.map((option) => {
                                  return option.name
                              })
                              .join(', ')
                        : 'string'
                }
            } else if (inputParam.type === 'credential') {
                // get component credential inputs
                for (const name of inputParam.credentialNames ?? []) {
                    if (Object.prototype.hasOwnProperty.call(componentCredentials, name)) {
                        const inputs = componentCredentials[name]?.inputs ?? []
                        for (const input of inputs) {
                            obj = {
                                node: flowNode.data.label,
                                nodeId: flowNode.data.id,
                                label: input.label,
                                name: input.name,
                                type: input.type === 'password' ? 'string' : input.type
                            }
                            configs.push(obj)
                        }
                    }
                }
                continue
            } else if (inputParam.type === 'array') {
                const arrayItem = inputParam.array
                if (Array.isArray(arrayItem)) {
                    const arrayItemSchema: Record<string, string> = {}
                    // Build object schema representing the structure of each array item
                    for (const item of arrayItem) {
                        let itemType = item.type
                        if (itemType === 'options') {
                            const availableOptions = item.options?.map((option) => option.name).join(', ')
                            itemType = `(${availableOptions})`
                        } else if (itemType === 'file') {
                            itemType = item.fileType ?? item.type
                        }
                        arrayItemSchema[item.name] = itemType
                    }
                    obj = {
                        node: flowNode.data.label,
                        nodeId: flowNode.data.id,
                        label: inputParam.label,
                        name: inputParam.name,
                        type: inputParam.type,
                        schema: arrayItemSchema
                    }
                }
            } else if (inputParam.loadConfig) {
                const configData = flowNode?.data?.inputs?.[`${inputParam.name}Config`]
                if (configData) {
                    // Parse config data to extract schema
                    let parsedConfig: any = {}
                    try {
                        parsedConfig = typeof configData === 'string' ? JSON.parse(configData) : configData
                    } catch (e) {
                        // If parsing fails, treat as empty object
                        parsedConfig = {}
                    }

                    // Generate schema from config structure
                    const configSchema: Record<string, string> = {}
                    parsedConfig = _removeCredentialId(parsedConfig)
                    for (const key in parsedConfig) {
                        if (key === inputParam.name) continue
                        const value = parsedConfig[key]
                        let fieldType = 'string' // default type

                        if (typeof value === 'boolean') {
                            fieldType = 'boolean'
                        } else if (typeof value === 'number') {
                            fieldType = 'number'
                        } else if (Array.isArray(value)) {
                            fieldType = 'array'
                        } else if (typeof value === 'object' && value !== null) {
                            fieldType = 'object'
                        }

                        configSchema[key] = fieldType
                    }

                    obj = {
                        node: flowNode.data.label,
                        nodeId: flowNode.data.id,
                        label: `${inputParam.label} Config`,
                        name: `${inputParam.name}Config`,
                        type: `json`,
                        schema: configSchema
                    }
                }
            } else {
                obj = {
                    node: flowNode.data.label,
                    nodeId: flowNode.data.id,
                    label: inputParam.label,
                    name: inputParam.name,
                    type: inputParam.type === 'password' ? 'string' : inputParam.type
                }
            }
            if (obj && !configs.some((config) => JSON.stringify(config) === JSON.stringify(obj))) {
                configs.push(obj)
            }
        }
    }
    return configs
}

/**
 * Returns the encryption key
 * @returns {Promise<string>}
 */
export const getEncryptionKey = async (): Promise<string> => {
    const secretKeyOverwrite = getEnv('SECRETKEY_OVERWRITE')
    if (secretKeyOverwrite !== undefined) {
        return secretKeyOverwrite
    }
    if (USE_AWS_SECRETS_MANAGER && secretsManagerClient) {
        const secretId = process.env.SECRETKEY_AWS_NAME || 'FlowiseEncryptionKey'
        try {
            const command = new GetSecretValueCommand({ SecretId: secretId })
            const response = await secretsManagerClient.send(command)

            if (response.SecretString) {
                return response.SecretString
            }
        } catch (error: any) {
            if (error.name === 'ResourceNotFoundException') {
                // Secret doesn't exist, create it
                const newKey = generateEncryptKey()
                const createCommand = new CreateSecretCommand({
                    Name: secretId,
                    SecretString: newKey
                })
                await secretsManagerClient.send(createCommand)
                return newKey
            }
            throw error
        }
    }
    try {
        return await fs.promises.readFile(getEncryptionKeyPath(), 'utf8')
    } catch (error) {
        const encryptKey = generateEncryptKey()
        const defaultLocation = process.env.SECRETKEY_PATH
            ? path.join(process.env.SECRETKEY_PATH, 'encryption.key')
            : path.join(getDefaultDataDir(), 'encryption.key')
        await fs.promises.writeFile(defaultLocation, encryptKey)
        return encryptKey
    }
}

/**
 * Encrypt credential data
 * @param {ICredentialDataDecrypted} plainDataObj
 * @returns {Promise<string>}
 */
export const encryptCredentialData = async (plainDataObj: ICredentialDataDecrypted): Promise<string> => {
    const encryptKey = await getEncryptionKey()
    return AES.encrypt(JSON.stringify(plainDataObj), encryptKey).toString()
}

/**
 * Decrypt credential data
 * @param {string} encryptedData
 * @param {string} componentCredentialName
 * @param {IComponentCredentials} componentCredentials
 * @returns {Promise<ICredentialDataDecrypted>}
 */
export const decryptCredentialData = async (
    encryptedData: string,
    componentCredentialName?: string,
    componentCredentials?: IComponentCredentials
): Promise<ICredentialDataDecrypted> => {
    let decryptedDataStr: string

    if (USE_AWS_SECRETS_MANAGER && secretsManagerClient) {
        try {
            if (encryptedData.startsWith('FlowiseCredential_')) {
                const command = new GetSecretValueCommand({ SecretId: encryptedData })
                const response = await secretsManagerClient.send(command)

                if (response.SecretString) {
                    const secretObj = JSON.parse(response.SecretString)
                    decryptedDataStr = JSON.stringify(secretObj)
                } else {
                    throw new Error('Failed to retrieve secret value.')
                }
            } else {
                const encryptKey = await getEncryptionKey()
                const decryptedData = AES.decrypt(encryptedData, encryptKey)
                decryptedDataStr = decryptedData.toString(enc.Utf8)
            }
        } catch (error) {
            console.error(error)
            throw new Error('Failed to decrypt credential data.')
        }
    } else {
        // Fallback to existing code
        const encryptKey = await getEncryptionKey()
        const decryptedData = AES.decrypt(encryptedData, encryptKey)
        decryptedDataStr = decryptedData.toString(enc.Utf8)
    }

    if (!decryptedDataStr) return {}
    try {
        if (componentCredentialName && componentCredentials) {
            const plainDataObj = JSON.parse(decryptedDataStr)
            return redactCredentialWithPasswordType(componentCredentialName, plainDataObj, componentCredentials)
        }
        return JSON.parse(decryptedDataStr)
    } catch (e) {
        console.error(e)
        return {}
    }
}

/**
 * Generate an encryption key
 * @returns {string}
 */
export const generateEncryptKey = (): string => {
    return randomBytes(24).toString('base64')
}

/**
 * Returns the directory where auth secrets are stored (same as encryption key directory).
 * Used for file-based storage of TOKEN_HASH_SECRET, EXPRESS_SESSION_SECRET, JWT_*, etc.
 */
export const getAuthSecretsDirectory = (): string => {
    return process.env.SECRETKEY_PATH ? process.env.SECRETKEY_PATH : getDefaultDataDir()
}

/**
 * Generate a 32-byte auth secret (OWASP recommendation).
 * Used for auth secrets only; encryption key remains 24 bytes.
 */
export const generateAuthSecret = (): string => {
    return randomBytes(32).toString('base64')
}

export interface GetOrCreateStoredSecretOptions {
    envKey: string
    fileName: string
    awsSecretIdSuffix: string
    /** When generating a new secret, use this value instead of random (e.g. 'flowise' for JWT_ISSUER/JWT_AUDIENCE) */
    defaultValueForNew?: string
    /** If env is set to this value, treat as unset (backwards compat for weak defaults) */
    weakDefault?: string
}

/**
 * Resolve an auth secret: env (backwards compat) → AWS Secrets Manager → filesystem (read or generate+write).
 * Used by initAuthSecrets() for each of the six auth secrets.
 */
export const getOrCreateStoredSecret = async (options: GetOrCreateStoredSecretOptions): Promise<string> => {
    const { envKey, fileName, awsSecretIdSuffix, defaultValueForNew, weakDefault } = options
    const envVal = process.env[envKey]
    const useEnv = envVal && envVal.trim() !== '' && (weakDefault === undefined || envVal !== weakDefault)
    if (useEnv) {
        return envVal!.trim()
    }

    if (USE_AWS_SECRETS_MANAGER && secretsManagerClient) {
        const prefix = process.env.SECRETKEY_AWS_AUTH_PREFIX || 'Flowise'
        const secretId = prefix + awsSecretIdSuffix
        try {
            const command = new GetSecretValueCommand({ SecretId: secretId })
            const response = await secretsManagerClient.send(command)
            if (response.SecretString) {
                return response.SecretString
            }
        } catch (error: any) {
            if (error.name === 'ResourceNotFoundException') {
                const newValue = defaultValueForNew !== undefined ? defaultValueForNew : generateAuthSecret()
                const createCommand = new CreateSecretCommand({
                    Name: secretId,
                    SecretString: newValue
                })
                await secretsManagerClient.send(createCommand)
                return newValue
            }
            throw error
        }
    }

    const dir = getAuthSecretsDirectory()
    const filePath = path.join(dir, fileName)
    try {
        return await fs.promises.readFile(filePath, 'utf8')
    } catch {
        const value = defaultValueForNew !== undefined ? defaultValueForNew : generateAuthSecret()
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
        }
        await fs.promises.writeFile(filePath, value)
        return value
    }
}

/**
 * Transform ICredentialBody from req to Credential entity
 * @param {ICredentialReqBody} body
 * @returns {Credential}
 */
export const transformToCredentialEntity = async (body: ICredentialReqBody): Promise<Credential> => {
    const credentialBody: ICommonObject = {
        name: body.name,
        credentialName: body.credentialName
    }

    if (body.plainDataObj) {
        const encryptedData = await encryptCredentialData(body.plainDataObj)
        credentialBody.encryptedData = encryptedData
    }

    const newCredential = new Credential()
    Object.assign(newCredential, credentialBody)

    if (body.workspaceId) {
        newCredential.workspaceId = body.workspaceId
    }

    return newCredential
}

/**
 * Redact values that are of password type to avoid sending back to client
 * @param {string} componentCredentialName
 * @param {ICredentialDataDecrypted} decryptedCredentialObj
 * @param {IComponentCredentials} componentCredentials
 * @returns {ICredentialDataDecrypted}
 */
const maskUrlPassword = (value: string): string | null => {
    try {
        const url = new URL(value)
        if (!url.password) return null
        url.password = 'FLOWISE_MASKED'
        return url.toString().replace('FLOWISE_MASKED', '\u2022\u2022\u2022\u2022\u2022\u2022')
    } catch {
        return null
    }
}

export const redactCredentialWithPasswordType = (
    componentCredentialName: string,
    decryptedCredentialObj: ICredentialDataDecrypted,
    componentCredentials: IComponentCredentials
): ICredentialDataDecrypted => {
    const plainDataObj = cloneDeep(decryptedCredentialObj)
    for (const cred in plainDataObj) {
        const inputs = componentCredentials[componentCredentialName].inputs
        const inputParam = inputs?.find((inp) => inp.name === cred && (inp.type === 'password' || inp.type === 'url'))
        if (!inputParam) continue
        if (inputParam.type === 'url') {
            const maskedUrl = typeof plainDataObj[cred] === 'string' ? maskUrlPassword(plainDataObj[cred]) : null
            // Only redact if there was actually a password to mask; otherwise keep URL as-is
            if (maskedUrl !== null) {
                plainDataObj[cred] = maskedUrl
            }
        } else {
            plainDataObj[cred] = REDACTED_CREDENTIAL_VALUE
        }
    }
    return plainDataObj
}

/**
 * Get all values from a JSON object
 * @param {any} obj
 * @returns {any[]}
 */
export const getAllValuesFromJson = (obj: any): any[] => {
    const values: any[] = []

    function extractValues(data: any) {
        if (typeof data === 'object' && data !== null) {
            if (Array.isArray(data)) {
                for (const item of data) {
                    extractValues(item)
                }
            } else {
                for (const key in data) {
                    extractValues(data[key])
                }
            }
        } else {
            values.push(data)
        }
    }

    extractValues(obj)
    return values
}

/**
 * Get only essential flow data items for telemetry
 * @param {IReactFlowNode[]} nodes
 * @param {IReactFlowEdge[]} edges
 */
export const getTelemetryFlowObj = (nodes: IReactFlowNode[], edges: IReactFlowEdge[]) => {
    const nodeData = nodes.map((node) => node.id)
    const edgeData = edges.map((edge) => ({ source: edge.source, target: edge.target }))
    return { nodes: nodeData, edges: edgeData }
}

/**
 * Get app current version
 */
export const getAppVersion = async () => {
    const getPackageJsonPath = (): string => {
        const checkPaths = [
            path.join(__dirname, '..', 'package.json'),
            path.join(__dirname, '..', '..', 'package.json'),
            path.join(__dirname, '..', '..', '..', 'package.json'),
            path.join(__dirname, '..', '..', '..', '..', 'package.json'),
            path.join(__dirname, '..', '..', '..', '..', '..', 'package.json')
        ]
        for (const checkPath of checkPaths) {
            if (fs.existsSync(checkPath)) {
                return checkPath
            }
        }
        return ''
    }

    const packagejsonPath = getPackageJsonPath()
    if (!packagejsonPath) return ''
    try {
        const content = await fs.promises.readFile(packagejsonPath, 'utf8')
        const parsedContent = JSON.parse(content)
        return parsedContent.version
    } catch (error) {
        return ''
    }
}

export const convertToValidFilename = (word: string) => {
    return word
        .replace(/[/|\\:*?"<>]/g, ' ')
        .replace(' ', '')
        .toLowerCase()
}

export const aMonthAgo = () => {
    const date = new Date()
    date.setMonth(new Date().getMonth() - 1)
    return date
}

export const getAPIOverrideConfig = (chatflow: IChatFlow) => {
    try {
        const apiConfig = chatflow.apiConfig ? JSON.parse(chatflow.apiConfig) : {}
        const nodeOverrides: INodeOverrides =
            apiConfig.overrideConfig && apiConfig.overrideConfig.nodes ? apiConfig.overrideConfig.nodes : {}
        const variableOverrides: IVariableOverride[] =
            apiConfig.overrideConfig && apiConfig.overrideConfig.variables ? apiConfig.overrideConfig.variables : []
        const apiOverrideStatus: boolean =
            apiConfig.overrideConfig && apiConfig.overrideConfig.status ? apiConfig.overrideConfig.status : false

        return { nodeOverrides, variableOverrides, apiOverrideStatus }
    } catch (error) {
        return { nodeOverrides: {}, variableOverrides: [], apiOverrideStatus: false }
    }
}

export const getUploadPath = (): string => {
    return process.env.BLOB_STORAGE_PATH ? path.join(process.env.BLOB_STORAGE_PATH, 'uploads') : path.join(getDefaultDataDir(), 'uploads')
}

export function generateId() {
    return uuidv4()
}

export const getMulterStorage = () => {
    const provider = StorageProviderFactory.getProvider()
    return provider.getMulterStorage()
}

/**
 * Calculate depth of each node from starting nodes
 * @param {INodeDirectedGraph} graph
 * @param {string[]} startingNodeIds
 * @returns {Record<string, number>} Map of nodeId to its depth
 */
export const calculateNodesDepth = (graph: INodeDirectedGraph, startingNodeIds: string[]): Record<string, number> => {
    const depths: Record<string, number> = {}
    const visited = new Set<string>()

    // Initialize all nodes with depth -1 (unvisited)
    for (const nodeId in graph) {
        depths[nodeId] = -1
    }

    // BFS queue with [nodeId, depth]
    const queue: [string, number][] = startingNodeIds.map((id) => [id, 0])

    // Set starting nodes depth to 0
    startingNodeIds.forEach((id) => {
        depths[id] = 0
    })

    while (queue.length > 0) {
        const [currentNode, currentDepth] = queue.shift()!

        if (visited.has(currentNode)) continue
        visited.add(currentNode)

        // Process all neighbors
        for (const neighbor of graph[currentNode]) {
            if (!visited.has(neighbor)) {
                // Update depth if unvisited or found shorter path
                if (depths[neighbor] === -1 || depths[neighbor] > currentDepth + 1) {
                    depths[neighbor] = currentDepth + 1
                }
                queue.push([neighbor, currentDepth + 1])
            }
        }
    }

    return depths
}

/**
 * Helper function to get all nodes in a path starting from a node
 * @param {INodeDirectedGraph} graph
 * @param {string} startNode
 * @returns {string[]}
 */
export const getAllNodesInPath = (startNode: string, graph: INodeDirectedGraph): string[] => {
    const nodes = new Set<string>()
    const queue = [startNode]

    while (queue.length > 0) {
        const current = queue.shift()!
        if (nodes.has(current)) continue

        nodes.add(current)
        if (graph[current]) {
            queue.push(...graph[current])
        }
    }

    return Array.from(nodes)
}

export const _removeCredentialId = (obj: any): any => {
    if (!obj || typeof obj !== 'object') return obj

    if (Array.isArray(obj)) {
        return obj.map((item) => _removeCredentialId(item))
    }

    const newObj: Record<string, any> = {}
    for (const [key, value] of Object.entries(obj)) {
        if (key === 'FLOWISE_CREDENTIAL_ID') continue
        newObj[key] = _removeCredentialId(value)
    }
    return newObj
}

/**
 * Validates that history items follow the expected schema
 * @param {any[]} history - Array of history items to validate
 * @returns {boolean} - True if all items are valid, false otherwise
 */
export const validateHistorySchema = (history: any[]): boolean => {
    if (!Array.isArray(history)) {
        return false
    }

    return history.every((item) => {
        // Check if item is an object
        if (typeof item !== 'object' || item === null) {
            return false
        }

        // Check if role exists and is valid
        if (typeof item.role !== 'string' || !['apiMessage', 'userMessage'].includes(item.role)) {
            return false
        }

        // Check if content exists and is a string
        if (typeof item.content !== 'string') {
            return false
        }

        return true
    })
}
