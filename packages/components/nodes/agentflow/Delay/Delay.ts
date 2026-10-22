import { ICommonObject, INode, INodeData, INodeParams } from '../../../src/Interface'

const toSeconds = (value: unknown): number | undefined => {
    if (value === undefined || value === null || value === '') return undefined
    const n = Number(value)
    return Number.isFinite(n) && n >= 0 ? n : undefined
}

/** Sleep that ends early when the run is aborted */
const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
    new Promise((resolve) => {
        if (signal?.aborted) return resolve()
        const timer = setTimeout(done, ms)
        function done() {
            clearTimeout(timer)
            signal?.removeEventListener('abort', done)
            resolve()
        }
        signal?.addEventListener('abort', done)
    })

class Delay_Agentflow implements INode {
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
        this.label = 'Delay'
        this.name = 'delayAgentflow'
        this.version = 1.0
        this.type = 'Delay'
        this.category = 'Agent Flows'
        this.description = 'Wait before continuing, for a fixed time or a random time within a range'
        this.baseClasses = [this.type]
        this.color = '#9C8CF0'
        this.inputs = [
            {
                label: 'Wait (seconds)',
                name: 'delaySeconds',
                type: 'number',
                description: 'Fixed waiting time',
                default: 3
            },
            {
                label: 'Random Range Minimum (seconds)',
                name: 'delayRandomMin',
                type: 'number',
                description: 'With both range values set (maximum not below minimum) the node waits a random time in this range instead',
                optional: true
            },
            {
                label: 'Random Range Maximum (seconds)',
                name: 'delayRandomMax',
                type: 'number',
                optional: true
            }
        ]
    }

    async run(nodeData: INodeData, _: string, options: ICommonObject): Promise<any> {
        const fixed = toSeconds(nodeData.inputs?.delaySeconds) ?? 0
        const min = toSeconds(nodeData.inputs?.delayRandomMin)
        const max = toSeconds(nodeData.inputs?.delayRandomMax)
        const random = min !== undefined && max !== undefined && max >= min
        const seconds = random ? min + Math.random() * (max - min) : fixed

        await sleep(seconds * 1000, (options.abortController as AbortController | undefined)?.signal)

        return {
            id: nodeData.id,
            name: this.name,
            input: random ? { min, max } : { seconds: fixed },
            output: { waitedSeconds: Math.round(seconds * 1000) / 1000, random },
            state: options.agentflowRuntime?.state as ICommonObject
        }
    }
}

module.exports = { nodeClass: Delay_Agentflow }
