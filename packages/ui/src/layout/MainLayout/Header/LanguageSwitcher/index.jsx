import { useState } from 'react'
import { useTranslation } from 'react-i18next'

// material-ui
import { Avatar, ButtonBase, ListItemIcon, ListItemText, Menu, MenuItem } from '@mui/material'
import { useTheme } from '@mui/material/styles'

// assets
import { IconCheck, IconLanguage } from '@tabler/icons-react'

// project imports
import { SUPPORTED_LANGUAGES } from '@/i18n'

// ==============================|| LANGUAGE SWITCHER ||============================== //

const LanguageSwitcher = () => {
    const theme = useTheme()
    const { t, i18n } = useTranslation()
    const [anchorEl, setAnchorEl] = useState(null)

    const handleSelect = (code) => {
        i18n.changeLanguage(code)
        setAnchorEl(null)
    }

    return (
        <>
            <ButtonBase sx={{ borderRadius: '12px', overflow: 'hidden', ml: 2 }}>
                <Avatar
                    variant='rounded'
                    sx={{
                        ...theme.typography.commonAvatar,
                        ...theme.typography.mediumAvatar,
                        transition: 'all .2s ease-in-out',
                        background: theme.palette.secondary.light,
                        color: theme.palette.secondary.dark,
                        '&:hover': {
                            background: theme.palette.secondary.dark,
                            color: theme.palette.secondary.light
                        }
                    }}
                    onClick={(event) => setAnchorEl(event.currentTarget)}
                    aria-label={t('language')}
                    aria-haspopup='true'
                    color='inherit'
                >
                    <IconLanguage stroke={1.5} size='1.3rem' />
                </Avatar>
            </ButtonBase>
            <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
                {SUPPORTED_LANGUAGES.map(({ code, label }) => (
                    <MenuItem key={code} selected={i18n.resolvedLanguage === code} onClick={() => handleSelect(code)}>
                        <ListItemIcon sx={{ minWidth: 28 }}>
                            {i18n.resolvedLanguage === code && <IconCheck stroke={1.5} size='1.1rem' />}
                        </ListItemIcon>
                        <ListItemText>{label}</ListItemText>
                    </MenuItem>
                ))}
            </Menu>
        </>
    )
}

export default LanguageSwitcher
