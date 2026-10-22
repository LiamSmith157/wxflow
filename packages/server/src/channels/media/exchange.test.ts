import { ExchangePathError, exchangeSubdir, fromHostPath, getExchangeConfig, hostSubdir, isInsideExchange, toHostPath } from './exchange'

const docker = { dir: '/exchange', hostDir: 'C:\\wxflow\\exchange', mapped: true }
const direct = { dir: 'C:\\wxflow\\exchange', hostDir: 'C:\\wxflow\\exchange', mapped: false }

describe('exchange path mapping', () => {
    describe('toHostPath', () => {
        it('maps a container path to the Windows path (host path configured)', () => {
            expect(toHostPath(docker, '/exchange/assets/a.jpg')).toBe('C:\\wxflow\\exchange\\assets\\a.jpg')
            expect(toHostPath(docker, '/exchange/assets/海报/a.jpg')).toBe('C:\\wxflow\\exchange\\assets\\海报\\a.jpg')
        })

        it('keeps Windows paths as they are when no host path is configured (direct install)', () => {
            expect(toHostPath(direct, 'C:\\wxflow\\exchange\\assets\\a.jpg')).toBe('C:\\wxflow\\exchange\\assets\\a.jpg')
            expect(toHostPath(direct, 'C:/wxflow/exchange/assets/a.jpg')).toBe('C:\\wxflow\\exchange\\assets\\a.jpg')
        })

        it('treats the same posix directory as both views when no host path is configured', () => {
            const cfg = { dir: '/data/exchange', hostDir: '/data/exchange', mapped: false }
            expect(toHostPath(cfg, '/data/exchange/tmp/x.png')).toBe('/data/exchange/tmp/x.png')
        })

        it('maps the exchange directory itself', () => {
            expect(toHostPath(docker, '/exchange')).toBe('C:\\wxflow\\exchange')
        })

        it('rejects paths outside the exchange directory', () => {
            expect(() => toHostPath(docker, '/etc/passwd')).toThrow(ExchangePathError)
            expect(() => toHostPath(docker, '/exchange/../etc/passwd')).toThrow(ExchangePathError)
            expect(() => toHostPath(docker, '/exchange-other/a.jpg')).toThrow(ExchangePathError)
            expect(() => toHostPath(direct, 'D:\\其他\\a.jpg')).toThrow(ExchangePathError)
        })

        it('compares Windows paths case-insensitively but keeps the original case', () => {
            expect(toHostPath(direct, 'c:\\WXFLOW\\Exchange\\Assets\\A.jpg')).toBe('C:\\wxflow\\exchange\\Assets\\A.jpg')
        })
    })

    describe('fromHostPath', () => {
        it('maps a Windows path from the DLL back to the container path', () => {
            expect(fromHostPath(docker, 'C:\\wxflow\\exchange\\images\\1.jpg')).toBe('/exchange/images/1.jpg')
            expect(fromHostPath(docker, 'C:/wxflow/exchange/images/1.jpg')).toBe('/exchange/images/1.jpg')
        })

        it('is the identity for direct installs', () => {
            expect(fromHostPath(direct, 'C:\\wxflow\\exchange\\images\\1.jpg')).toBe('C:\\wxflow\\exchange\\images\\1.jpg')
        })

        it('rejects paths the DLL reports outside the exchange directory', () => {
            expect(() => fromHostPath(docker, 'D:\\elsewhere\\1.jpg')).toThrow(ExchangePathError)
        })
    })

    it('isInsideExchange', () => {
        expect(isInsideExchange(docker, '/exchange/assets/a.jpg')).toBe(true)
        expect(isInsideExchange(docker, '/tmp/a.jpg')).toBe(false)
        expect(isInsideExchange(docker, 'relative/a.jpg')).toBe(false)
    })

    it('builds subdirectory paths in both views', () => {
        expect(exchangeSubdir(docker, 'images')).toBe('/exchange/images')
        expect(hostSubdir(docker, 'images')).toBe('C:\\wxflow\\exchange\\images')
    })

    describe('getExchangeConfig', () => {
        it('reads both directories from the environment', () => {
            expect(getExchangeConfig({ WECHAT_EXCHANGE_DIR: '/exchange', WECHAT_EXCHANGE_DIR_HOST: 'C:\\wxflow\\exchange' })).toEqual(
                docker
            )
        })
        it('treats an unset host path as the same directory', () => {
            expect(getExchangeConfig({ WECHAT_EXCHANGE_DIR: 'C:\\wxflow\\exchange' })).toEqual(direct)
        })
        it('falls back to a directory under the home folder', () => {
            const cfg = getExchangeConfig({})
            expect(cfg.dir.endsWith('exchange')).toBe(true)
            expect(cfg.hostDir).toBe(cfg.dir)
            expect(cfg.mapped).toBe(false)
        })
    })
})
