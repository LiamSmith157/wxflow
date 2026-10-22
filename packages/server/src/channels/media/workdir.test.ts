import os from 'os'
import path from 'path'
import { MEDIA_SUBDIRS, defaultMediaRoot, isAbsolutePath, mediaSubdir } from './workdir'

describe('media working directory', () => {
    it('lives under the home directory at .wxflow/wechat', () => {
        expect(defaultMediaRoot()).toBe(path.join(os.homedir(), '.wxflow', 'wechat'))
    })

    it('has tmp, images and voice subdirectories and nothing else', () => {
        expect([...MEDIA_SUBDIRS]).toEqual(['tmp', 'images', 'voice'])
        expect(mediaSubdir('/root', 'images')).toBe(path.join('/root', 'images'))
    })

    it('recognises Windows and posix absolute paths wherever it runs', () => {
        expect(isAbsolutePath('D:\\素材\\海报.jpg')).toBe(true)
        expect(isAbsolutePath('C:/素材/海报.jpg')).toBe(true)
        expect(isAbsolutePath('\\\\server\\share\\a.jpg')).toBe(true)
        expect(isAbsolutePath('/data/a.jpg')).toBe(true)
        expect(isAbsolutePath('海报/a.jpg')).toBe(false)
        expect(isAbsolutePath('a.jpg')).toBe(false)
        expect(isAbsolutePath('res://id/1')).toBe(false)
    })
})
