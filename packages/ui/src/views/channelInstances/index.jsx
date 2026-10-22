import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDispatch, useSelector } from 'react-redux'
import moment from 'moment'

// material-ui
import {
    Alert,
    Box,
    Button,
    Chip,
    FormControlLabel,
    Paper,
    Stack,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
    useTheme
} from '@mui/material'

// project imports
import MainCard from '@/ui-component/cards/MainCard'
import ViewHeader from '@/layout/MainLayout/ViewHeader'
import { Available } from '@/ui-component/rbac/available'
import { enqueueSnackbar as enqueueSnackbarAction } from '@/store/actions'
import channelInstancesApi from '@/api/channelInstances'
import TestImageDialog from './TestImageDialog'

const errorMessage = (error) => error?.response?.data?.message || error?.message || String(error)

const STATE_COLOR = { running: 'success', failed: 'error', queue_mode: 'warning', disabled: 'default', not_started: 'default' }

// ==============================|| CHANNEL INSTANCES ||============================== //

const ChannelInstances = () => {
    const { t } = useTranslation('channels')
    const theme = useTheme()
    const dispatch = useDispatch()
    const notify = (message, variant) => dispatch(enqueueSnackbarAction({ message, options: { variant } }))

    const [status, setStatus] = useState(null)
    const [settings, setSettings] = useState(null)
    const [rateLimit, setRateLimit] = useState('')
    const [instances, setInstances] = useState([])
    const [loaded, setLoaded] = useState(false)
    const [loadError, setLoadError] = useState('')
    const [testInstance, setTestInstance] = useState(null)

    const load = useCallback(async () => {
        try {
            const [statusResponse, settingsResponse, instancesResponse] = await Promise.all([
                channelInstancesApi.getGatewayStatus(),
                channelInstancesApi.getSettings(),
                channelInstancesApi.getInstances()
            ])
            setStatus(statusResponse.data)
            setSettings(settingsResponse.data)
            setRateLimit(String(settingsResponse.data.sendRateLimitPerMinute))
            setInstances(instancesResponse.data)
            setLoadError('')
        } catch (error) {
            setLoadError(t('loadFailed', { message: errorMessage(error) }))
        } finally {
            setLoaded(true)
        }
    }, [t])

    useEffect(() => {
        load()
        // refresh the online state of the instances while the page is open
        const timer = setInterval(
            () =>
                channelInstancesApi
                    .getInstances()
                    .then((r) => setInstances(r.data))
                    .catch(() => {}),
            10000
        )
        return () => clearInterval(timer)
    }, [load])

    const saveSettings = async (patch) => {
        try {
            const response = await channelInstancesApi.updateSettings(patch)
            setSettings(response.data)
            setRateLimit(String(response.data.sendRateLimitPerMinute))
            notify(t('settingsSaved'), 'success')
        } catch (error) {
            notify(t('settingsSaveFailed', { message: errorMessage(error) }), 'error')
        }
    }

    const assign = async (instance, workspaceId) => {
        try {
            await channelInstancesApi.assignInstance(instance.id, workspaceId)
            notify(workspaceId ? t('assigned') : t('unassigned_done'), 'success')
            await load()
        } catch (error) {
            notify(t('assignFailed', { message: errorMessage(error) }), 'error')
        }
    }

    // an unassigned instance is assigned to the workspace the manager is working in
    const currentWorkspaceId = useSelector((state) => state.auth?.user?.activeWorkspaceId)

    const gatewayRunning = status?.state === 'running'

    return (
        <MainCard>
            <Stack flexDirection='column' sx={{ gap: 3 }}>
                <ViewHeader title={t('channelInstances')} description={t('channelInstancesDescription')} />

                {loadError && <Alert severity='error'>{loadError}</Alert>}

                {status && (
                    <Paper variant='outlined' sx={{ p: 2, borderRadius: 2 }}>
                        <Typography variant='h5' sx={{ mb: 1 }}>
                            {t('gateway')}
                        </Typography>
                        <Stack direction='row' alignItems='center' sx={{ gap: 2, flexWrap: 'wrap' }}>
                            <Chip color={STATE_COLOR[status.state] || 'default'} label={t(`gatewayState_${status.state}`)} />
                            {status.state === 'running' && (
                                <Typography variant='body2'>{t('listensOn', { host: status.host, port: status.port })}</Typography>
                            )}
                            {status.reason && status.state !== 'running' && (
                                <Typography variant='body2' color='text.secondary'>
                                    {status.reason}
                                </Typography>
                            )}
                        </Stack>
                        {status.exchange && (
                            <Box sx={{ mt: 2 }}>
                                <Stack direction='row' alignItems='center' sx={{ gap: 1 }}>
                                    <Typography variant='subtitle2'>{t('exchangeDirectory')}</Typography>
                                    <Chip
                                        size='small'
                                        color={status.exchange.ok ? 'success' : 'error'}
                                        label={status.exchange.ok ? t('exchangeOk') : t('exchangeProblem')}
                                    />
                                </Stack>
                                <Typography variant='body2' color='text.secondary'>
                                    {t('exchangeInContainer', { dir: status.exchange.dir })}
                                </Typography>
                                {status.exchange.mapped && (
                                    <Typography variant='body2' color='text.secondary'>
                                        {t('exchangeOnWindows', { dir: status.exchange.hostDir })}
                                    </Typography>
                                )}
                                {status.exchange.error && (
                                    <Alert severity='error' sx={{ mt: 1 }}>
                                        {status.exchange.error}
                                    </Alert>
                                )}
                            </Box>
                        )}
                    </Paper>
                )}

                {settings && (
                    <Paper variant='outlined' sx={{ p: 2, borderRadius: 2 }}>
                        <Typography variant='h5' sx={{ mb: 1 }}>
                            {t('safetySettings')}
                        </Typography>
                        <Typography variant='body2' color='text.secondary' data-testid='settings-summary' sx={{ mb: 1 }}>
                            {`${t('masterSwitch')}: ${settings.masterEnabled ? t('online') : t('offline')} · ${t('sendRateLimit')}: ${
                                settings.sendRateLimitPerMinute
                            }`}
                        </Typography>
                        <Available permission='channelInstances:manage'>
                            <Stack sx={{ gap: 2 }}>
                                <Box>
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={settings.masterEnabled}
                                                onChange={(e) => saveSettings({ masterEnabled: e.target.checked })}
                                                inputProps={{ 'aria-label': 'master-switch' }}
                                            />
                                        }
                                        label={t('masterSwitch')}
                                    />
                                    <Typography variant='body2' color='text.secondary'>
                                        {t('masterSwitchHelp')}
                                    </Typography>
                                </Box>
                                <Stack direction='row' alignItems='flex-start' sx={{ gap: 2 }}>
                                    <TextField
                                        size='small'
                                        type='number'
                                        label={t('sendRateLimit')}
                                        helperText={t('sendRateLimitHelp')}
                                        value={rateLimit}
                                        onChange={(e) => setRateLimit(e.target.value)}
                                        inputProps={{ min: 1, max: 1000, 'aria-label': 'rate-limit' }}
                                        sx={{ width: 280 }}
                                    />
                                    <Button
                                        variant='outlined'
                                        sx={{ height: 40 }}
                                        onClick={() => saveSettings({ sendRateLimitPerMinute: Number(rateLimit) })}
                                    >
                                        {t('saveSettings')}
                                    </Button>
                                </Stack>
                            </Stack>
                        </Available>
                    </Paper>
                )}

                {loaded && instances.length === 0 ? (
                    <Alert severity='info' sx={{ alignItems: 'center' }}>
                        <Typography variant='subtitle1'>{t('noInstancesTitle')}</Typography>
                        {gatewayRunning ? (
                            <Typography variant='body2'>{t('noInstancesHint', { port: status.port })}</Typography>
                        ) : (
                            <Typography variant='body2'>{t('noInstancesGatewayDown')}</Typography>
                        )}
                    </Alert>
                ) : (
                    <TableContainer component={Paper} sx={{ border: 1, borderColor: theme.palette.grey[900] + 25, borderRadius: 2 }}>
                        <Table aria-label='channel instances'>
                            <TableHead>
                                <TableRow>
                                    <TableCell>{t('displayName')}</TableCell>
                                    <TableCell>{t('instanceKey')}</TableCell>
                                    <TableCell>{t('status')}</TableCell>
                                    <TableCell>{t('lastSeen')}</TableCell>
                                    <TableCell>{t('workspace')}</TableCell>
                                    <TableCell>{t('actions')}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {instances.map((instance) => (
                                    <TableRow key={instance.id} data-testid={`instance-${instance.instanceKey}`}>
                                        <TableCell>{instance.displayName || instance.instanceKey}</TableCell>
                                        <TableCell>{instance.instanceKey}</TableCell>
                                        <TableCell>
                                            <Chip
                                                size='small'
                                                color={instance.online ? 'success' : 'default'}
                                                label={instance.online ? t('online') : t('offline')}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            {instance.lastSeenAt ? moment(instance.lastSeenAt).format('YYYY-MM-DD HH:mm:ss') : '-'}
                                        </TableCell>
                                        <TableCell>
                                            {instance.workspaceId ? instance.workspaceName || instance.workspaceId : t('unassigned')}
                                        </TableCell>
                                        <TableCell>
                                            <Available permission='channelInstances:manage'>
                                                <Stack direction='row' sx={{ gap: 1 }}>
                                                    {instance.workspaceId ? (
                                                        <Button size='small' variant='outlined' onClick={() => assign(instance, null)}>
                                                            {t('unassign')}
                                                        </Button>
                                                    ) : (
                                                        <Button
                                                            size='small'
                                                            variant='contained'
                                                            disabled={!currentWorkspaceId}
                                                            onClick={() => assign(instance, currentWorkspaceId)}
                                                        >
                                                            {t('assignToThisWorkspace')}
                                                        </Button>
                                                    )}
                                                    {instance.online && (
                                                        <Button size='small' variant='outlined' onClick={() => setTestInstance(instance)}>
                                                            {t('sendTestImage')}
                                                        </Button>
                                                    )}
                                                </Stack>
                                            </Available>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Stack>
            {testInstance && <TestImageDialog open instance={testInstance} onClose={() => setTestInstance(null)} />}
        </MainCard>
    )
}

export default ChannelInstances
