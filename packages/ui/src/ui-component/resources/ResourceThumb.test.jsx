/**
 * @jest-environment <rootDir>/src/__test_utils__/jest-environment-jsdom.js
 */
import { render, screen, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import {
    IconFile,
    IconFileTypeDoc,
    IconFileTypePdf,
    IconFileTypePpt,
    IconFileTypeXls,
    IconFileZip,
    IconPhoto,
    IconVideo
} from '@tabler/icons-react'

import resourcesApi from '@/api/resources'
import ResourceThumb, { resourceIcon } from './ResourceThumb'

jest.mock('@/api/resources', () => ({ __esModule: true, default: { getResourceFile: jest.fn() } }))

describe('resourceIcon', () => {
    it.each([
        [{ kind: 'image', ext: '.png' }, IconPhoto],
        [{ kind: 'video', ext: '.mp4' }, IconVideo],
        [{ kind: 'file', ext: '.zip' }, IconFileZip],
        [{ kind: 'file', ext: '.RAR' }, IconFileZip],
        [{ kind: 'file', ext: '.7z' }, IconFileZip],
        [{ kind: 'file', ext: '.pdf' }, IconFileTypePdf],
        [{ kind: 'file', ext: '.docx' }, IconFileTypeDoc],
        [{ kind: 'file', ext: '.xlsx' }, IconFileTypeXls],
        [{ kind: 'file', ext: '.pptx' }, IconFileTypePpt],
        [{ kind: 'file', ext: '.exe' }, IconFile],
        [{ kind: 'file' }, IconFile]
    ])('gives %o its default icon', (resource, Icon) => {
        expect(resourceIcon(resource).Icon).toBe(Icon)
    })
})

describe('ResourceThumb', () => {
    beforeEach(() => {
        resourcesApi.getResourceFile.mockReset()
        resourcesApi.getResourceFile.mockResolvedValue({ data: new Blob(['png']) })
        URL.createObjectURL = jest.fn(() => 'blob:picture')
    })
    afterEach(() => {
        delete URL.createObjectURL
    })

    it('shows the picture of an image', async () => {
        render(<ResourceThumb resource={{ id: 'a', kind: 'image', ext: '.png', name: '海报' }} />)
        await waitFor(() => expect(screen.getByRole('img', { name: '海报' })).toHaveAttribute('src', 'blob:picture'))
        expect(resourcesApi.getResourceFile).toHaveBeenCalledWith('a')
    })

    it('downloads a picture once, however often it is shown, until the file is replaced', async () => {
        const resource = { id: 'b', kind: 'image', ext: '.png', name: '图', updatedDate: '2026-10-01T00:00:00.000Z' }
        const first = render(<ResourceThumb resource={resource} />)
        await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument())
        first.unmount()
        const second = render(<ResourceThumb resource={resource} size={32} />)
        await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument())
        second.unmount()
        expect(resourcesApi.getResourceFile).toHaveBeenCalledTimes(1)

        render(<ResourceThumb resource={{ ...resource, updatedDate: '2026-10-02T00:00:00.000Z' }} />)
        await waitFor(() => expect(resourcesApi.getResourceFile).toHaveBeenCalledTimes(2))
    })

    it('tries again after a failed download', async () => {
        resourcesApi.getResourceFile.mockRejectedValueOnce(new Error('offline'))
        const resource = { id: 'c', kind: 'image', ext: '.png', name: '图' }
        const first = render(<ResourceThumb resource={resource} />)
        await act(async () => {})
        expect(screen.getByTestId('format-icon')).toBeInTheDocument()
        first.unmount()
        render(<ResourceThumb resource={resource} />)
        await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument())
        expect(resourcesApi.getResourceFile).toHaveBeenCalledTimes(2)
    })

    it('shows a format icon, without downloading, for anything but an image', async () => {
        render(<ResourceThumb resource={{ id: 'd', kind: 'file', ext: '.zip', name: '素材包' }} />)
        await act(async () => {})
        expect(screen.getByTestId('format-icon')).toBeInTheDocument()
        expect(resourcesApi.getResourceFile).not.toHaveBeenCalled()
    })
})
