/**
 * @jest-environment <rootDir>/src/__test_utils__/jest-environment-jsdom.js
 */
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import { render, screen, act } from '@testing-library/react'
import '@testing-library/jest-dom'

import i18n from '@/i18n'
import NavGroup from './NavGroup'

jest.mock('@tabler/icons-react', () => new Proxy({}, { get: (_, key) => (key === '__esModule' ? undefined : () => null) }))
jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => true, hasDisplay: () => true }) }))
jest.mock('@/ui-component/rbac/available', () => ({ Available: ({ children }) => children }))
jest.mock('@/config', () => ({ __esModule: true, default: { basename: '', defaultPath: '/' } }))

const item = {
    id: 'dashboard',
    title: '',
    type: 'group',
    children: [
        {
            id: 'primary',
            title: '',
            type: 'group',
            children: [{ id: 'executions', title: 'menu:executions', type: 'item', url: '/executions' }]
        },
        {
            id: 'others',
            title: 'menu:others',
            type: 'group',
            children: [{ id: 'logs', title: 'menu:logs', type: 'item', url: '/logs' }]
        }
    ]
}

const renderGroup = () => {
    const store = configureStore({
        reducer: { customization: () => ({ isOpen: [], borderRadius: 12, opened: true, isDarkMode: false }) }
    })
    return render(
        <Provider store={store}>
            <MemoryRouter>
                <NavGroup item={item} />
            </MemoryRouter>
        </Provider>
    )
}

describe('sidebar menu translation', () => {
    beforeEach(async () => {
        await act(async () => {
            await i18n.changeLanguage('en')
        })
    })

    it('renders English titles', () => {
        renderGroup()
        expect(screen.getByText('Executions')).toBeInTheDocument()
        expect(screen.getByText('Others')).toBeInTheDocument()
        expect(screen.getByText('Logs')).toBeInTheDocument()
    })

    it('re-renders in Chinese immediately when the language changes, keeping entries and links', async () => {
        renderGroup()
        await act(async () => {
            await i18n.changeLanguage('zh-CN')
        })

        expect(screen.getByText('执行记录')).toBeInTheDocument()
        expect(screen.getByText('其他')).toBeInTheDocument()
        expect(screen.getByText('日志')).toBeInTheDocument()
        expect(screen.queryByText('Executions')).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: '执行记录' })).toHaveAttribute('href', '/executions')
        expect(screen.getByRole('button', { name: '日志' })).toHaveAttribute('href', '/logs')
    })

    it('does not render a caption for an untitled group', () => {
        const { container } = renderGroup()
        expect(container.querySelectorAll('.MuiList-padding .MuiTypography-caption')).toHaveLength(1)
    })
})
