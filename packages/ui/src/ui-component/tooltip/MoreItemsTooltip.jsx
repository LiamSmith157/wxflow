import { Tooltip, Typography } from '@mui/material'
import { styled } from '@mui/material/styles'
import PropTypes from 'prop-types'
import { useNodeT } from '@/i18n/nodes'

const StyledOl = styled('ol')(() => ({
    paddingLeft: 20,
    margin: 0
}))

const StyledLi = styled('li')(() => ({
    paddingBottom: 4
}))

const MoreItemsTooltip = ({ images, children }) => {
    const tNode = useNodeT()
    if (!images || images.length === 0) return children

    return (
        <Tooltip
            title={
                <StyledOl>
                    {images.map((img) => (
                        <StyledLi key={img.imageSrc || img.label}>
                            <Typography>{tNode(img.label)}</Typography>
                        </StyledLi>
                    ))}
                </StyledOl>
            }
            placement='top'
        >
            {children}
        </Tooltip>
    )
}

export default MoreItemsTooltip

MoreItemsTooltip.propTypes = {
    images: PropTypes.array,
    children: PropTypes.node
}
