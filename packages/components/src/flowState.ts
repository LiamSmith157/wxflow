// Helpers for the runtime state of a flow. Kept in a module of their own, with few imports, so that the nodes that only
// need them (and their tests) do not load the whole utils module. `utils` re-exports them.
import { get } from 'lodash'
import { ICommonObject } from './Interface'
import { IFlowState } from '../nodes/agentflow/Interface.Agentflow'

/** Merges new key-value pairs into the flow state. */
export const updateFlowState = (state: ICommonObject, updateState: IFlowState[]): ICommonObject => {
    const newFlowState: Record<string, string> = {}
    for (const s of updateState) {
        newFlowState[s.key] = s.value
    }
    return { ...state, ...newFlowState }
}

/**
 * Process template variables in state object, replacing {{ output }} and {{ output.property }} patterns
 * @param {ICommonObject} state - The state object to process
 * @param {any} finalOutput - The output value to substitute
 * @returns {ICommonObject} - The processed state object
 */
export const processTemplateVariables = (state: ICommonObject, finalOutput: any): ICommonObject => {
    if (!state || Object.keys(state).length === 0) {
        return state
    }

    const newState = { ...state }

    for (const key in newState) {
        const stateValue = newState[key].toString()
        if (stateValue.includes('{{ output') || stateValue.includes('{{output')) {
            // Handle simple output replacement (with or without spaces)
            if (stateValue === '{{ output }}' || stateValue === '{{output}}') {
                newState[key] = finalOutput
                continue
            }

            // Handle JSON path expressions like {{ output.updated }} or {{output.updated}}
            // eslint-disable-next-line
            const match = stateValue.match(/\{\{\s*output\.([\w\.]+)\s*\}\}/)
            if (match) {
                try {
                    // Parse the response if it's JSON
                    const jsonResponse = typeof finalOutput === 'string' ? JSON.parse(finalOutput) : finalOutput
                    // Get the value using lodash get
                    const path = match[1]
                    const value = get(jsonResponse, path)
                    newState[key] = value ?? stateValue // Fall back to original if path not found
                } catch (e) {
                    // If JSON parsing fails, keep original template
                    newState[key] = stateValue
                }
            } else {
                // Handle simple {{ output }} replacement for backward compatibility
                newState[key] = newState[key].replaceAll('{{ output }}', finalOutput)
            }
        }
    }

    return newState
}
