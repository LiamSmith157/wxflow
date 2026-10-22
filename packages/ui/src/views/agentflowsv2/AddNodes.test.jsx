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
jest.mock('@/store/constant', () => {
    const React = require('react')
    // eslint-disable-next-line react/display-name, react/prop-types
    const icon = (name) => (props) => React.createElement('svg', { 'data-testid': `icon-${name}`, width: props.size, color: props.color })
    return {
        baseURL: 'http://localhost',
        AGENTFLOW_PALETTE_CATEGORIES: ['Agent Flows', 'WeChat'],
        AGENTFLOW_ICONS: [
            { name: 'wechatSendTextAgentflow', icon: icon('wechatSendTextAgentflow'), color: '#07C160' },
            { name: 'wechatSendImageAgentflow', icon: icon('wechatSendImageAgentflow'), color: '#07C160' },
            { name: 'cooldownAgentflow', icon: icon('cooldownAgentflow'), color: '#5BB7E5' }
        ]
    }
})

const nodesData = [
    { name: 'agentAgentflow', label: 'Agent', description: 'Dynamically choose and utilize tools', category: 'Agent Flows' },
    { name: 'llmAgentflow', label: 'LLM', description: 'Large language models to analyze and generate responses', category: 'Agent Flows' },
    { name: 'startAgentflow', label: 'Start', description: 'Starting point of the agentflow', category: 'Agent Flows' }
]

const channelNodesData = [
    {
        name: 'wechatSendTextAgentflow',
        label: 'Send Text',
        description: 'Send a text message from a WeChat account',
        category: 'WeChat',
        color: '#07C160'
    },
    {
        name: 'wechatSendImageAgentflow',
        label: 'Send Image',
        description: 'Send an image from a WeChat account',
        category: 'WeChat',
        color: '#07C160'
    },
    {
        name: 'cooldownAgentflow',
        label: 'Cooldown',
        description: 'Let a conversation through once per time window',
        category: 'Agent Flows',
        color: '#5BB7E5'
    },
    { name: 'chatOpenAI', label: 'ChatOpenAI', description: 'A chat model', category: 'Chat Models' },
    ...nodesData
]

const renderPalette = (data = nodesData) => {
    const store = createStore((state = { customization: { borderRadius: 4, isDarkMode: false } }) => state)
    return render(
        <Provider store={store}>
            <ThemeProvider theme={createTheme({ palette: { teal: { main: '#0d9488' } } })}>
                <AddNodes nodesData={data} onFlowGenerated={() => {}} />
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

describe('AddNodes palette groups', () => {
    beforeEach(async () => {
        window.localStorage.clear()
        i18n.addResourceBundle('zh-CN', 'nodes', { 'Agent Flows': '智能体流程', WeChat: '微信', 'Send Text': '发送文本' }, true, true)
        await act(async () => {
            await i18n.changeLanguage('en')
        })
    })

    const headers = () => Array.from(document.querySelectorAll('.MuiAccordionSummary-root')).map((el) => el.textContent)
    const labelsIn = (header) => {
        const summary = Array.from(document.querySelectorAll('.MuiAccordionSummary-root')).find((el) => el.textContent === header)
        const details = summary.parentElement.querySelector('.MuiAccordionDetails-root')
        return Array.from(details.querySelectorAll('[draggable="true"]')).map((el) => el.querySelector('span').textContent.trim())
    }

    it('shows Agent Flows first, then WeChat, and no other category', () => {
        renderPalette(channelNodesData)
        openPalette()
        expect(headers()).toEqual(['Agent Flows', 'WeChat'])
        expect(labelsIn('WeChat')).toEqual(['Send Text', 'Send Image'])
        expect(labelsIn('Agent Flows')).toEqual(['Cooldown', 'Agent', 'LLM', 'Start'])
        expect(screen.queryByText('ChatOpenAI')).not.toBeInTheDocument()
    })

    it('shows only the Agent Flows group when there are no WeChat nodes', () => {
        renderPalette(nodesData)
        openPalette()
        expect(headers()).toEqual(['Agent Flows'])
    })

    it('lets each group be collapsed and expanded on its own', () => {
        renderPalette(channelNodesData)
        openPalette()
        const summary = (name) => Array.from(document.querySelectorAll('.MuiAccordionSummary-root')).find((el) => el.textContent === name)
        expect(summary('WeChat')).toHaveAttribute('aria-expanded', 'true')
        fireEvent.click(summary('WeChat'))
        expect(summary('WeChat')).toHaveAttribute('aria-expanded', 'false')
        expect(summary('Agent Flows')).toHaveAttribute('aria-expanded', 'true')
        fireEvent.click(summary('WeChat'))
        expect(summary('WeChat')).toHaveAttribute('aria-expanded', 'true')
    })

    it('searches both groups and keeps the results grouped', () => {
        jest.useFakeTimers()
        renderPalette(channelNodesData)
        openPalette()
        const search = screen.getByPlaceholderText(/.+/, { selector: 'input' })
        fireEvent.change(search, { target: { value: 'send' } })
        act(() => jest.advanceTimersByTime(600))
        expect(headers()).toEqual(['WeChat'])
        expect(labelsIn('WeChat')).toEqual(['Send Text', 'Send Image'])

        fireEvent.change(search, { target: { value: 'l' } })
        act(() => jest.advanceTimersByTime(600))
        expect(headers()).toEqual(['Agent Flows', 'WeChat'])
        jest.useRealTimers()
    })

    it('finds WeChat nodes by their translated name', async () => {
        jest.useFakeTimers()
        await act(async () => {
            await i18n.changeLanguage('zh-CN')
        })
        renderPalette(channelNodesData)
        openPalette()
        expect(headers()).toEqual(['智能体流程', '微信'])
        const search = screen.getByPlaceholderText(/.+/, { selector: 'input' })
        fireEvent.change(search, { target: { value: '发送文本' } })
        act(() => jest.advanceTimersByTime(600))
        expect(headers()).toEqual(['微信'])
        expect(document.querySelectorAll('[draggable="true"]')).toHaveLength(1)
        jest.useRealTimers()
    })

    it('renders the icon of each node, in the node color', () => {
        renderPalette(channelNodesData)
        openPalette()
        for (const name of ['wechatSendTextAgentflow', 'wechatSendImageAgentflow', 'cooldownAgentflow']) {
            expect(screen.getByTestId(`icon-${name}`)).toBeInTheDocument()
        }
        expect(screen.getByTestId('icon-wechatSendTextAgentflow')).toHaveAttribute('color', '#07C160')
    })
})
