// Phone numbers for texting families. No Node-only imports: the admin and
// student settings forms use these in the browser.

/**
 * A phone number in E.164 form (+16045551234), or null if it can't be one.
 * Ten digits are taken as North American; anything else needs its country
 * code, with or without the leading "+".
 */
export function toE164(raw: string | null | undefined): string | null {
    if (!raw) return null
    const trimmed = raw.trim()
    const digits = trimmed.replace(/\D/g, '')
    if (!digits) return null
    if (!trimmed.startsWith('+')) {
        if (digits.length === 10) return `+1${digits}`
        if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
    }
    if (digits.length < 8 || digits.length > 15) return null
    return `+${digits}`
}

/** "+16045551234" -> "(604) 555-1234" for North American numbers; others unchanged. */
export function formatPhone(e164: string | null | undefined): string {
    if (!e164) return ''
    const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/)
    return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164
}
