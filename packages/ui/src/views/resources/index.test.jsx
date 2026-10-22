/**
 * @jest-environment <rootDir>/src/__test_utils__/jest-environment-jsdom.js
 */
import { render, screen, waitFor, act, fireEvent, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Provider } from 'react-redux'
import { createStore } from 'redux'

import i18n from '@/i18n'
import resourcesApi from '@/api/resources'
import Resources from './index'

jest.mock('@/store/constant', () => ({ baseURL: 'http://localhost' }))
jest.mock('@/layout/MainLayout/ViewHeader', () => ({
    __esModule: true,
    default: ({ title, onSearchChange, searchPlaceholder, children }) => (
        <div>
            <h1>{title}</h1>
            <input aria-label='search' placeholder={searchPlaceholder} onChange={onSearchChange} />
            {children}
        </div>
    )
}))
jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: (p) => global.__permissions.includes(p) }) }))
jest.mock('@/api/resources', () => ({
    __esModule: true,
    default: {
        getResources: jest.fn(),
        createResource: jest.fn(),
        updateResource: jest.fn(),
        replaceResourceFile: jest.fn(),
        deleteResource: jest.fn(),
        getResourceUsages: jest.fn(),
        getResourceFile: jest.fn()
    }
}))

const ALL = ['resources:view', 'resources:create', 'resources:update', 'resources:delete']

const make = (over) => ({
    kind: 'file',
    mimeType: 'application/pdf',
    ext: '.pdf',
    size: 2048,
    originalName: 'a.pdf',
    groupName: null,
    usageCount: 0,
    createdDate: '2026-10-20T08:00:00.000Z',
    updatedDate: '2026-10-21T08:00:00.000Z',
    ...over
})
const rows = [
    make({ id: 'r1', name: '海报-北京', groupName: '海报', kind: 'image', mimeType: 'image/png', ext: '.png', usageCount: 2 }),
    make({ id: 'r2', name: '海报-上海', groupName: '海报', kind: 'image', mimeType: 'image/png', ext: '.png' }),
    make({ id: 'r3', name: '开业视频', groupName: '视频', kind: 'video', mimeType: 'video/mp4', ext: '.mp4', size: 5 * 1024 * 1024 }),
    make({ id: 'r4', name: '合同' })
]

const renderPage = async (data = rows) => {
    resourcesApi.getResources.mockResolvedValue({ data })
    const store = createStore((state = { notifier: { notifications: [] } }) => state)
    await act(async () => {
        render(
            <Provider store={store}>
                <Resources />
            </Provider>
        )
    })
}

const names = () => screen.queryAllByTestId(/^resource-/).map((row) => within(row).getAllByRole('cell')[1].textContent)
const click = async (element) => act(async () => fireEvent.click(element))

jest.setTimeout(30000)

beforeEach(async () => {
    jest.clearAllMocks()
    global.__permissions = ALL
    resourcesApi.getResourceFile.mockRejectedValue(new Error('no preview in tests'))
    resourcesApi.getResourceUsages.mockResolvedValue({ data: [] })
    await act(async () => {
        await i18n.changeLanguage('en')
    })
})

describe('Resources page: browsing', () => {
    it('lists the resources with type, size and how many flows use them', async () => {
        await renderPage()
        expect(names()).toEqual(['海报-北京', '海报-上海', '开业视频', '合同'])
        const row = within(screen.getByTestId('resource-开业视频'))
        expect(row.getByText('Video')).toBeInTheDocument()
        expect(row.getByText('5.0 MB')).toBeInTheDocument()
        expect(within(screen.getByTestId('resource-海报-北京')).getByRole('button', { name: 'usage-海报-北京' })).toHaveTextContent('2')
    })

    it('shows the groups with their counts and filters by group', async () => {
        await renderPage()
        const groups = screen.getByRole('list', { name: 'groups' })
        expect(within(groups).getByLabelText('group-All')).toHaveTextContent('4')
        expect(within(groups).getByLabelText('group-海报')).toHaveTextContent('2')
        expect(within(groups).getByLabelText('group-Ungrouped')).toHaveTextContent('1')
        await click(within(groups).getByLabelText('group-海报'))
        expect(names()).toEqual(['海报-北京', '海报-上海'])
        await click(within(groups).getByLabelText('group-Ungrouped'))
        expect(names()).toEqual(['合同'])
        await click(within(groups).getByLabelText('group-All'))
        expect(names()).toHaveLength(4)
    })

    it('searches by name', async () => {
        await renderPage()
        await act(async () => fireEvent.change(screen.getByLabelText('search'), { target: { value: '上海' } }))
        expect(names()).toEqual(['海报-上海'])
        await act(async () => fireEvent.change(screen.getByLabelText('search'), { target: { value: 'nothing like this' } }))
        expect(screen.getByText('No resource matches.')).toBeInTheDocument()
    })

    it('invites to upload the first resource when there are none', async () => {
        await renderPage([])
        expect(screen.getByText('No resources yet. Upload the first one.')).toBeInTheDocument()
    })

    it('shows why loading failed', async () => {
        resourcesApi.getResources.mockRejectedValue({ response: { data: { message: 'boom' } } })
        const store = createStore((state = { notifier: { notifications: [] } }) => state)
        await act(async () => {
            render(
                <Provider store={store}>
                    <Resources />
                </Provider>
            )
        })
        expect(screen.getByText('Could not load the resources: boom')).toBeInTheDocument()
    })
})

describe('Resources page: permissions', () => {
    it('offers no upload, replace, edit or delete to a view-only user', async () => {
        global.__permissions = ['resources:view']
        await renderPage()
        expect(screen.queryByRole('button', { name: 'Upload resource' })).not.toBeInTheDocument()
        expect(screen.queryByLabelText('edit-海报-北京')).not.toBeInTheDocument()
        expect(screen.queryByLabelText('replace-海报-北京')).not.toBeInTheDocument()
        expect(screen.queryByLabelText('delete-海报-北京')).not.toBeInTheDocument()
        expect(screen.getByLabelText('download-海报-北京')).toBeInTheDocument()
    })

    it('shows each action only with its own permission', async () => {
        global.__permissions = ['resources:view', 'resources:create', 'resources:delete']
        await renderPage()
        expect(screen.getByRole('button', { name: 'Upload resource' })).toBeInTheDocument()
        expect(screen.getByLabelText('delete-海报-北京')).toBeInTheDocument()
        expect(screen.queryByLabelText('edit-海报-北京')).not.toBeInTheDocument()
    })
})

describe('Resources page: usage', () => {
    it('lists the flows that use a resource and how they point at it', async () => {
        resourcesApi.getResourceUsages.mockResolvedValue({
            data: [
                { id: 'f1', name: '促销回复', via: 'id' },
                { id: 'f2', name: '节日群发', via: 'name' }
            ]
        })
        await renderPage()
        await click(screen.getByRole('button', { name: 'usage-海报-北京' }))
        const list = await screen.findByTestId('usage-list')
        expect(resourcesApi.getResourceUsages).toHaveBeenCalledWith('r1')
        expect(within(list).getByText('促销回复')).toBeInTheDocument()
        expect(within(list).getByText('picked from the list')).toBeInTheDocument()
        expect(within(list).getByText('by name')).toBeInTheDocument()
        expect(screen.getByText('Flows that build the name with a variable cannot be detected.')).toBeInTheDocument()
    })
})

describe('Resources page: delete', () => {
    it('shows the flows that use the resource and deletes only after confirmation', async () => {
        resourcesApi.getResourceUsages.mockResolvedValue({ data: [{ id: 'f1', name: '促销回复', via: 'id' }] })
        resourcesApi.deleteResource.mockResolvedValue({})
        await renderPage()
        await click(screen.getByLabelText('delete-海报-北京'))
        const dialog = await screen.findByRole('dialog')
        expect(await within(dialog).findByText('促销回复')).toBeInTheDocument()
        expect(within(dialog).getByText(/These flows use it/)).toBeInTheDocument()
        expect(resourcesApi.deleteResource).not.toHaveBeenCalled()
        resourcesApi.getResources.mockClear()
        await click(within(dialog).getByRole('button', { name: 'Delete' }))
        expect(resourcesApi.deleteResource).toHaveBeenCalledWith('r1')
        await waitFor(() => expect(resourcesApi.getResources).toHaveBeenCalled())
    })

    it('keeps the resource when the user cancels', async () => {
        resourcesApi.getResourceUsages.mockResolvedValue({ data: [{ id: 'f1', name: '促销回复', via: 'id' }] })
        await renderPage()
        await click(screen.getByLabelText('delete-海报-北京'))
        const dialog = await screen.findByRole('dialog')
        await within(dialog).findByText('促销回复')
        await click(within(dialog).getByRole('button', { name: 'Cancel' }))
        expect(resourcesApi.deleteResource).not.toHaveBeenCalled()
        expect(names()).toContain('海报-北京')
    })

    it('does not block deleting a resource that no flow uses', async () => {
        resourcesApi.deleteResource.mockResolvedValue({})
        await renderPage()
        await click(screen.getByLabelText('delete-合同'))
        const dialog = await screen.findByRole('dialog')
        expect(await within(dialog).findByText('No flow uses it.')).toBeInTheDocument()
        await click(within(dialog).getByRole('button', { name: 'Delete' }))
        expect(resourcesApi.deleteResource).toHaveBeenCalledWith('r4')
    })
})

describe('Resources page: rename', () => {
    const openEdit = async (name) => {
        await click(screen.getByLabelText(`edit-${name}`))
        return screen.findByRole('dialog')
    }
    const typeName = (dialog, value) => fireEvent.change(within(dialog).getByLabelText('resource-name'), { target: { value } })

    it('warns about the flows that refer to the resource by name and renames only after confirmation', async () => {
        resourcesApi.getResourceUsages.mockResolvedValue({ data: [{ id: 'f2', name: '节日群发', via: 'name' }] })
        resourcesApi.updateResource.mockResolvedValue({})
        await renderPage()
        const dialog = await openEdit('海报-北京')
        await act(async () => typeName(dialog, '海报-北京-秋季'))
        await click(within(dialog).getByRole('button', { name: 'Save' }))
        expect(resourcesApi.getResourceUsages).toHaveBeenCalledWith('r1', true)
        const warning = await within(dialog).findByTestId('rename-warning')
        expect(within(warning).getByText('节日群发')).toBeInTheDocument()
        expect(resourcesApi.updateResource).not.toHaveBeenCalled()
        await click(within(dialog).getByRole('button', { name: 'Rename anyway' }))
        expect(resourcesApi.updateResource).toHaveBeenCalledWith('r1', { name: '海报-北京-秋季', groupName: '海报' })
    })

    it('renames straight away when no flow refers to it by name', async () => {
        resourcesApi.updateResource.mockResolvedValue({})
        await renderPage()
        const dialog = await openEdit('合同')
        await act(async () => typeName(dialog, '合同-2026'))
        await click(within(dialog).getByRole('button', { name: 'Save' }))
        expect(resourcesApi.updateResource).toHaveBeenCalledWith('r4', { name: '合同-2026', groupName: '' })
    })

    it('does not look for flows when only the group changes', async () => {
        resourcesApi.updateResource.mockResolvedValue({})
        await renderPage()
        const dialog = await openEdit('合同')
        await act(async () => fireEvent.change(within(dialog).getByLabelText('resource-group'), { target: { value: '法务' } }))
        await click(within(dialog).getByRole('button', { name: 'Save' }))
        expect(resourcesApi.getResourceUsages).not.toHaveBeenCalled()
        expect(resourcesApi.updateResource).toHaveBeenCalledWith('r4', { name: '合同', groupName: '法务' })
    })

    it('shows the reason when the name is taken', async () => {
        resourcesApi.updateResource.mockRejectedValue({ response: { data: { message: '资源名称“合同”已被使用' } } })
        await renderPage()
        const dialog = await openEdit('合同')
        await act(async () => typeName(dialog, '合同'))
        await click(within(dialog).getByRole('button', { name: 'Save' }))
        expect(await within(dialog).findByText(/资源名称“合同”已被使用/)).toBeInTheDocument()
    })
})

describe('Resources page: upload and replace', () => {
    it('uploads a file under the name it suggests, with the chosen group', async () => {
        resourcesApi.createResource.mockResolvedValue({ data: {} })
        await renderPage()
        await click(screen.getByRole('button', { name: 'Upload resource' }))
        const dialog = await screen.findByRole('dialog')
        const upload = within(dialog).getByRole('button', { name: 'Upload' })
        expect(upload).toBeDisabled()
        const file = new File(['png'], '春节海报.png', { type: 'image/png' })
        await act(async () => fireEvent.change(within(dialog).getByTestId('resource-file-input'), { target: { files: [file] } }))
        expect(within(dialog).getByLabelText('resource-name')).toHaveValue('春节海报')
        await act(async () => fireEvent.change(within(dialog).getByLabelText('resource-group'), { target: { value: '海报' } }))
        await click(upload)
        expect(resourcesApi.createResource).toHaveBeenCalledWith(file, { name: '春节海报', groupName: '海报' })
    })

    it('replaces the file of a resource', async () => {
        resourcesApi.replaceResourceFile.mockResolvedValue({})
        await renderPage()
        await click(screen.getByLabelText('replace-合同'))
        const file = new File(['pdf'], 'new.pdf', { type: 'application/pdf' })
        await act(async () => fireEvent.change(screen.getByTestId('replace-file-input'), { target: { files: [file] } }))
        expect(resourcesApi.replaceResourceFile).toHaveBeenCalledWith('r4', file)
    })
})
