import { zhCN } from '@mui/x-data-grid/locales'
import { useTranslation } from 'react-i18next'

const dataGridLocales = { 'zh-CN': zhCN.components.MuiDataGrid.defaultProps.localeText }

/**
 * Built-in text of MUI X DataGrid ("No rows", column menu...) for the active language.
 * English needs no override because it is the DataGrid default.
 */
export const useDataGridLocale = () => {
    const { i18n } = useTranslation()
    return dataGridLocales[i18n.resolvedLanguage]
}
