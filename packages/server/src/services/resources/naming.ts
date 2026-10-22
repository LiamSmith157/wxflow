import { StatusCodes } from 'http-status-codes'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'

export const MAX_NAME_LENGTH = 100
export const MAX_GROUP_LENGTH = 100

const FORBIDDEN_NAME_CHARS = ['/', '\\', '{', '}']

const bad = (message: string) => new InternalFlowiseError(StatusCodes.BAD_REQUEST, message)

/** The key a resource name is compared by: trimmed and case-insensitive */
export const toNameKey = (name: string): string => name.trim().toLowerCase()

/** Validate a resource name and return it trimmed together with its lookup key */
export const normalizeName = (raw: unknown): { name: string; nameKey: string } => {
    const name = typeof raw === 'string' ? raw.trim() : ''
    if (!name) throw bad('资源名称不能为空')
    if (name.length > MAX_NAME_LENGTH) throw bad(`资源名称不能超过 ${MAX_NAME_LENGTH} 个字符`)
    const forbidden = FORBIDDEN_NAME_CHARS.find((c) => name.includes(c))
    if (forbidden) throw bad(`资源名称不能包含 ${forbidden}`)
    return { name, nameKey: toNameKey(name) }
}

/** A group is optional; an empty value means "no group" */
export const normalizeGroup = (raw: unknown): string | null => {
    if (raw === undefined || raw === null) return null
    const group = String(raw).trim()
    if (!group) return null
    if (group.length > MAX_GROUP_LENGTH) throw bad(`分组名称不能超过 ${MAX_GROUP_LENGTH} 个字符`)
    return group
}
