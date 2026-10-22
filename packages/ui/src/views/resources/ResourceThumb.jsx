import { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import { IconFileText, IconPhoto, IconVideo } from '@tabler/icons-react'

import resourcesApi from '@/api/resources'

const SIZE = 48

const ICONS = { image: IconPhoto, video: IconVideo, file: IconFileText }

/** A small preview: the picture itself for images (fetched with the sign-in, shown from a local object URL), an icon otherwise */
const ResourceThumb = ({ resource }) => {
    const [src, setSrc] = useState('')

    useEffect(() => {
        if (resource.kind !== 'image' || typeof URL.createObjectURL !== 'function') return
        let cancelled = false
        let url = ''
        resourcesApi
            .getResourceFile(resource.id)
            .then((response) => {
                if (cancelled) return
                url = URL.createObjectURL(response.data)
                setSrc(url)
            })
            .catch(() => {})
        return () => {
            cancelled = true
            if (url) URL.revokeObjectURL(url)
        }
        // a replaced file changes updatedDate, which reloads the picture
    }, [resource.id, resource.kind, resource.updatedDate])

    if (src) {
        return (
            <Box
                component='img'
                src={src}
                alt={resource.name}
                sx={{ width: SIZE, height: SIZE, objectFit: 'cover', borderRadius: 1, display: 'block' }}
            />
        )
    }
    const Icon = ICONS[resource.kind] || IconFileText
    return (
        <Box sx={{ width: SIZE, height: SIZE, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.secondary' }}>
            <Icon size={28} />
        </Box>
    )
}

ResourceThumb.propTypes = {
    resource: PropTypes.object.isRequired
}

export default ResourceThumb
