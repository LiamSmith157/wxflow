import express from 'express'
import resourcesController from '../../controllers/resources'
import { checkPermission } from '../../enterprise/rbac/PermissionCheck'

const router = express.Router()

router.get('/', checkPermission('resources:view'), resourcesController.list)
router.post('/', checkPermission('resources:create'), resourcesController.receiveFile, resourcesController.create)

router.get('/:id/file', checkPermission('resources:view'), resourcesController.sendFile)
router.get('/:id/usages', checkPermission('resources:view'), resourcesController.usages)
router.put('/:id/file', checkPermission('resources:update'), resourcesController.receiveFile, resourcesController.replaceFile)
router.put('/:id', checkPermission('resources:update'), resourcesController.update)
router.delete('/:id', checkPermission('resources:delete'), resourcesController.remove)

export default router
