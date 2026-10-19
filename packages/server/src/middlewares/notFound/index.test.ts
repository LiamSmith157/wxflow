import express, { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import http from 'http'
import { AddressInfo } from 'net'
import apiNotFoundMiddleware from './index'
import errorHandlerMiddleware from '../errors'

describe('apiNotFoundMiddleware', () => {
    it('forwards a 404 InternalFlowiseError that names the method and URL', () => {
        const next = jest.fn() as NextFunction

        apiNotFoundMiddleware({ method: 'GET', originalUrl: '/api/v1/assistants' } as Request, {} as Response, next)

        expect(next).toHaveBeenCalledWith(
            expect.objectContaining({ statusCode: StatusCodes.NOT_FOUND, message: 'Not found: GET /api/v1/assistants' })
        )
    })

    describe('mounted before the UI fallback', () => {
        let server: http.Server
        let baseUrl: string

        beforeAll(async () => {
            const app = express()
            app.get('/api/v1/ping', (_req, res) => res.send('pong'))
            app.use('/api', apiNotFoundMiddleware)
            app.use((_req, res) => res.send('<html>react app</html>'))
            app.use(errorHandlerMiddleware)
            await new Promise<void>((resolve) => {
                server = app.listen(0, resolve)
            })
            baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
        })

        afterAll(async () => {
            await new Promise((resolve) => server.close(resolve))
        })

        const request = async (method: string, path: string) => {
            const response = await fetch(baseUrl + path, { method })
            return { status: response.status, type: response.headers.get('content-type') ?? '', body: await response.text() }
        }

        it('keeps serving matched API routes', async () => {
            const response = await request('GET', '/api/v1/ping')

            expect(response).toMatchObject({ status: 200, body: 'pong' })
        })

        it.each(['GET', 'POST'])('answers an unmatched %s API request with a JSON 404', async (method) => {
            const response = await request(method, '/api/v1/assistants')

            expect(response.status).toBe(404)
            expect(response.type).toContain('application/json')
            expect(JSON.parse(response.body)).toMatchObject({ statusCode: 404, success: false })
        })

        it('still serves the React app for non-API paths', async () => {
            const response = await request('GET', '/chatflows')

            expect(response).toMatchObject({ status: 200, body: '<html>react app</html>' })
        })
    })
})
