import { useState } from 'react'
import PropTypes from 'prop-types'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, TextField } from '@mui/material'

import channelInstancesApi from '@/api/channelInstances'

/** Sends the built-in picture through one instance to a conversation, to check that sending media works */
const TestImageDialog = ({ open, instance, onClose }) => {
    const { t } = useTranslation('channels')
    const [to, setTo] = useState('filehelper')
    const [sending, setSending] = useState(false)
    const [result, setResult] = useState(null)

    const send = async () => {
        setSending(true)
        setResult(null)
        try {
            const response = await channelInstancesApi.sendTestImage(instance.id, to.trim())
            setResult(response.data)
        } catch (error) {
            setResult({ state: 'fail', error: error?.response?.data?.message || error?.message || String(error) })
        } finally {
            setSending(false)
        }
    }

    const close = () => {
        setResult(null)
        onClose()
    }

    return (
        <Dialog open={open} onClose={close} fullWidth maxWidth='sm'>
            <DialogTitle>{t('sendTestImageTitle')}</DialogTitle>
            <DialogContent>
                <DialogContentText sx={{ mb: 2 }}>{t('sendTestImageDescription')}</DialogContentText>
                <TextField
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    fullWidth
                    label={t('recipient')}
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    inputProps={{ 'aria-label': 'recipient' }}
                />
                {result?.state === 'ok' && (
                    <Alert severity='success' sx={{ mt: 2 }}>
                        {t('testImageOk')}
                    </Alert>
                )}
                {result?.state === 'pending' && (
                    <Alert severity='warning' sx={{ mt: 2 }}>
                        {t('testImagePending')}
                    </Alert>
                )}
                {result?.state === 'fail' && (
                    <Alert severity='error' sx={{ mt: 2 }}>
                        {t('testImageFailed', { error: result.error })}
                    </Alert>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={close}>{t('common:cancel')}</Button>
                <Button variant='contained' onClick={send} disabled={sending || !to.trim()}>
                    {t('send')}
                </Button>
            </DialogActions>
        </Dialog>
    )
}

TestImageDialog.propTypes = {
    open: PropTypes.bool,
    instance: PropTypes.object,
    onClose: PropTypes.func
}

export default TestImageDialog
