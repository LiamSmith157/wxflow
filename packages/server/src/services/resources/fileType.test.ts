import { detectFileType } from './fileType'

const bytes = (...b: number[]) => Buffer.from(b)
const pad = (head: Buffer, total = 64) => Buffer.concat([head, Buffer.alloc(Math.max(0, total - head.length), 0x20)])
const ftyp = (brand: string) => pad(Buffer.concat([bytes(0, 0, 0, 0x18), Buffer.from('ftyp' + brand, 'latin1')]))

const JPEG = pad(bytes(0xff, 0xd8, 0xff, 0xe0))
const PNG = pad(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))
const ZIP = pad(bytes(0x50, 0x4b, 0x03, 0x04))
const OLE = pad(bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1))

describe('detectFileType', () => {
    it.each([
        ['a.jpg', JPEG, { kind: 'image', mimeType: 'image/jpeg', ext: '.jpg' }],
        ['a.png', PNG, { kind: 'image', mimeType: 'image/png', ext: '.png' }],
        ['a.gif', pad(Buffer.from('GIF89a', 'latin1')), { kind: 'image', mimeType: 'image/gif', ext: '.gif' }],
        ['a.webp', pad(Buffer.from('RIFF\0\0\0\0WEBP', 'latin1')), { kind: 'image', mimeType: 'image/webp', ext: '.webp' }],
        ['v.mp4', ftyp('isom'), { kind: 'video', mimeType: 'video/mp4', ext: '.mp4' }],
        ['v.mp4', ftyp('mp42'), { kind: 'video', mimeType: 'video/mp4', ext: '.mp4' }],
        ['d.pdf', pad(Buffer.from('%PDF-1.7', 'latin1')), { kind: 'file', mimeType: 'application/pdf', ext: '.pdf' }]
    ])('recognises %s by its content', (name, head, expected) => {
        expect(detectFileType(head, name)).toEqual(expected)
    })

    it('trusts the content over the extension: a PNG called .jpg is stored as a PNG', () => {
        expect(detectFileType(PNG, 'photo.jpg')).toMatchObject({ kind: 'image', ext: '.png' })
    })

    it('refuses an executable renamed to .jpg', () => {
        expect(detectFileType(pad(Buffer.from('MZ\x90\0', 'latin1')), 'virus.jpg')).toBeUndefined()
    })

    it('refuses an .exe file and other unknown types', () => {
        expect(detectFileType(pad(Buffer.from('MZ\x90\0', 'latin1')), 'setup.exe')).toBeUndefined()
        expect(detectFileType(pad(Buffer.from('#!/bin/sh', 'latin1')), 'run.sh')).toBeUndefined()
        expect(detectFileType(Buffer.alloc(0), 'empty.jpg')).toBeUndefined()
    })

    it('does not take a QuickTime or HEIF container for an mp4', () => {
        expect(detectFileType(ftyp('qt  '), 'clip.mp4')).toBeUndefined()
        expect(detectFileType(ftyp('heic'), 'photo.jpg')).toBeUndefined()
    })

    it.each(['.docx', '.xlsx', '.pptx', '.zip'])('accepts a zip container named %s and keeps the extension', (ext) => {
        expect(detectFileType(ZIP, `file${ext.toUpperCase()}`)).toMatchObject({ kind: 'file', ext })
    })

    it('refuses a zip container with an extension that is not allowed', () => {
        expect(detectFileType(ZIP, 'archive.jar')).toBeUndefined()
        expect(detectFileType(ZIP, 'noextension')).toBeUndefined()
    })

    it.each(['.doc', '.xls', '.ppt'])('accepts an old Office file named %s', (ext) => {
        expect(detectFileType(OLE, `file${ext}`)).toMatchObject({ kind: 'file', ext })
    })

    it('accepts plain text only when it is called .txt and has no binary bytes', () => {
        expect(detectFileType(Buffer.from('你好, world\n'), 'note.txt')).toMatchObject({
            kind: 'file',
            mimeType: 'text/plain',
            ext: '.txt'
        })
        expect(detectFileType(Buffer.from('hello'), 'note.log')).toBeUndefined()
        expect(detectFileType(Buffer.from([0x68, 0x00, 0x69]), 'note.txt')).toBeUndefined()
    })
})
