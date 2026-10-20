/**
 * @jest-environment <rootDir>/src/__test_utils__/jest-environment-jsdom.js
 */
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Provider } from 'react-redux'
import { createStore } from 'redux'

import i18n from '@/i18n'
import { Dropdown } from './Dropdown'
import { MultiDropdown } from './MultiDropdown'

const options = [
    { name: 'sequence', label: 'Sequence', description: 'Run steps in order' },
    { name: 'parallel', label: 'Parallel', description: 'Run steps together' },
    { name: 'gpt-4o', label: 'gpt-4o' }
]

const renderWithStore = (ui) => {
    const store = createStore((state = { customization: { isDarkMode: false } }) => state)
    return render(<Provider store={store}>{ui}</Provider>)
}

jest.setTimeout(30000)

describe('node option dropdowns', () => {
    beforeEach(async () => {
        window.localStorage.clear()
        i18n.addResourceBundle(
            'zh-CN',
            'nodes',
            { Sequence: '顺序', 'Run steps in order': '按顺序执行各步骤', Parallel: '并行' },
            true,
            true
        )
        await act(async () => {
            await i18n.changeLanguage('en')
        })
    })

    const choose = async (labelText) => {
        fireEvent.mouseDown(screen.getByRole('combobox'))
        await act(async () => {
            fireEvent.click(within(screen.getByRole('listbox')).getByText(labelText))
        })
    }

    it('lists English labels in en', () => {
        renderWithStore(<Dropdown name='mode' options={options} onSelect={() => {}} />)
        fireEvent.mouseDown(screen.getByRole('combobox'))
        expect(within(screen.getByRole('listbox')).getByText('Sequence')).toBeInTheDocument()
        expect(screen.getByText('Run steps in order')).toBeInTheDocument()
    })

    it('shows translated labels and descriptions in zh-CN, with English fallback per option', async () => {
        await act(async () => {
            await i18n.changeLanguage('zh-CN')
        })
        renderWithStore(<Dropdown name='mode' options={options} onSelect={() => {}} />)
        fireEvent.mouseDown(screen.getByRole('combobox'))
        const list = within(screen.getByRole('listbox'))
        expect(list.getByText('顺序')).toBeInTheDocument()
        expect(list.getByText('按顺序执行各步骤')).toBeInTheDocument()
        expect(list.getByText('Run steps together')).toBeInTheDocument()
        expect(list.getByText('gpt-4o')).toBeInTheDocument()
    })

    it('saves the same option name whichever language the option was chosen in', async () => {
        const chosen = {}
        for (const [lng, label] of [
            ['en', 'Sequence'],
            ['zh-CN', '顺序']
        ]) {
            await act(async () => {
                await i18n.changeLanguage(lng)
            })
            const onSelect = jest.fn()
            const { unmount } = renderWithStore(<Dropdown name='mode' options={options} onSelect={onSelect} />)
            await choose(label)
            chosen[lng] = onSelect.mock.calls[0][0]
            unmount()
        }
        expect(chosen).toEqual({ en: 'sequence', 'zh-CN': 'sequence' })
    })

    it('shows the selected option in the current language and matches typing in either language', async () => {
        await act(async () => {
            await i18n.changeLanguage('zh-CN')
        })
        renderWithStore(<Dropdown name='mode' value='parallel' options={options} onSelect={() => {}} />)
        const input = screen.getByRole('combobox')
        expect(input).toHaveValue('并行')

        fireEvent.mouseDown(input)
        fireEvent.change(input, { target: { value: 'seq' } })
        expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1)
        fireEvent.change(input, { target: { value: '顺序' } })
        expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1)
    })

    it('MultiDropdown saves option names, not labels', async () => {
        await act(async () => {
            await i18n.changeLanguage('zh-CN')
        })
        const onSelect = jest.fn()
        renderWithStore(<MultiDropdown name='modes' options={options} onSelect={onSelect} />)
        await choose('并行')
        expect(onSelect).toHaveBeenCalledWith(JSON.stringify(['parallel']))
    })
})
