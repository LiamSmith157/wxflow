import { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import {
    IconFile,
    IconFileTypeCsv,
    IconFileTypeDoc,
    IconFileTypePdf,
    IconFileTypePpt,
    IconFileTypeTxt,
    IconFileTypeXls,
    IconFileZip,
    IconPhoto,
    IconVideo
} from '@tabler/icons-react'

import resourcesApi from '@/api/resources'

const FORMATS = [
    { exts: ['.zip', '.rar', '.7z', '.tar', '.gz', '.tgz', '.bz2', '.xz'], Icon: IconFileZip, color: '#f59e0b' },
    { exts: ['.pdf'], Icon: IconFileTypePdf, color: '#e53935' },
    { exts: ['.doc', '.docx'], Icon: IconFileTypeDoc, color: '#1e88e5' },
    { exts: ['.xls', '.xlsx'], Icon: IconFileTypeXls, color: '#43a047' },
    { exts: ['.csv'], Icon: IconFileTypeCsv, color: '#43a047' },
    { exts: ['.ppt', '.pptx'], Icon: IconFileTypePpt, color: '#fb8c00' },
    { exts: ['.txt', '.md'], Icon: IconFileTypeTxt }
]

/** The default icon of a resource without a picture: by kind for images and videos, by format for files */
export const resourceIcon = (resource) => {
    if (resource.kind === 'image') return { Icon: IconPhoto }
    if (resource.kind === 'video') return { Icon: IconVideo, color: '#8e24aa' }
    const ext = (resource.ext || '').toLowerCase()
    return FORMATS.find((format) => format.exts.includes(ext)) || { Icon: IconFile }
}

// Object URLs of the pictures, kept for the page's lifetime so that reopening a dropdown or the resource page does not download
// the files again. The key carries updatedDate: a replaced file gets a new key and is fetched anew.
const pictures = new Map()

const loadPicture = (resource) => {
    const key = `${resource.id}:${resource.updatedDate || ''}`
    if (!pictures.has(key)) {
        const url = resourcesApi.getResourceFile(resource.id).then((response) => URL.createObjectURL(response.data))
        // a failed load is not kept, so the next showing tries again
        url.catch(() => pictures.delete(key))
        pictures.set(key, url)
    }
    return pictures.get(key)
}

/** A small preview: the picture itself for images (fetched with the sign-in, shown from a local object URL), a format icon otherwise */
const ResourceThumb = ({ resource, size = 48 }) => {
    const [src, setSrc] = useState('')

    useEffect(() => {
        if (resource.kind !== 'image' || typeof URL.createObjectURL !== 'function') return
        let cancelled = false
        loadPicture(resource)
            .then((url) => {
                if (!cancelled) setSrc(url)
            })
            .catch(() => {})
        return () => {
            cancelled = true
        }
        // a replaced file changes updatedDate, which reloads the picture
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resource.id, resource.kind, resource.updatedDate])

    if (src) {
        return (
            <Box
                component='img'
                src={src}
                alt={resource.name || ''}
                sx={{ width: size, height: size, flexShrink: 0, objectFit: 'cover', borderRadius: 1, display: 'block' }}
            />
        )
    }
    const { Icon, color } = resourceIcon(resource)
    return (
        <Box
            data-testid='format-icon'
            sx={{
                width: size,
                height: size,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: color || 'text.secondary'
            }}
        >
            <Icon size={Math.round(size * 0.6)} />
        </Box>
    )
}

ResourceThumb.propTypes = {
    resource: PropTypes.object.isRequired,
    size: PropTypes.number
}

export default ResourceThumb
