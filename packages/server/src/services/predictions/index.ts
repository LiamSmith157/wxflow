import { Request } from 'express'
import { StatusCodes } from 'http-status-codes'
import { utilBuildChatflow } from '../../utils/buildChatflow'
import { ChatType } from '../../Interface'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import { getErrorMessage } from '../../errors/utils'

const buildChatflow = async (req: Request, chatType?: ChatType) => {
    try {
        const dbResponse = await utilBuildChatflow(req, false, chatType)
        return dbResponse
    } catch (error) {
        if (
            error instanceof InternalFlowiseError &&
            error.statusCode >= StatusCodes.BAD_REQUEST &&
            error.statusCode < StatusCodes.INTERNAL_SERVER_ERROR
        ) {
            throw error
        }
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: predictionsServices.buildChatflow - ${getErrorMessage(error)}`
        )
    }
}

export default {
    buildChatflow
}
