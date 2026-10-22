import { useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { useDispatch } from 'react-redux'
import { useTranslation } from 'react-i18next'
import { Box, Switch, Tooltip } from '@mui/material'
import { styled } from '@mui/material/styles'

import chatflowsApi from '@/api/chatflows'
import useApi from '@/hooks/useApi'
import { enqueueSnackbar as enqueueSnackbarAction } from '@/store/actions'

// WeChat green
const WECHAT_GREEN = '#07C160'

const GreenSwitch = styled(Switch)(() => ({
    '& .MuiSwitch-switchBase.Mui-checked': { color: WECHAT_GREEN },
    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: WECHAT_GREEN }
}))

/** True when the Start node of the flow listens to channel (WeChat) events */
export const isChannelFlow = (flowData) => {
    if (!flowData) return false
    try {
        const startNode = (JSON.parse(flowData).nodes || []).find((n) => n.data?.name === 'startAgentflow')
        return startNode?.data?.inputs?.startInputType === 'wechatEvent'
    } catch {
        return false
    }
}

/**
 * Switch in the canvas header of a flow that starts from a WeChat event. A new flow is off; only an enabled flow is
 * started by events (saving the flow again keeps the state).
 */
const ChannelEnableSwitch = ({ chatflow }) => {
    const { t } = useTranslation('agentflows')
    const dispatch = useDispatch()
    const enqueueSnackbar = (...args) => dispatch(enqueueSnackbarAction(...args))

    const statusApi = useApi(chatflowsApi.getChannelStatus)
    const toggleApi = useApi(chatflowsApi.toggleChannelEnabled)
    const [enabled, setEnabled] = useState(false)
    const [loaded, setLoaded] = useState(false)

    const channelFlow = useMemo(() => isChannelFlow(chatflow?.flowData), [chatflow?.flowData])

    useEffect(() => {
        if (chatflow?.id && channelFlow) {
            setLoaded(false)
            statusApi.request(chatflow.id)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chatflow?.id, chatflow?.updatedDate, channelFlow])

    useEffect(() => {
        if (statusApi.data) {
            setEnabled(statusApi.data.enabled ?? false)
            setLoaded(true)
        }
    }, [statusApi.data])

    useEffect(() => {
        if (toggleApi.data) {
            setEnabled(toggleApi.data.enabled ?? false)
            enqueueSnackbar({
                message: toggleApi.data.enabled ? t('wechatFlowEnabledSuccessfully') : t('wechatFlowDisabledSuccessfully'),
                options: { variant: 'success' }
            })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [toggleApi.data])

    useEffect(() => {
        if (toggleApi.error) {
            enqueueSnackbar({
                message: String(toggleApi.error?.response?.data?.message || toggleApi.error?.message || t('wechatFlowToggleFailed')),
                options: { variant: 'error' }
            })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [toggleApi.error])

    if (!chatflow?.id || !channelFlow || !loaded) return null

    return (
        <Tooltip title={enabled ? t('wechatFlowEnabledTooltip') : t('wechatFlowDisabledTooltip')}>
            <Box sx={{ display: 'inline-flex', alignItems: 'center', mr: 2 }}>
                <GreenSwitch
                    checked={enabled}
                    onChange={(e) => toggleApi.request(chatflow.id, e.target.checked)}
                    inputProps={{ 'aria-label': 'wechat-flow-enabled' }}
                />
            </Box>
        </Tooltip>
    )
}

ChannelEnableSwitch.propTypes = {
    chatflow: PropTypes.object
}

export default ChannelEnableSwitch
