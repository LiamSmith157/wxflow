import { z } from 'zod/v3'
import i18n from '@/i18n'

// Messages are resolved when the schema is built, so validatePassword always uses the current language
const buildPasswordSchema = () =>
    z
        .string()
        .min(8, i18n.t('auth:passwordRules.min'))
        .max(128, i18n.t('auth:passwordRules.max'))
        .regex(/[a-z]/, i18n.t('auth:passwordRules.lowercase'))
        .regex(/[A-Z]/, i18n.t('auth:passwordRules.uppercase'))
        .regex(/\d/, i18n.t('auth:passwordRules.digit'))
        .regex(/[^a-zA-Z0-9]/, i18n.t('auth:passwordRules.special'))

export const passwordSchema = buildPasswordSchema()

export const validatePassword = (password) => {
    const result = buildPasswordSchema().safeParse(password)
    if (!result.success) {
        return result.error.errors.map((err) => err.message)
    }
    return []
}
