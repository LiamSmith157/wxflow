import { createPortal } from 'react-dom'
import PropTypes from 'prop-types'
import { MemoizedReactMarkdown } from '@/ui-component/markdown/MemoizedReactMarkdown'
import { Dialog, DialogContent, DialogTitle } from '@mui/material'
import { useNodeT } from '@/i18n/nodes'

const InputHintDialog = ({ show, dialogProps, onCancel }) => {
    const tNode = useNodeT()
    const portalElement = document.getElementById('portal')

    const component = show ? (
        <Dialog
            onClose={onCancel}
            open={show}
            fullWidth
            maxWidth='sm'
            aria-labelledby='alert-dialog-title'
            aria-describedby='alert-dialog-description'
        >
            <DialogTitle sx={{ fontSize: '1rem' }} id='alert-dialog-title'>
                {tNode(dialogProps.label)}
            </DialogTitle>
            <DialogContent>
                <MemoizedReactMarkdown>{dialogProps?.value}</MemoizedReactMarkdown>
            </DialogContent>
        </Dialog>
    ) : null

    return createPortal(component, portalElement)
}

InputHintDialog.propTypes = {
    show: PropTypes.bool,
    dialogProps: PropTypes.object,
    onCancel: PropTypes.func
}

export default InputHintDialog
