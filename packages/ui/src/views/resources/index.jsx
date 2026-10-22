import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { useTranslation } from 'react-i18next'
import { useDispatch } from 'react-redux'
import moment from 'moment'

// material-ui
import {
    Alert,
    Box,
    Button,
    Chip,
    IconButton,
    List,
    ListItemButton,
    ListItemText,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tooltip,
    Typography,
    useTheme
} from '@mui/material'
import { IconDownload, IconEdit, IconRefresh, IconTrash } from '@tabler/icons-react'

// project imports
import MainCard from '@/ui-component/cards/MainCard'
import ViewHeader from '@/layout/MainLayout/ViewHeader'
import { useAuth } from '@/hooks/useAuth'
import { enqueueSnackbar as enqueueSnackbarAction } from '@/store/actions'
import resourcesApi from '@/api/resources'
import ResourceFormDialog from './ResourceFormDialog'
import ResourceThumb from './ResourceThumb'
import ResourceUsageDialog from './ResourceUsageDialog'

const errorMessage = (error) => error?.response?.data?.message || error?.message || String(error)

// special values of the group filter; a real group can have any other name
const ALL = '\u0000all'
const NONE = '\u0000none'

const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const GroupItem = ({ label, count, selected, onClick }) => (
    <ListItemButton selected={selected} onClick={onClick} aria-label={`group-${label}`}>
        <ListItemText primary={label} />
        <Box component='span' sx={{ color: 'text.secondary', fontSize: 13 }}>
            {count}
        </Box>
    </ListItemButton>
)

GroupItem.propTypes = {
    label: PropTypes.string,
    count: PropTypes.number,
    selected: PropTypes.bool,
    onClick: PropTypes.func
}

// ==============================|| RESOURCES ||============================== //

const Resources = () => {
    const { t } = useTranslation('resources')
    const theme = useTheme()
    const dispatch = useDispatch()
    const { hasPermission } = useAuth()
    const notify = useCallback((message, variant) => dispatch(enqueueSnackbarAction({ message, options: { variant } })), [dispatch])

    const [resources, setResources] = useState([])
    const [loaded, setLoaded] = useState(false)
    const [loadError, setLoadError] = useState('')
    const [group, setGroup] = useState(ALL)
    const [search, setSearch] = useState('')
    const [form, setForm] = useState(null) // { mode, resource }
    const [usageFor, setUsageFor] = useState(null)
    const [deleting, setDeleting] = useState(null)
    const replaceInput = useRef(null)
    const replaceTarget = useRef(null)

    const load = useCallback(async () => {
        try {
            const response = await resourcesApi.getResources()
            setResources(response.data)
            setLoadError('')
        } catch (error) {
            setLoadError(t('loadFailed', { message: errorMessage(error) }))
        } finally {
            setLoaded(true)
        }
    }, [t])

    useEffect(() => {
        load()
    }, [load])

    const groups = useMemo(() => {
        const counts = new Map()
        let ungrouped = 0
        resources.forEach((r) => (r.groupName ? counts.set(r.groupName, (counts.get(r.groupName) ?? 0) + 1) : (ungrouped += 1)))
        return { named: [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)), ungrouped }
    }, [resources])

    const visible = useMemo(() => {
        const needle = search.trim().toLowerCase()
        return resources.filter(
            (r) =>
                (group === ALL || (group === NONE ? !r.groupName : r.groupName === group)) &&
                (!needle || r.name.toLowerCase().includes(needle))
        )
    }, [resources, group, search])

    // a group that lost its last resource no longer exists
    useEffect(() => {
        if (group !== ALL && group !== NONE && !groups.named.some(([name]) => name === group)) setGroup(ALL)
    }, [groups, group])

    const canCreate = hasPermission('resources:create')
    const canUpdate = hasPermission('resources:update')
    const canDelete = hasPermission('resources:delete')

    const onFormDone = async (mode) => {
        setForm(null)
        notify(t(mode === 'upload' ? 'uploaded' : 'saved'), 'success')
        await load()
    }

    const startReplace = (resource) => {
        replaceTarget.current = resource
        replaceInput.current?.click()
    }

    const onReplacePicked = async (e) => {
        const file = e.target.files?.[0]
        const resource = replaceTarget.current
        e.target.value = ''
        if (!file || !resource) return
        try {
            await resourcesApi.replaceResourceFile(resource.id, file)
            notify(t('replaced'), 'success')
            await load()
        } catch (error) {
            notify(t('replaceFailed', { message: errorMessage(error) }), 'error')
        }
    }

    const download = async (resource) => {
        try {
            const response = await resourcesApi.getResourceFile(resource.id, true)
            const url = URL.createObjectURL(response.data)
            const link = document.createElement('a')
            link.href = url
            link.download = resource.originalName || resource.name
            document.body.appendChild(link)
            link.click()
            link.remove()
            URL.revokeObjectURL(url)
        } catch (error) {
            notify(t('downloadFailed', { message: errorMessage(error) }), 'error')
        }
    }

    const confirmDelete = async () => {
        try {
            await resourcesApi.deleteResource(deleting.id)
            notify(t('deleted'), 'success')
            setDeleting(null)
            await load()
        } catch (error) {
            notify(t('deleteFailed', { message: errorMessage(error) }), 'error')
        }
    }

    return (
        <MainCard>
            <Stack flexDirection='column' sx={{ gap: 3 }}>
                <ViewHeader
                    title={t('title')}
                    description={t('description')}
                    search={true}
                    onSearchChange={(e) => setSearch(e.target.value)}
                    searchPlaceholder={t('searchPlaceholder')}
                >
                    {canCreate && (
                        <Button variant='contained' onClick={() => setForm({ mode: 'upload' })} sx={{ borderRadius: 2, height: 40 }}>
                            {t('upload')}
                        </Button>
                    )}
                </ViewHeader>

                {loadError && <Alert severity='error'>{loadError}</Alert>}

                {loaded && resources.length === 0 && !loadError ? (
                    <Alert severity='info'>{t('empty')}</Alert>
                ) : (
                    <Stack direction='row' sx={{ gap: 2, alignItems: 'flex-start' }}>
                        <Paper variant='outlined' sx={{ width: 220, flexShrink: 0, borderRadius: 2 }}>
                            <Typography variant='subtitle2' sx={{ px: 2, pt: 1.5 }} color='text.secondary'>
                                {t('groups')}
                            </Typography>
                            <List dense aria-label='groups'>
                                <GroupItem
                                    label={t('allResources')}
                                    count={resources.length}
                                    selected={group === ALL}
                                    onClick={() => setGroup(ALL)}
                                />
                                {groups.named.map(([name, count]) => (
                                    <GroupItem
                                        key={name}
                                        label={name}
                                        count={count}
                                        selected={group === name}
                                        onClick={() => setGroup(name)}
                                    />
                                ))}
                                {groups.ungrouped > 0 && (
                                    <GroupItem
                                        label={t('ungrouped')}
                                        count={groups.ungrouped}
                                        selected={group === NONE}
                                        onClick={() => setGroup(NONE)}
                                    />
                                )}
                            </List>
                        </Paper>

                        <TableContainer
                            component={Paper}
                            sx={{ flexGrow: 1, border: 1, borderColor: theme.palette.grey[900] + 25, borderRadius: 2 }}
                        >
                            <Table aria-label='resources'>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>{t('preview')}</TableCell>
                                        <TableCell>{t('name')}</TableCell>
                                        <TableCell>{t('group')}</TableCell>
                                        <TableCell>{t('type')}</TableCell>
                                        <TableCell>{t('size')}</TableCell>
                                        <TableCell>{t('inUse')}</TableCell>
                                        <TableCell>{t('updated')}</TableCell>
                                        <TableCell>{t('actions')}</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {visible.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={8}>
                                                <Typography color='text.secondary'>{t('emptyFiltered')}</Typography>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    {visible.map((resource) => (
                                        <TableRow key={resource.id} data-testid={`resource-${resource.name}`}>
                                            <TableCell>
                                                <ResourceThumb resource={resource} />
                                            </TableCell>
                                            <TableCell>{resource.name}</TableCell>
                                            <TableCell>{resource.groupName || '-'}</TableCell>
                                            <TableCell>
                                                <Chip size='small' label={t(`kind_${resource.kind}`)} />
                                            </TableCell>
                                            <TableCell>{formatSize(resource.size)}</TableCell>
                                            <TableCell>
                                                {resource.usageCount > 0 ? (
                                                    <Button
                                                        size='small'
                                                        aria-label={`usage-${resource.name}`}
                                                        onClick={() => setUsageFor(resource)}
                                                    >
                                                        {resource.usageCount}
                                                    </Button>
                                                ) : (
                                                    <Typography variant='body2'>0</Typography>
                                                )}
                                            </TableCell>
                                            <TableCell>{moment(resource.updatedDate).format('YYYY-MM-DD HH:mm')}</TableCell>
                                            <TableCell>
                                                <Stack direction='row'>
                                                    {canUpdate && (
                                                        <Tooltip title={t('replaceFile')}>
                                                            <IconButton
                                                                size='small'
                                                                aria-label={`replace-${resource.name}`}
                                                                onClick={() => startReplace(resource)}
                                                            >
                                                                <IconRefresh size={18} />
                                                            </IconButton>
                                                        </Tooltip>
                                                    )}
                                                    {canUpdate && (
                                                        <Tooltip title={t('edit')}>
                                                            <IconButton
                                                                size='small'
                                                                aria-label={`edit-${resource.name}`}
                                                                onClick={() => setForm({ mode: 'edit', resource })}
                                                            >
                                                                <IconEdit size={18} />
                                                            </IconButton>
                                                        </Tooltip>
                                                    )}
                                                    <Tooltip title={t('download')}>
                                                        <IconButton
                                                            size='small'
                                                            aria-label={`download-${resource.name}`}
                                                            onClick={() => download(resource)}
                                                        >
                                                            <IconDownload size={18} />
                                                        </IconButton>
                                                    </Tooltip>
                                                    {canDelete && (
                                                        <Tooltip title={t('delete')}>
                                                            <IconButton
                                                                size='small'
                                                                color='error'
                                                                aria-label={`delete-${resource.name}`}
                                                                onClick={() => setDeleting(resource)}
                                                            >
                                                                <IconTrash size={18} />
                                                            </IconButton>
                                                        </Tooltip>
                                                    )}
                                                </Stack>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Stack>
                )}
            </Stack>

            <input ref={replaceInput} type='file' hidden onChange={onReplacePicked} data-testid='replace-file-input' />
            <ResourceFormDialog
                open={!!form}
                mode={form?.mode}
                resource={form?.resource}
                groups={groups.named.map(([name]) => name)}
                onClose={() => setForm(null)}
                onDone={onFormDone}
            />
            <ResourceUsageDialog open={!!usageFor} resource={usageFor} onClose={() => setUsageFor(null)} />
            <ResourceUsageDialog open={!!deleting} resource={deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete} />
        </MainCard>
    )
}

export default Resources
