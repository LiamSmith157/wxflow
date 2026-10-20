import PropTypes from 'prop-types'
import { useTranslation } from 'react-i18next'
import { Alert, Link } from '@mui/material'

const AnnouncementBanner = ({ onClose }) => {
    const { t } = useTranslation('layout')
    return (
        <Alert
            severity='info'
            onClose={onClose}
            sx={{
                position: 'relative',
                borderRadius: 0,
                py: 0.5,
                '& .MuiAlert-icon': { display: 'none' },
                '& .MuiAlert-message': {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexWrap: 'wrap',
                    gap: 0.5,
                    width: '100%'
                },
                '& .MuiAlert-action': { position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', p: 0 }
            }}
        >
            {t('announcement.sunset')}{' '}
            <Link href='https://flowiseai.com/sunset' target='_blank' rel='noopener noreferrer'>
                {t('announcement.learnMore')}
            </Link>
        </Alert>
    )
}

AnnouncementBanner.propTypes = {
    onClose: PropTypes.func
}

export default AnnouncementBanner
