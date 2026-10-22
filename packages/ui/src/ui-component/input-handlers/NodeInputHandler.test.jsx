/**
 * @jest-environment <rootDir>/src/__test_utils__/jest-environment-jsdom.js
 */
import { render, screen, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Provider } from 'react-redux'
import { createStore } from 'redux'
import { MemoryRouter } from 'react-router-dom'
import { SnackbarProvider } from 'notistack'

import i18n from '@/i18n'
import { ErrorProvider } from '@/store/context/ErrorContext'
import ConfirmContextProvider from '@/store/context/ConfirmContextProvider'
import { flowContext } from '@/store/context/ReactFlowContext'
import NodeInputHandler from './NodeInputHandler'

jest.mock('reactflow', () => ({
    Handle: () => null,
    Position: { Left: 'left', Right: 'right' },
    useUpdateNodeInternals: () => () => {}
}))
// rich text editors pull in ESM-only dependencies that jest does not transform
jest.mock('@/ui-component/input/RichInput', () => ({ RichInput: () => null }))
jest.mock('@/ui-component/dialog/ExpandRichInputDialog', () => () => null)
jest.mock('@/utils/xmlTagUtils', () => ({}))
jest.mock('@/ui-component/markdown/MemoizedReactMarkdown', () => ({ MemoizedReactMarkdown: () => null }))
// the real module reads import.meta.env, which jest cannot parse
jest.mock('@/store/constant', () => ({ baseURL: 'http://localhost', FLOWISE_CREDENTIAL_ID: 'FLOWISE_CREDENTIAL_ID', AGENTFLOW_ICONS: [] }))

const data = { id: 'node_1', name: 'toolAgentflow', inputs: { temperature: '0.5' }, inputParams: [], selected: false }
const inputParam = {
    id: 'node_1-input-temperature-number',
    name: 'temperature',
    label: 'Temperature',
    type: 'number',
    description: 'Controls randomness',
    placeholder: 'Enter a value',
    optional: true
}

const renderHandler = (param = inputParam, nodeData = data) => {
    const store = createStore(
        (state = { customization: { isDarkMode: false, borderRadius: 4 }, canvas: { chatflow: null }, notifier: { notifications: [] } }) =>
            state
    )
    return render(
        <Provider store={store}>
            <SnackbarProvider>
                <ConfirmContextProvider>
                    <MemoryRouter>
                        <ErrorProvider>
                            <flowContext.Provider value={{ reactFlowInstance: null, deleteEdge: () => {}, onNodeDataChange: () => {} }}>
                                <NodeInputHandler inputParam={param} data={nodeData} />
                            </flowContext.Provider>
                        </ErrorProvider>
                    </MemoryRouter>
                </ConfirmContextProvider>
            </SnackbarProvider>
        </Provider>
    )
}

jest.setTimeout(30000)

describe('NodeInputHandler node catalog translation', () => {
    beforeEach(async () => {
        // the dialogs mounted by the handler render into this portal element
        if (!document.getElementById('portal')) {
            const portal = document.createElement('div')
            portal.id = 'portal'
            document.body.appendChild(portal)
        }
        window.localStorage.clear()
        i18n.addResourceBundle('zh-CN', 'nodes', { Temperature: '温度', 'Enter a value': '输入一个值' }, true, true)
        await act(async () => {
            await i18n.changeLanguage('en')
        })
    })

    it('shows the parameter label in English in en', () => {
        renderHandler()
        expect(screen.getByText('Temperature')).toBeInTheDocument()
    })

    it('shows the translated parameter label in zh-CN and falls back for untranslated labels', async () => {
        await act(async () => {
            await i18n.changeLanguage('zh-CN')
        })
        renderHandler()
        expect(screen.getByText('温度')).toBeInTheDocument()

        renderHandler({ ...inputParam, id: 'x', name: 'topP', label: 'Unmapped Parameter' })
        expect(screen.getByText('Unmapped Parameter')).toBeInTheDocument()
    })

    it('switches an already rendered parameter without a reload', async () => {
        renderHandler()
        expect(screen.getByText('Temperature')).toBeInTheDocument()
        await act(async () => {
            await i18n.changeLanguage('zh-CN')
        })
        expect(screen.getByText('温度')).toBeInTheDocument()
        expect(screen.queryByText('Temperature')).not.toBeInTheDocument()
    })

    it('translates the placeholder of a text parameter and keeps the stored value untouched', async () => {
        await act(async () => {
            await i18n.changeLanguage('zh-CN')
        })
        const textParam = { ...inputParam, id: 'node_1-input-name-string', name: 'name', type: 'string', label: 'Name' }
        renderHandler(textParam)
        const field = screen.getByPlaceholderText('输入一个值')
        expect(field).toHaveValue('')
        expect(data.inputs).toEqual({ temperature: '0.5' })
    })
})

describe('NodeInputHandler WeChat direction warning', () => {
    const directionParam = {
        id: 'startAgentflow_0-input-wechatDirection-options',
        name: 'wechatDirection',
        label: 'Direction',
        type: 'options',
        default: 'in',
        options: [
            { label: 'Inbound Only', name: 'in' },
            { label: 'Outbound Only', name: 'out' },
            { label: 'Inbound and Outbound', name: 'any' }
        ]
    }
    const startData = (inputs) => ({ id: 'startAgentflow_0', name: 'startAgentflow', inputs, inputParams: [], selected: false })
    const warning = /trigger itself again/

    beforeEach(async () => {
        if (!document.getElementById('portal')) {
            const portal = document.createElement('div')
            portal.id = 'portal'
            document.body.appendChild(portal)
        }
        await act(async () => {
            await i18n.changeLanguage('en')
        })
    })

    it('shows no warning for inbound only (explicit or default)', () => {
        renderHandler(directionParam, startData({ wechatDirection: 'in' }))
        expect(screen.queryByText(warning)).not.toBeInTheDocument()
    })

    it('shows no warning while the direction is still unset (default is inbound)', () => {
        renderHandler(directionParam, startData({}))
        expect(screen.queryByText(warning)).not.toBeInTheDocument()
    })

    it.each(['out', 'any'])('warns about a reply loop when the direction is %s', (direction) => {
        renderHandler(directionParam, startData({ wechatDirection: direction }))
        expect(screen.getByText(warning)).toBeInTheDocument()
    })

    it('does not warn on other parameters', () => {
        renderHandler(inputParam, startData({ wechatDirection: 'any' }))
        expect(screen.queryByText(warning)).not.toBeInTheDocument()
    })
})
