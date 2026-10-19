import { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'

// Unmatched API requests must not fall through to the React app, which would answer 200 with index.html
function apiNotFoundMiddleware(req: Request, _res: Response, next: NextFunction) {
    next(new InternalFlowiseError(StatusCodes.NOT_FOUND, `Not found: ${req.method} ${req.originalUrl}`))
}

export default apiNotFoundMiddleware
