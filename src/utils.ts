import { trim, trimEnd } from 'lodash'
import slugify from 'slugify'

export function normalizeName (value: string): string {
    return trimEnd(trim(value).normalize().match(/(\p{L}|\p{N}|[-])+/gu).join('-'), '-').toLowerCase()
}

// Return a shell-escaped version of the string
export function shellQuote (value: string): string {
    if (!value) return '\'\''
    value = value.normalize()
    if (!/[^a-zA-Z0-9@%+=:,./-]/.test(value)) return value
    return '\'' + value.replace(/'/g, '\'"\'"\'') + '\''
}

export function asciiNormalizeName (value: string) {
    value = (value.startsWith('-')) ? '-' + slugify(value) : slugify(value)
    return normalizeName(value).replace(/-+/g, '-')
}
