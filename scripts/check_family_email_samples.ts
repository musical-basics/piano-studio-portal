/**
 * Renders every sample on /admin/emails (#1003) through the same code the page
 * uses (lib/family-email-samples.ts) and checks each one: a full HTML email, the
 * subject families get, the family's own time where a lesson time is shown, and
 * no "undefined", "NaN" or "Invalid Date" anywhere. Sends nothing, reads no data.
 *
 *   npx tsx scripts/check_family_email_samples.ts
 */
import { buildFamilyEmailSamples, FAMILY_EMAIL_GROUPS } from '../lib/family-email-samples'

const TIME = '5:30pm EST (2:30pm your time)'
const EM_DASH = String.fromCharCode(0x2014)

const EXPECTED: Record<string, string[]> = {
    'reminder-2-days': [`Please confirm your lesson on Thursday, December 3 at ${TIME}`],
    'reminder-day-before': [`Reminder: your lesson tomorrow at ${TIME}`, `Please confirm your lesson tomorrow at ${TIME}`],
    'reminder-12-hours': [`Please confirm your lesson today at ${TIME}`],
    'reminder-starting-soon': ['Lesson Starting Soon!', 'Lesson Starting Soon!', 'Lesson Starting Soon!'],
    'reminder-by-hand': [
        'Lesson coming up in exactly 2 hours and 15 minutes',
        'Reminder: Piano Lesson Tomorrow',
        'Reminder: Lesson starts in 2 hours',
        'Join Now: Piano Lesson Starting!',
    ],
    'lesson-booked': [
        `Lesson Scheduled for Piano Student on December 3, 2026 at ${TIME}`,
        `Lesson Scheduled for Piano Student on December 3, 2026 at ${TIME}`,
    ],
    'lesson-moved': ['Lesson Rescheduled: December 5, 2026 at 11:00am EST (8:00am your time)'],
    'lesson-cancelled': [`Lesson Canceled: December 3, 2026 at ${TIME}`],
    'lesson-notes': ['Lesson Notes: Thursday, December 3, 2026', 'Lesson Notes Updated: Thursday, December 3, 2026'],
    'recording-ready': ['Your lesson recording is ready 🎹'],
    'new-recordings': ['New lesson recording available 🎹', '2 new lesson recordings available 🎹'],
    'practice-instructions': ['New practice instructions: Clementi Sonatina Op. 36 No. 1'],
    'new-message': ['New message from Professor Lionel Yu'],
    'announcement': ['📢 Winter recital on December 19'],
    'renewal-receipt': [`Your subscription renewed ${EM_DASH} 4 credits added!`],
    'monthly-statement': ['Your November lesson summary'],
    'trial-reply': ["Got it. I'll be in touch within 48 hours."],
    'audition-account': ['Your audition account is ready'],
    'inquiry-reply': ['Re: Piano Lesson Inquiry'],
}

/** Emails whose body shows the lesson time, so the family's own time must be there. */
const SHOWS_FAMILY_TIME = new Set([
    'reminder-2-days', 'reminder-day-before', 'reminder-12-hours', 'reminder-starting-soon', 'reminder-by-hand',
    'lesson-booked', 'lesson-moved', 'lesson-cancelled', 'lesson-notes',
])

async function main() {
    const emails = await buildFamilyEmailSamples()
    const problems: string[] = []
    const seen = new Set<string>()

    for (const email of emails) {
        if (seen.has(email.id)) problems.push(`${email.id}: id used twice`)
        seen.add(email.id)
        if (!(FAMILY_EMAIL_GROUPS as readonly string[]).includes(email.group)) problems.push(`${email.id}: unknown group ${email.group}`)
        if (!email.name || !email.when || !email.who) problems.push(`${email.id}: name, when or who missing`)

        const expected = EXPECTED[email.id]
        if (!expected) problems.push(`${email.id}: no expected subjects listed in this script`)
        else if (expected.length !== email.samples.length) problems.push(`${email.id}: ${email.samples.length} samples, expected ${expected.length}`)

        email.samples.forEach((s, i) => {
            const where = `${email.id}${s.label ? ` (${s.label})` : ''}`
            if (expected && s.subject !== expected[i]) problems.push(`${where}: subject "${s.subject}", expected "${expected[i]}"`)
            if (!/^<!DOCTYPE html/i.test(s.html) || !/<\/html>\s*$/i.test(s.html)) problems.push(`${where}: not a whole HTML document`)
            if (s.html.length < 300) problems.push(`${where}: HTML only ${s.html.length} characters`)
            // An announcement is the same for everyone, so it names no one.
            if (email.id !== 'announcement' && !s.html.includes('Piano')) problems.push(`${where}: the sample student's name is missing`)
            for (const bad of ['undefined', 'NaN', 'Invalid Date']) {
                if (s.html.includes(bad) || s.subject.includes(bad)) problems.push(`${where}: contains "${bad}"`)
            }
            if (/\bnull\b/.test(s.subject)) problems.push(`${where}: subject contains "null"`)
            // The "exact time remaining" reminder says how long until the lesson, not when.
            const showsTime = SHOWS_FAMILY_TIME.has(email.id) && s.label !== 'Exact time remaining'
            if (showsTime && !s.html.includes('your time')) problems.push(`${where}: no family time in the body`)
            if (s.html.includes(EM_DASH)) console.log(`note: ${where} has an em dash in its body`)
            if (s.subject.includes(EM_DASH)) console.log(`note: ${where} has an em dash in its subject`)
        })
    }
    for (const id of Object.keys(EXPECTED)) if (!seen.has(id)) problems.push(`${id}: expected but not on the page`)

    const samples = emails.reduce((n, e) => n + e.samples.length, 0)
    console.log(`${emails.length} emails, ${samples} samples rendered.`)
    for (const e of emails) {
        for (const s of e.samples) console.log(`  ${e.name}${s.label ? ` (${s.label})` : ''}: ${s.subject}  [${s.html.length} chars]`)
    }
    if (problems.length) {
        console.log(`\n${problems.length} problem(s):`)
        for (const p of problems) console.log(`  - ${p}`)
        process.exit(1)
    }
    console.log('\nAll samples look right.')
}

main().catch(e => {
    console.error(e)
    process.exit(1)
})
