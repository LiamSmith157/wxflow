/**
 * @jest-environment <rootDir>/src/__test_utils__/jest-environment-jsdom.js
 */
import { render, screen, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom'

import i18n from '@/i18n'
import LanguageSwitcher from './index'

describe('LanguageSwitcher', () => {
    beforeEach(async () => {
        window.localStorage.clear()
        await act(async () => {
            await i18n.changeLanguage('en')
        })
    })

    const openMenu = () => fireEvent.click(screen.getByLabelText('Language'))

    it('lists English and 简体中文 and marks the current language as selected', () => {
        render(<LanguageSwitcher />)
        openMenu()

        expect(screen.getByRole('menuitem', { name: 'English' })).toHaveClass('Mui-selected')
        expect(screen.getByRole('menuitem', { name: '简体中文' })).not.toHaveClass('Mui-selected')
    })

    it('switches the language immediately and persists it', async () => {
        render(<LanguageSwitcher />)
        openMenu()
        await act(async () => {
            fireEvent.click(screen.getByRole('menuitem', { name: '简体中文' }))
        })

        expect(i18n.resolvedLanguage).toBe('zh-CN')
        expect(window.localStorage.getItem('lang')).toBe('zh-CN')
        // the trigger label is itself translated, proving the component re-rendered without a page reload
        expect(screen.getByLabelText('语言')).toBeInTheDocument()
    })

    it('keeps the chosen language selected after re-opening the menu', async () => {
        render(<LanguageSwitcher />)
        openMenu()
        await act(async () => {
            fireEvent.click(screen.getByRole('menuitem', { name: '简体中文' }))
        })
        fireEvent.click(screen.getByLabelText('语言'))

        expect(screen.getByRole('menuitem', { name: '简体中文' })).toHaveClass('Mui-selected')
    })
})
