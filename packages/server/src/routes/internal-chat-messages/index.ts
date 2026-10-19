import express from 'express'
import chatMessagesController from '../../controllers/chat-messages'
import { checkAnyPermission } from '../../enterprise/rbac/PermissionCheck'
const router = express.Router()

// CREATE

// READ
router.get(['/', '/:id'], checkAnyPermission('agentflows:view,agentflows:update'), chatMessagesController.getAllInternalChatMessages)

// UPDATE

// DELETE

export default router
