import express from 'express'
import channelInstancesController from '../../controllers/channel-instances'
import { checkPermission } from '../../enterprise/rbac/PermissionCheck'

const router = express.Router()

// static paths first so they are not captured by /:id
router.get('/gateway-status', checkPermission('channelInstances:view'), channelInstancesController.getStatus)
router.get('/settings', checkPermission('channelInstances:view'), channelInstancesController.getSettings)
router.put('/settings', checkPermission('channelInstances:manage'), channelInstancesController.updateSettings)

router.get('/', checkPermission('channelInstances:view'), channelInstancesController.listInstances)
router.put('/:id/assignment', checkPermission('channelInstances:manage'), channelInstancesController.assignInstance)
router.post('/:id/test-image', checkPermission('channelInstances:manage'), channelInstancesController.sendTest)

export default router
