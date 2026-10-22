/**
 * @jest-environment <rootDir>/src/__test_utils__/jest-environment-jsdom.js
 */
import { render, screen, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Provider } from 'react-redux'
import { createStore } from 'redux'

import i18n from '@/i18n'
import channelInstancesApi from '@/api/channelInstances'
import ChannelInstances from './index'

jest.mock('@/store/constant', () => ({ baseURL: 'http://localhost' }))
jest.mock('@/layout/MainLayout/ViewHeader', () => ({ __esModule: true, default: ({ title }) => <h1>{title}</h1> }))
jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: (p) => global.__permissions.includes(p) }) }))
jest.mock('@/api/channelInstances', () => ({
    __esModule: true,
    default: {
        getInstances: jest.fn(),
        assignInstance: jest.fn(),
        getGatewayStatus: jest.fn(),
        getSettings: jest.fn(),
        updateSettings: jest.fn(),
        sendTestImage: jest.fn()
    }
}))

const status = {
    state: 'running',
    host: '127.0.0.1',
    port: 56233,
    media: { ok: true }
}
const settings = { masterEnabled: true, sendRateLimitPerMinute: 20 }
const instance = { id: 'i1', instanceKey: 'wxid_a', displayName: 'Alice', online: true, workspaceId: null, lastSeenAt: null }

const renderPage = (instances, gatewayStatus = status) => {
    channelInstancesApi.getGatewayStatus.mockResolvedValue({ data: gatewayStatus })
    channelInstancesApi.getSettings.mockResolvedValue({ data: settings })
    channelInstancesApi.getInstances.mockResolvedValue({ data: instances })
    const store = createStore((state = { notifier: { notifications: [] }, auth: { user: { activeWorkspaceId: 'w1' } } }) => state)
    return render(
        <Provider store={store}>
            <ChannelInstances />
        </Provider>
    )
}

jest.setTimeout(30000)

describe('ChannelInstances page', () => {
    beforeEach(async () => {
        await act(async () => {
            await i18n.changeLanguage('en')
        })
        global.__permissions = ['channelInstances:view', 'channelInstances:manage']
    })

    it('shows the dialPort hint and the gateway address when no instance has connected', async () => {
        renderPage([])
        await waitFor(() => expect(screen.getByText(/dialPort/)).toBeInTheDocument())
        expect(screen.getByText(/Listening on 127.0.0.1:56233/)).toBeInTheDocument()
        expect(screen.getByText(/dialPort.*56233/)).toBeInTheDocument()
    })

    it('shows nothing about the media folder while it is healthy', async () => {
        renderPage([])
        await waitFor(() => expect(screen.getByText(/Listening on 127.0.0.1:56233/)).toBeInTheDocument())
        expect(screen.queryByTestId('media-dir-problem')).not.toBeInTheDocument()
        expect(screen.queryByText(/exchange/i)).not.toBeInTheDocument()
    })

    it('shows why the media folder is unusable', async () => {
        const error = '媒体目录不可用: C:\\Users\\op\\.wxflow\\wechat(EACCES),请检查该目录的权限和磁盘空间'
        renderPage([], { ...status, media: { ok: false, error } })
        await waitFor(() => expect(screen.getByTestId('media-dir-problem')).toBeInTheDocument())
        expect(screen.getByTestId('media-dir-problem')).toHaveTextContent(error)
        expect(screen.getByTestId('media-dir-problem')).toHaveTextContent('Media folder problem')
    })

    it('lists instances and offers assignment to managers', async () => {
        renderPage([instance])
        await waitFor(() => expect(screen.getByTestId('instance-wxid_a')).toBeInTheDocument())
        expect(screen.getAllByRole('button').some((b) => /assign/i.test(b.textContent))).toBe(true)
    })

    it('hides assignment and test-image actions without the manage permission', async () => {
        global.__permissions = ['channelInstances:view']
        renderPage([instance])
        await waitFor(() => expect(screen.getByTestId('instance-wxid_a')).toBeInTheDocument())
        const row = screen.getByTestId('instance-wxid_a')
        expect(row.querySelectorAll('button')).toHaveLength(0)
    })
})
