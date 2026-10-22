import { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { useTranslation } from 'react-i18next'
import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, List } from '@mui/material'
import { ListItem, ListItemText, Typography } from '@mui/material'

import resourcesApi from '@/api/resources'

const errorMessage = (error) => error?.response?.data?.message || error?.message || String(error)

/**
 * Lists the flows that use a resource. With `onConfirm` it is the confirmation before deleting: the flows are shown
 * and the user decides, nothing is blocked.
 */
const ResourceUsageDialog = ({ open, resource, onClose, onConfirm }) => {
    const { t } = useTranslation('resources')
    const [usages, setUsages] = useState(null)
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        if (!open || !resource) return
        let cancelled = false
        setUsages(null)
        setError('')
        resourcesApi
            .getResourceUsages(resource.id)
            .then((response) => !cancelled && setUsages(response.data))
            .catch((e) => !cancelled && setError(errorMessage(e)))
        return () => {
            cancelled = true
        }
    }, [open, resource])

    if (!resource) return null

    const confirm = async () => {
        setBusy(true)
        try {
            await onConfirm()
        } finally {
            setBusy(false)
        }
    }

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth='sm'>
            <DialogTitle>{onConfirm ? t('deleteTitle') : t('usageTitle', { name: resource.name })}</DialogTitle>
            <DialogContent>
                {onConfirm && <DialogContentText sx={{ mb: 2 }}>{t('deleteQuestion', { name: resource.name })}</DialogContentText>}
                {error && <Alert severity='error'>{error}</Alert>}
                {!error && usages === null && (
                    <Typography variant='body2' color='text.secondary' sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CircularProgress size={16} /> {t('checking')}
                    </Typography>
                )}
                {usages && usages.length === 0 && <Alert severity='info'>{t('notUsed')}</Alert>}
                {usages && usages.length > 0 && (
                    <>
                        {onConfirm && <Alert severity='warning'>{t('usedByTitle')}</Alert>}
                        <List dense data-testid='usage-list'>
                            {usages.map((usage) => (
                                <ListItem key={usage.id} disableGutters>
                                    <ListItemText primary={usage.name} secondary={t(`via_${usage.via}`)} />
                                </ListItem>
                            ))}
                        </List>
                    </>
                )}
                <Typography variant='caption' color='text.secondary' component='p' sx={{ mt: 1 }}>
                    {t('variableNote')}
                </Typography>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>{onConfirm ? t('common:cancel') : t('close')}</Button>
                {onConfirm && (
                    <Button variant='contained' color='error' onClick={confirm} disabled={busy || (usages === null && !error)}>
                        {t('deleteAction')}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    )
}

ResourceUsageDialog.propTypes = {
    open: PropTypes.bool,
    resource: PropTypes.object,
    onClose: PropTypes.func,
    onConfirm: PropTypes.func
}

export default ResourceUsageDialog
