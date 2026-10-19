import express from 'express'
import agentflowv2GeneratorController from '../../controllers/agentflowv2-generator'
const router = express.Router()

router.post('/generate', agentflowv2GeneratorController.generateAgentflowv2)
router.post('/instruction', agentflowv2GeneratorController.generateInstruction)

export default router
