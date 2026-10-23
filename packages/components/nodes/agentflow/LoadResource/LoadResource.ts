import { ICommonObject, INode, INodeData, INodeOptionsValue, INodeParams, IResourceFile, IResourceRuntime } from '../../../src/Interface'
import { listAllResources, resourceParam } from '../../../src/resourceParams'
import { extractResourceText } from '../../../src/resourceText'
import { processTemplateVariables, updateFlowState } from '../../../src/flowState'

type ReturnAs = 'text' | 'path' | 'info'
const RETURN_AS: ReturnAs[] = ['text', 'path', 'info']

class LoadResource_Agentflow implements INode {
    label: string
    name: string
    version: number
    description: string
    type: string
    icon: string
    category: string
    color: string
    baseClasses: string[]
    inputs: INodeParams[]

    constructor() {
        this.label = 'Load Resource'
        this.name = 'loadResourceAgentflow'
        this.version = 1.0
        this.type = 'LoadResource'
        this.category = 'Agent Flows'
        this.description = 'Load a resource of the resource library: its text, its local path or its details'
        this.baseClasses = [this.type]
        this.color = '#2BB8A8'
        this.inputs = [
            resourceParam(
                'Resource',
                'loadResourceRef',
                'Pick a resource from the resource library, or enter res://name/<resource name> (the name may contain variables, for example res://name/Price list-{{ $flow.state.city }}). Only resources of the library can be loaded, not file paths or URLs',
                'listAllResources'
            ),
            {
                label: 'Return',
                name: 'loadResourceReturnAs',
                type: 'options',
                description:
                    'Text: the text of a document (pdf, docx, xlsx, xls, pptx, txt). Path: the local path of the file. Details: the name, group, type, size and path as JSON',
                options: [
                    { label: 'Text', name: 'text' },
                    { label: 'Local Path', name: 'path' },
                    { label: 'Details (JSON)', name: 'info' }
                ],
                default: 'text'
            },
            {
                label: 'Update Flow State',
                name: 'loadResourceUpdateState',
                description: 'Update runtime state during the execution of the workflow',
                type: 'array',
                optional: true,
                acceptVariable: true,
                array: [
                    {
                        label: 'Key',
                        name: 'key',
                        type: 'asyncOptions',
                        loadMethod: 'listRuntimeStateKeys'
                    },
                    {
                        label: 'Value',
                        name: 'value',
                        type: 'string',
                        acceptVariable: true,
                        acceptNodeOutputAsVariable: true
                    }
                ]
            }
        ]
    }

    //@ts-ignore
    loadMethods = {
        listAllResources,
        async listRuntimeStateKeys(_: INodeData, options: ICommonObject): Promise<INodeOptionsValue[]> {
            const previousNodes = (options.previousNodes as ICommonObject[]) ?? []
            const startAgentflowNode = previousNodes.find((node) => node.name === 'startAgentflow')
            const state = (startAgentflowNode?.inputs?.startState as ICommonObject[]) ?? []
            return state.map((item) => ({ label: item.key, name: item.key }))
        }
    }

    async run(nodeData: INodeData, _: string, options: ICommonObject): Promise<any> {
        const resources = options.resources as IResourceRuntime | undefined
        if (!resources) throw new Error('资源库不可用:当前运行环境没有提供资源支持')

        const ref = typeof nodeData.inputs?.loadResourceRef === 'string' ? nodeData.inputs.loadResourceRef.trim() : ''
        if (!ref) throw new Error('请选择要载入的资源')
        const requested = nodeData.inputs?.loadResourceReturnAs as ReturnAs | undefined
        const returnAs: ReturnAs = requested && RETURN_AS.includes(requested) ? requested : 'text'

        const resource = await resources.load(ref)
        const content = await contentOf(resource, returnAs)

        let state = (options.agentflowRuntime?.state ?? {}) as ICommonObject
        const updateState = nodeData.inputs?.loadResourceUpdateState
        if (Array.isArray(updateState) && updateState.length > 0) state = updateFlowState(state, updateState)
        state = processTemplateVariables(state, content)

        return {
            id: nodeData.id,
            name: this.name,
            input: { ref, resource: { name: resource.name, kind: resource.kind }, returnAs },
            output: { content },
            state
        }
    }
}

const contentOf = async (resource: IResourceFile, returnAs: ReturnAs): Promise<string> => {
    switch (returnAs) {
        case 'path':
            return resource.path
        case 'info':
            return JSON.stringify(
                {
                    id: resource.id,
                    name: resource.name,
                    groupName: resource.groupName ?? null,
                    kind: resource.kind,
                    mimeType: resource.mimeType,
                    size: resource.size,
                    path: resource.path
                },
                null,
                2
            )
        default:
            return extractResourceText(resource)
    }
}

module.exports = { nodeClass: LoadResource_Agentflow }
