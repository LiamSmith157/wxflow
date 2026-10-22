import { decodeFileName } from './index'

// the real module pulls in the whole server (and this controller again)
jest.mock('../../utils/getRunningExpressApp', () => ({ getRunningExpressApp: () => ({}) }))

describe('decodeFileName', () => {
    it('leaves ASCII and already-decoded names alone', () => {
        expect(decodeFileName('poster.png')).toBe('poster.png')
        expect(decodeFileName('海报 北京.png')).toBe('海报 北京.png')
    })

    it('repairs a UTF-8 name that was read as latin1', () => {
        const mangled = Buffer.from('海报 北京.png', 'utf8').toString('latin1')
        expect(mangled).not.toBe('海报 北京.png')
        expect(decodeFileName(mangled)).toBe('海报 北京.png')
    })

    it('keeps a genuine latin1 name that is not valid UTF-8', () => {
        expect(decodeFileName('café.png')).toBe('café.png')
    })
})
