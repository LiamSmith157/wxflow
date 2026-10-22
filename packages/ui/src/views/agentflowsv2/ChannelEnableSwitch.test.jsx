/**
 * @jest-environment <rootDir>/src/__test_utils__/jest-environment-jsdom.js
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Provider } from 'react-redux'
import { createStore } from 'redux'
import { SnackbarProvider } from 'notistack'
import { MemoryRouter } from 'react-router-dom'

import i18n from '@/i18n'
import { ErrorProvider } from '@/store/context/ErrorContext'
import chatflowsApi from '@/api/chatflows'
import ChannelEnableSwitch, { isChannelFlow } from './ChannelEnableSwitch'

// the real module reads import.meta.env, which jest cannot parse
jest.mock('@/store/constant', () => ({
    baseURL: 'http://localhost',
    ErrorMessage: {
        INVALID_MISSING_TOKEN: 'Invalid or Missing token',
        TOKEN_EXPIRED: 'Token Expired',
        REFRESH_TOKEN_EXPIRED: 'Refresh Token Expired'
    },
    AGENTFLOW_ICONS: []
}))
jest.mock('@/api/chatflows', () => ({
    __esModule: true,
    default: { getChannelStatus: jest.fn(), toggleChannelEnabled: jest.fn() }
}))

const flowWith = (startInputType) => ({
    id: 'flow-1',
    updatedDate: '2030-01-01',
    flowData: JSON.stringify({
        nodes: [{ id: 'startAgentflow_0', data: { name: 'startAgentflow', inputs: { startInputType } } }],
        edges: []
    })
})

const renderSwitch = (chatflow) => {
    const store = createStore((state = { notifier: { notifications: [] } }) => state)
    return render(
        <Provider store={store}>
            <SnackbarProvider>
                <MemoryRouter>
                    <ErrorProvider>
                        <ChannelEnableSwitch chatflow={chatflow} />
                    </ErrorProvider>
                </MemoryRouter>
            </SnackbarProvider>
        </Provider>
    )
}

jest.setTimeout(30000)

beforeEach(async () => {
    jest.clearAllMocks()
    chatflowsApi.getChannelStatus.mockResolvedValue({ data: { enabled: false, subscribed: true } })
    chatflowsApi.toggleChannelEnabled.mockImplementation(async (_id, enabled) => ({ data: { enabled, subscribed: true } }))
    await act(async () => {
        await i18n.changeLanguage('en')
    })
})

describe('isChannelFlow', () => {
    it('is true only for a Start node with the WeChat Event input type', () => {
        expect(isChannelFlow(flowWith('wechatEvent').flowData)).toBe(true)
        expect(isChannelFlow(flowWith('chatInput').flowData)).toBe(false)
        expect(isChannelFlow(flowWith('scheduleInput').flowData)).toBe(false)
        expect(isChannelFlow('not json')).toBe(false)
        expect(isChannelFlow(undefined)).toBe(false)
    })
})

describe('ChannelEnableSwitch', () => {
    it('shows an off switch for a new WeChat Event flow', async () => {
        renderSwitch(flowWith('wechatEvent'))
        const toggle = await screen.findByRole('checkbox', { name: 'wechat-flow-enabled' })
        expect(toggle).not.toBeChecked()
        expect(chatflowsApi.getChannelStatus).toHaveBeenCalledWith('flow-1')
    })

    it('shows an on switch for an enabled flow', async () => {
        chatflowsApi.getChannelStatus.mockResolvedValue({ data: { enabled: true, subscribed: true } })
        renderSwitch(flowWith('wechatEvent'))
        expect(await screen.findByRole('checkbox', { name: 'wechat-flow-enabled' })).toBeChecked()
    })

    it('calls the enable endpoint when switched on, and the disable one when switched off', async () => {
        renderSwitch(flowWith('wechatEvent'))
        const toggle = await screen.findByRole('checkbox', { name: 'wechat-flow-enabled' })
        fireEvent.click(toggle)
        await waitFor(() => expect(chatflowsApi.toggleChannelEnabled).toHaveBeenCalledWith('flow-1', true))
        await waitFor(() => expect(screen.getByRole('checkbox', { name: 'wechat-flow-enabled' })).toBeChecked())
        fireEvent.click(screen.getByRole('checkbox', { name: 'wechat-flow-enabled' }))
        await waitFor(() => expect(chatflowsApi.toggleChannelEnabled).toHaveBeenLastCalledWith('flow-1', false))
    })

    it('renders nothing for flows that do not start from a WeChat event', () => {
        renderSwitch(flowWith('scheduleInput'))
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
        expect(chatflowsApi.getChannelStatus).not.toHaveBeenCalled()
    })

    it('renders nothing for a flow that has not been saved yet', () => {
        renderSwitch({ ...flowWith('wechatEvent'), id: undefined })
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
        expect(chatflowsApi.getChannelStatus).not.toHaveBeenCalled()
    })
})
