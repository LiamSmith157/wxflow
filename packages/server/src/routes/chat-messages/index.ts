import express from 'express'
import chatMessageController from '../../controllers/chat-messages'
import { checkAnyPermission } from '../../enterprise/rbac/PermissionCheck'
const router = express.Router()

// CREATE
// NOTE: Unused route
// router.post(['/', '/:id'], chatMessageController.createChatMessage)

// READ
router.get(['/', '/:id'], checkAnyPermission('agentflows:view,agentflows:update'), chatMessageController.getAllChatMessages)

// UPDATE
router.put(
    ['/abort/', '/abort/:chatflowid/:chatid'],
    checkAnyPermission('agentflows:create,agentflows:update'),
    chatMessageController.abortChatMessage
)

// DELETE
router.delete(['/', '/:id'], checkAnyPermission('agentflows:delete'), chatMessageController.removeAllChatMessages)

export default router
