/**
 * @jest-environment <rootDir>/src/__test_utils__/jest-environment-jsdom.js
 */
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Provider } from 'react-redux'
import { createStore } from 'redux'
import { ThemeProvider, createTheme } from '@mui/material/styles'

import i18n from '@/i18n'
import AddNodes from './AddNodes'

jest.mock('@/ui-component/dialog/AgentflowGeneratorDialog', () => () => null)
// the real module reads import.meta.env, which jest cannot parse
jest.mock('@/store/constant', () => ({ baseURL: 'http://localhost', AGENTFLOW_ICONS: [] }))

const nodesData = [
    { name: 'agentAgentflow', label: 'Agent', description: 'Dynamically choose and utilize tools', category: 'Agent Flows' },
    { name: 'llmAgentflow', label: 'LLM', description: 'Large language models to analyze and generate responses', category: 'Agent Flows' },
    { name: 'startAgentflow', label: 'Start', description: 'Starting point of the agentflow', category: 'Agent Flows' }
]

const renderPalette = () => {
    const store = createStore((state = { customization: { borderRadius: 4, isDarkMode: false } }) => state)
    return render(
        <Provider store={store}>
            <ThemeProvider theme={createTheme({ palette: { teal: { main: '#0d9488' } } })}>
                <AddNodes nodesData={nodesData} onFlowGenerated={() => {}} />
            </ThemeProvider>
        </Provider>
    )
}

const openPalette = () => fireEvent.click(screen.getByLabelText('add'))

jest.setTimeout(30000)

describe('AddNodes node catalog translation', () => {
    beforeEach(async () => {
        window.localStorage.clear()
        i18n.addResourceBundle(
            'zh-CN',
            'nodes',
            {
                Agent: '智能体',
                'Agent Flows': '智能体流程',
                'Starting point of the agentflow': '智能体流程的起点'
            },
            true,
            true
        )
        await act(async () => {
            await i18n.changeLanguage('en')
        })
    })

    it('shows the English node text in en', () => {
        renderPalette()
        openPalette()
        expect(screen.getByText('Agent')).toBeInTheDocument()
        expect(screen.getByText('Starting point of the agentflow')).toBeInTheDocument()
    })

    it('shows translated text in zh-CN, falls back per string, and keeps count and order', async () => {
        await act(async () => {
            await i18n.changeLanguage('zh-CN')
        })
        renderPalette()
        openPalette()

        expect(screen.getByText('智能体')).toBeInTheDocument()
        expect(screen.getByText('智能体流程的起点')).toBeInTheDocument()
        // untranslated nodes stay in English
        expect(screen.getByText('LLM')).toBeInTheDocument()
        expect(screen.getByText('Dynamically choose and utilize tools')).toBeInTheDocument()
        expect(document.querySelectorAll('[draggable="true"]')).toHaveLength(3)
    })

    it('updates an open palette when the language changes', async () => {
        renderPalette()
        openPalette()
        expect(screen.getByText('Agent')).toBeInTheDocument()
        await act(async () => {
            await i18n.changeLanguage('zh-CN')
        })
        expect(screen.getByText('智能体')).toBeInTheDocument()
        expect(screen.queryByText('Agent')).not.toBeInTheDocument()
    })

    it('searches by the English name and by the translated name', async () => {
        jest.useFakeTimers()
        await act(async () => {
            await i18n.changeLanguage('zh-CN')
        })
        renderPalette()
        openPalette()
        const search = screen.getByPlaceholderText(/.+/, { selector: 'input' })

        fireEvent.change(search, { target: { value: '智能体' } })
        act(() => jest.advanceTimersByTime(600))
        expect(document.querySelectorAll('[draggable="true"]')).toHaveLength(1)

        fireEvent.change(search, { target: { value: 'llm' } })
        act(() => jest.advanceTimersByTime(600))
        const items = document.querySelectorAll('[draggable="true"]')
        expect(items).toHaveLength(1)
        expect(within(items[0]).getByText('LLM')).toBeInTheDocument()
        jest.useRealTimers()
    })
})
