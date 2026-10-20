import fs from 'fs'
import os from 'os'
import path from 'path'
import { getDefaultDataDir, getEnv } from './wxflowEnv'

describe('getEnv', () => {
    const saved = { ...process.env }
    afterEach(() => {
        process.env = { ...saved }
    })

    it('returns undefined when neither is set', () => {
        delete process.env.WXFLOW_X_TEST
        delete process.env.FLOWISE_X_TEST
        expect(getEnv('X_TEST')).toBeUndefined()
    })

    it('falls back to the legacy FLOWISE_ variable', () => {
        process.env.FLOWISE_X_TEST = 'old'
        expect(getEnv('X_TEST')).toBe('old')
    })

    it('prefers WXFLOW_ over FLOWISE_', () => {
        process.env.FLOWISE_X_TEST = 'old'
        process.env.WXFLOW_X_TEST = 'new'
        expect(getEnv('X_TEST')).toBe('new')
    })

    it('treats empty WXFLOW_ as unset', () => {
        process.env.FLOWISE_X_TEST = 'old'
        process.env.WXFLOW_X_TEST = ''
        expect(getEnv('X_TEST')).toBe('old')
    })
})

describe('getDefaultDataDir', () => {
    const saved = { ...process.env }
    let home: string
    beforeEach(() => {
        home = fs.mkdtempSync(path.join(os.tmpdir(), 'wxflow-home-'))
        process.env.HOME = home
        process.env.USERPROFILE = home
    })
    afterEach(() => {
        process.env = { ...saved }
        fs.rmSync(home, { recursive: true, force: true })
    })

    it('uses ~/.wxflow on a fresh install', () => {
        expect(getDefaultDataDir()).toBe(path.join(home, '.wxflow'))
    })

    it('keeps using ~/.flowise when only it exists', () => {
        fs.mkdirSync(path.join(home, '.flowise'))
        expect(getDefaultDataDir()).toBe(path.join(home, '.flowise'))
    })

    it('prefers ~/.wxflow when both exist', () => {
        fs.mkdirSync(path.join(home, '.flowise'))
        fs.mkdirSync(path.join(home, '.wxflow'))
        expect(getDefaultDataDir()).toBe(path.join(home, '.wxflow'))
    })
})
