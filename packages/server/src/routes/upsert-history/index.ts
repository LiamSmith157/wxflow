import express from 'express'
import { checkAnyPermission } from '../../enterprise/rbac/PermissionCheck'
import upsertHistoryController from '../../controllers/upsert-history'
const router = express.Router()

// CREATE

// READ
router.get(['/', '/:id'], checkAnyPermission('documentStores:view'), upsertHistoryController.getAllUpsertHistory)

// PATCH
router.patch('/', checkAnyPermission('documentStores:upsert-config'), upsertHistoryController.patchDeleteUpsertHistory)

// DELETE

export default router
