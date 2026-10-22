// action - state management
import * as actionTypes from '../actions'

export const initialState = {
    isDirty: false,
    chatflow: null,
    canvasDialogShow: false,
    componentNodes: [],
    componentCredentials: [],
    // nodeId -> warnings about fixed media paths that do not exist (shown on the node after a save)
    mediaWarnings: {}
}

// ==============================|| CANVAS REDUCER ||============================== //

const canvasReducer = (state = initialState, action) => {
    switch (action.type) {
        case actionTypes.SET_DIRTY:
            return {
                ...state,
                isDirty: true
            }
        case actionTypes.REMOVE_DIRTY:
            return {
                ...state,
                isDirty: false
            }
        case actionTypes.SET_CHATFLOW:
            return {
                ...state,
                chatflow: action.chatflow,
                // warnings belong to one flow: switching to another flow starts clean
                mediaWarnings: state.chatflow?.id === action.chatflow?.id ? state.mediaWarnings : {}
            }
        case actionTypes.SHOW_CANVAS_DIALOG:
            return {
                ...state,
                canvasDialogShow: true
            }
        case actionTypes.HIDE_CANVAS_DIALOG:
            return {
                ...state,
                canvasDialogShow: false
            }
        case actionTypes.SET_COMPONENT_NODES:
            return {
                ...state,
                componentNodes: action.componentNodes
            }
        case actionTypes.SET_COMPONENT_CREDENTIALS:
            return {
                ...state,
                componentCredentials: action.componentCredentials
            }
        case actionTypes.SET_MEDIA_WARNINGS:
            return {
                ...state,
                mediaWarnings: action.mediaWarnings || {}
            }
        default:
            return state
    }
}

export default canvasReducer
