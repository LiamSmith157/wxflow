// The media working directory is wxflow's own scratch space for WeChat media: files downloaded from a URL before they
// are sent, images decrypted by the DLL and voice audio. wxflow runs on the same Windows machine as the DLL, so a
// path wxflow uses is also a path the DLL can open: there is nothing to configure and nothing to translate.
import os from 'os'
import path from 'path'

export const MEDIA_SUBDIRS = ['tmp', 'images', 'voice'] as const
export type MediaSubdir = (typeof MEDIA_SUBDIRS)[number]

/** `~/.wxflow/wechat`, fixed on purpose */
export const defaultMediaRoot = (): string => path.join(os.homedir(), '.wxflow', 'wechat')

/** Absolute path of a subdirectory of the media working directory */
export const mediaSubdir = (root: string, sub: MediaSubdir): string => path.join(root, sub)

/** Absolute in either path flavor, so a Windows path is recognised wherever the code runs */
export const isAbsolutePath = (p: string): boolean => path.win32.isAbsolute(p) || path.posix.isAbsolute(p)
