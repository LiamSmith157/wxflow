/**
 * @jest-environment <rootDir>/src/__test_utils__/jest-environment-jsdom.js
 */
import { render, screen, act, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

import i18n from '@/i18n'
import TrialInfo from './Sidebar/TrialInfo'
import ViewHeader from './ViewHeader'

jest.mock('@tabler/icons-react', () => new Proxy({}, { get: (_, key) => (key === '__esModule' ? undefined : () => null) }))
jest.mock('@/hooks/useSearchShortcut', () => ({ __esModule: true, default: () => {} }))
jest.mock('@/ui-component/button/StyledFab', () => ({ StyledFab: (props) => <button {...props} /> }))
jest.mock('@/ui-component/button/StyledButton', () => ({ StyledButton: (props) => <button {...props} /> }))
jest.mock('@/utils/genericHelper', () => ({ getOS: () => 'linux' }))

const setLanguage = (lng) =>
    act(async () => {
        await i18n.changeLanguage(lng)
    })

describe('layout text', () => {
    beforeEach(() => setLanguage('en'))

    it('translates the trial info sentence with its highlighted days', async () => {
        render(<TrialInfo billingPortalUrl='#' isLoading={false} paymentMethodExists={false} trialDaysLeft={5} />)
        expect(screen.getByText('5 days left')).toBeInTheDocument()
        await setLanguage('zh-CN')
        expect(screen.getByText('5 天')).toBeInTheDocument()
        expect(screen.getByText('更新支付方式')).toBeInTheDocument()
        expect(screen.getByText(/请更新支付方式以避免服务中断/)).toBeInTheDocument()
    })

    it('translates the ViewHeader defaults but keeps an explicit placeholder', async () => {
        const { rerender } = render(<ViewHeader search onSearchChange={() => {}} isBackButton onBack={() => {}} title='T' />)
        expect(screen.getByPlaceholderText(/^Search/)).toBeInTheDocument()
        await setLanguage('zh-CN')
        expect(screen.getByPlaceholderText(/^搜索/)).toBeInTheDocument()
        expect(screen.getByTitle('返回')).toBeInTheDocument()

        rerender(<ViewHeader search onSearchChange={() => {}} searchPlaceholder='自定义' title='T' />)
        expect(screen.getByPlaceholderText(/^自定义/)).toBeInTheDocument()
        fireEvent.change(screen.getByPlaceholderText(/^自定义/), { target: { value: 'x' } })
    })
})
