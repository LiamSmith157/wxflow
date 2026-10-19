import express from 'express'
import chatFilesController from '../../controllers/chat-files'

const router = express.Router()

router.post('/download/', chatFilesController.downloadChatFile)

export default router
