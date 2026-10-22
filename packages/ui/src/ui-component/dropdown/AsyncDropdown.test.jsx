/**
 * @jest-environment <rootDir>/src/__test_utils__/jest-environment-jsdom.js
 */
import { render, screen, fireEvent, act, within, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import axios from 'axios'
import { Provider } from 'react-redux'
import { createStore } from 'redux'

import i18n from '@/i18n'
import { AsyncDropdown } from './AsyncDropdown'

jest.mock('@/api/credentials', () => ({ __esModule: true, default: { getCredentialsByName: jest.fn() } }))
// the real module reads import.meta, which jest cannot parse
jest.mock('@/store/constant', () => ({ baseURL: 'http://localhost' }))
jest.mock('@/utils/genericHelper', () => ({ getAvailableNodesForVariable: () => [] }))

const resources = [
    { label: '海报-北京', name: 'res://id/id-bj', description: '海报', group: '海报' },
    { label: '海报-上海', name: 'res://id/id-sh', description: '海报', group: '海报' },
    { label: '产品图', name: 'res://id/id-p', group: 'Ungrouped' }
]

const nodeData = {
    id: 'wechatSendImageAgentflow_0',
    name: 'wechatSendImageAgentflow',
    inputParams: [{ name: 'wechatMedia', type: 'asyncOptions', loadMethod: 'listImageResources', freeSolo: true }],
    inputs: {}
}

const renderDropdown = async (props = {}) => {
    const onSelect = jest.fn()
    const store = createStore((state = { customization: { isDarkMode: false } }) => state)
    await act(async () => {
        render(
            <Provider store={store}>
                <AsyncDropdown name='wechatMedia' nodeData={nodeData} value='' onSelect={onSelect} freeSolo {...props} />
            </Provider>
        )
    })
    return { onSelect, input: screen.getByRole('combobox') }
}

jest.setTimeout(30000)

describe('AsyncDropdown with free text (freeSolo)', () => {
    beforeEach(async () => {
        jest.spyOn(axios, 'post').mockResolvedValue({ data: resources })
        jest.spyOn(console, 'error').mockImplementation(() => {})
        await act(async () => {
            await i18n.changeLanguage('en')
        })
    })
    afterEach(() => jest.restoreAllMocks())

    it('asks the server for the options of the parameter', async () => {
        await renderDropdown()
        expect(axios.post).toHaveBeenCalledTimes(1)
        expect(axios.post.mock.calls[0][0]).toContain('/api/v1/node-load-method/wechatSendImageAgentflow')
        expect(axios.post.mock.calls[0][1]).toMatchObject({ loadMethod: 'listImageResources' })
    })

    it('shows the name of the resource stored as res://id/<id>', async () => {
        const { input } = await renderDropdown({ value: 'res://id/id-bj' })
        await waitFor(() => expect(input).toHaveValue('海报-北京'))
    })

    it('stores res://id/<id> when a resource is picked, and lists them under their group', async () => {
        const { onSelect, input } = await renderDropdown()
        fireEvent.mouseDown(input)
        const list = screen.getByRole('listbox')
        const headers = [...list.querySelectorAll('.MuiAutocomplete-groupLabel')].map((h) => h.textContent)
        expect(headers).toEqual(['海报', 'Ungrouped'])
        await act(async () => {
            fireEvent.click(within(list).getByText('海报-上海'))
        })
        expect(onSelect).toHaveBeenLastCalledWith('res://id/id-sh')
    })

    it('keeps a typed path when the field loses focus', async () => {
        const { onSelect, input } = await renderDropdown()
        await act(async () => {
            fireEvent.change(input, { target: { value: 'D:\\素材\\海报.jpg' } })
            fireEvent.blur(input)
        })
        expect(onSelect).toHaveBeenLastCalledWith('D:\\素材\\海报.jpg')
    })

    it('keeps a typed res://name/ reference, variables included, when Enter is pressed', async () => {
        const { onSelect, input } = await renderDropdown()
        await act(async () => {
            fireEvent.change(input, { target: { value: 'res://name/海报-{{ $wechat.city }}' } })
            fireEvent.keyDown(input, { key: 'Enter' })
        })
        expect(onSelect).toHaveBeenLastCalledWith('res://name/海报-{{ $wechat.city }}')
    })

    it('turns the exact name of a resource typed in into a pick of that resource', async () => {
        const { onSelect, input } = await renderDropdown()
        await act(async () => {
            fireEvent.change(input, { target: { value: '海报-北京' } })
            fireEvent.keyDown(input, { key: 'Enter' })
        })
        expect(onSelect).toHaveBeenLastCalledWith('res://id/id-bj')
    })

    it('shows a stored value that is not one of the options as it is', async () => {
        const { input } = await renderDropdown({ value: 'res://name/海报-{{ $wechat.city }}' })
        await waitFor(() => expect(input).toHaveValue('res://name/海报-{{ $wechat.city }}'))
    })

    it('shows a stored local path as it is', async () => {
        const { input } = await renderDropdown({ value: 'D:\\素材\\海报.jpg' })
        await waitFor(() => expect(input).toHaveValue('D:\\素材\\海报.jpg'))
    })

    it('never replaces the id of a pick by its name when the field is left', async () => {
        const { onSelect, input } = await renderDropdown({ value: 'res://id/id-bj' })
        await waitFor(() => expect(input).toHaveValue('海报-北京'))
        await act(async () => {
            fireEvent.focus(input)
            fireEvent.blur(input)
        })
        const stored = onSelect.mock.calls.map((c) => c[0])
        expect(stored.every((v) => v === 'res://id/id-bj')).toBe(true)
    })
})

describe('AsyncDropdown without free text', () => {
    beforeEach(async () => {
        jest.spyOn(axios, 'post').mockResolvedValue({ data: [{ label: 'Alpha', name: 'a' }] })
        jest.spyOn(console, 'error').mockImplementation(() => {})
        await act(async () => {
            await i18n.changeLanguage('en')
        })
    })
    afterEach(() => jest.restoreAllMocks())

    it('does not accept typed text and shows no group headers', async () => {
        const { onSelect, input } = await renderDropdown({ freeSolo: false })
        await act(async () => {
            fireEvent.change(input, { target: { value: 'whatever' } })
            fireEvent.blur(input)
        })
        expect(onSelect).not.toHaveBeenCalled()
        fireEvent.mouseDown(input)
        expect(screen.queryByText('Ungrouped')).not.toBeInTheDocument()
    })
})
