import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { useTranslation } from 'react-i18next'
import {
    Alert,
    Autocomplete,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    List,
    ListItem,
    ListItemText,
    TextField,
    Typography
} from '@mui/material'

import resourcesApi from '@/api/resources'

const errorMessage = (error) => error?.response?.data?.message || error?.message || String(error)

const baseName = (fileName) => fileName.replace(/\.[^.]*$/, '')

/**
 * Upload a resource, or rename / regroup one. Renaming breaks the flows that point at the resource by name, so when
 * there are any they are listed first and the user has to confirm.
 */
const ResourceFormDialog = ({ open, mode, resource, groups, onClose, onDone }) => {
    const { t } = useTranslation('resources')
    const fileInput = useRef(null)
    const [file, setFile] = useState(null)
    const [name, setName] = useState('')
    const [groupName, setGroupName] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [renameWarning, setRenameWarning] = useState(null)

    useEffect(() => {
        if (!open) return
        setFile(null)
        setName(mode === 'edit' ? resource?.name ?? '' : '')
        setGroupName(mode === 'edit' ? resource?.groupName ?? '' : '')
        setError('')
        setRenameWarning(null)
    }, [open, mode, resource])

    const chooseFile = (e) => {
        const chosen = e.target.files?.[0]
        if (!chosen) return
        setFile(chosen)
        // the name follows the file until the user types one
        setName((current) => current || baseName(chosen.name))
    }

    const submit = async (confirmedRename = false) => {
        setError('')
        setSaving(true)
        try {
            if (mode === 'upload') {
                await resourcesApi.createResource(file, { name: name.trim(), groupName: groupName.trim() })
            } else {
                if (!confirmedRename && name.trim().toLowerCase() !== resource.name.toLowerCase()) {
                    const response = await resourcesApi.getResourceUsages(resource.id, true)
                    if (response.data.length > 0) {
                        setRenameWarning(response.data)
                        return
                    }
                }
                await resourcesApi.updateResource(resource.id, { name: name.trim(), groupName: groupName.trim() })
            }
            await onDone(mode)
        } catch (e) {
            setError(t('saveFailed', { message: errorMessage(e) }))
        } finally {
            setSaving(false)
        }
    }

    const canSubmit = !saving && name.trim() && (mode === 'edit' || file)

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth='sm'>
            <DialogTitle>{mode === 'upload' ? t('uploadTitle') : t('editTitle')}</DialogTitle>
            <DialogContent>
                {mode === 'upload' && (
                    <>
                        <input ref={fileInput} type='file' hidden onChange={chooseFile} data-testid='resource-file-input' />
                        <Button variant='outlined' onClick={() => fileInput.current?.click()} sx={{ mt: 1 }}>
                            {file ? file.name : t('chooseFile')}
                        </Button>
                        <Typography variant='caption' color='text.secondary' component='p' sx={{ mt: 0.5, mb: 1 }}>
                            {t('fileHelp')}
                        </Typography>
                    </>
                )}
                <TextField
                    fullWidth
                    margin='normal'
                    label={t('nameLabel')}
                    helperText={t('nameHelp')}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    inputProps={{ 'aria-label': 'resource-name', maxLength: 100 }}
                />
                <Autocomplete
                    freeSolo
                    autoSelect
                    options={groups}
                    inputValue={groupName}
                    onInputChange={(_e, value) => setGroupName(value)}
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            margin='normal'
                            label={t('groupLabel')}
                            helperText={t('groupHelp')}
                            inputProps={{ ...params.inputProps, 'aria-label': 'resource-group' }}
                        />
                    )}
                />
                {error && (
                    <Alert severity='error' sx={{ mt: 1 }}>
                        {error}
                    </Alert>
                )}
                {renameWarning && (
                    <Alert severity='warning' sx={{ mt: 1 }} data-testid='rename-warning'>
                        {t('renameWarningTitle')}
                        <List dense>
                            {renameWarning.map((usage) => (
                                <ListItem key={usage.id} disableGutters>
                                    <ListItemText primary={usage.name} />
                                </ListItem>
                            ))}
                        </List>
                    </Alert>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>{t('common:cancel')}</Button>
                {renameWarning ? (
                    <Button variant='contained' color='warning' onClick={() => submit(true)} disabled={saving}>
                        {t('renameAnyway')}
                    </Button>
                ) : (
                    <Button variant='contained' onClick={() => submit(false)} disabled={!canSubmit}>
                        {mode === 'upload' ? t('uploadAction') : t('save')}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    )
}

ResourceFormDialog.propTypes = {
    open: PropTypes.bool,
    mode: PropTypes.oneOf(['upload', 'edit']),
    resource: PropTypes.object,
    groups: PropTypes.arrayOf(PropTypes.string),
    onClose: PropTypes.func,
    onDone: PropTypes.func
}

export default ResourceFormDialog
