// Who a recital (or other family-facing) email is addressed to.
//
// Rule (per Lionel): if the student has a parent name or parent email on file,
// the email is addressed to the parent; otherwise it's addressed to the student
// (assumed to be an adult). An explicit contact_salutation always wins.
//
// Pure function shared by the admin review page and the actual send, so what
// the review page shows is exactly what goes out.

export type AddressingProfile = {
    name: string | null
    email: string | null
    preferred_name?: string | null
    parent_email?: string | null
    parent_contact_name?: string | null
    contact_salutation?: string | null
}

export type RecitalAddressing = {
    /** The X in "Hi X," */
    greetingName: string
    /** To-addresses: parent email first when present, student email included, deduped. */
    recipients: string[]
    /** 'parent' | 'student' | 'override' */
    addressedTo: 'parent' | 'student' | 'override'
    /** Human explanation shown on the review page. */
    basis: string
    /** Something is off (no usable name or no email at all): needs admin attention. */
    needsAttention: boolean
}

function firstWord(s: string | null | undefined): string {
    return (s || '').trim().split(/\s+/)[0] || ''
}

export function resolveRecitalAddressing(p: AddressingProfile): RecitalAddressing {
    const parentEmail = p.parent_email?.trim() || null
    const studentEmail = p.email?.trim() || null
    const recipients: string[] = []
    for (const addr of [parentEmail, studentEmail]) {
        if (addr && !recipients.some(r => r.toLowerCase() === addr.toLowerCase())) {
            recipients.push(addr)
        }
    }
    const noEmail = recipients.length === 0

    const salutation = p.contact_salutation?.trim()
    if (salutation) {
        return {
            greetingName: salutation,
            recipients,
            addressedTo: 'override',
            basis: 'Manual salutation override (contact_salutation)',
            needsAttention: noEmail,
        }
    }

    const parentName = firstWord(p.parent_contact_name)
    if (parentName) {
        return {
            greetingName: parentName,
            recipients,
            addressedTo: 'parent',
            basis: 'Parent name on file',
            needsAttention: noEmail,
        }
    }

    if (parentEmail) {
        const studentFirst = firstWord(p.preferred_name) || firstWord(p.name)
        return {
            greetingName: studentFirst ? `${studentFirst}'s family` : 'there',
            recipients,
            addressedTo: 'parent',
            basis: 'Parent email on file but no parent name: greeting falls back to the family. Add a parent name or a salutation override to greet them by name.',
            needsAttention: true,
        }
    }

    const studentFirst = firstWord(p.preferred_name) || firstWord(p.name)
    return {
        greetingName: studentFirst || 'there',
        recipients,
        addressedTo: 'student',
        basis: 'No parent info on file: addressed to the student (adult).',
        needsAttention: noEmail || !studentFirst,
    }
}
