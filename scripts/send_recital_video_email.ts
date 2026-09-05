// One-off: email active students the YouTube video of the recital, and ask the
// performers whether they're OK with it being published publicly.
//
// Two variants: performers get second-person praise plus the publish/blur
// opt-out ask; everyone else active gets the watch link and an invite to play
// at the next one. One individual email per recipient (never BCC, studio rule).
//
// Send state lives in the private studio_private bucket at
// recital/video-announce/send-log.json so a re-run can't double-send.
//
// Usage:
//   npx tsx scripts/send_recital_video_email.ts          # dry run, prints everything
//   npx tsx scripts/send_recital_video_email.ts --send   # actually sends
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { config } from 'dotenv'
config({ path: '.env.local' })

const VIDEO_URL = 'https://youtu.be/xYuxHNG3Gzo'
const DEADLINE = 'Tuesday, September 8'
const FROM = 'Lionel Yu Piano Studio <notifications@updates.musicalbasics.com>'
const REPLY_TO = 'support@musicalbasics.com'
const SUBJECT = 'The recital video is up'
const BUCKET = 'studio_private'
const LOG_PATH = 'recital/video-announce/send-log.json'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://lessons.musicalbasics.com'

/** Students who played that day, by profiles.name. */
const PERFORMERS = new Set([
    'Oceanna Chan',
    'Nate Mahon',
    'Edwin Guo',
    'Robert Alconcel',
    'Padhma Berk',
])

const PROGRAM = `0:00 Idea 10 by Gibran Alcocer, performed by Oceanna Chan
3:02 Tarantella by Albert Pieczonka, performed by Nate Mahon
6:54 Waltz in C Sharp Minor by Chopin, performed by Edwin Guo
11:58 Arabesque no. 1 by Debussy, performed by Edwin Guo
17:16 Pathetique Mvmt 2 by Beethoven, performed by Robert Alconcel
22:15 Arabesque no. 1 by Debussy, performed by Padhma Berk`

const performerBody = (first: string) => `Hi ${first},

The video from our recital is finally up:

${VIDEO_URL}

${PROGRAM}

I'm very proud of you and everyone who performed that day. You each demonstrated excellent rhythm, proper control of your fingers, and a nuanced, emotional understanding of your pieces.

The path to growing as a pianist comes from developing proper finger technique, imagining the music in your mind, and feeling it from your heart.

Having personally witnessed so much growth and progress from each of you, I look forward to you continuing your piano journey, and hearing the fruits of your love for the piano.

One thing I want to check with you first: I'd like to publish this on my YouTube channel so it's public. If you'd rather I take your performance out, or blur out your face or your name, just let me know and I'll do it. You can reply to this email or send me a message in the portal. No need to explain, and no worries either way. Let me know by ${DEADLINE} and I'll publish it after that.`

const listenerBody = (first: string) => `Hi ${first},

The video from our recital is up, have a watch:

${VIDEO_URL}

${PROGRAM}

I'm very proud of everyone who performed that day. They each demonstrated excellent rhythm, proper control of their fingers, and a nuanced, emotional understanding of their pieces.

The path to growing as a pianist comes from developing proper finger technique, imagining the music in one's mind, and feeling it from one's heart.

Hope it gives you some ideas for what you'd like to play. If you want to perform at the next one, just let me know, you can reply here or send me a message in the portal.`

function escapeHtml(s: string): string {
    return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

/** Same studio chrome the recital emails use, plus an unsubscribe footer. */
function renderHtml(body: string, publicId: string | null): string {
    const paragraphs = escapeHtml(body)
        .replace(/https?:\/\/[^\s<]+/g, url => `<a href="${url}" style="color:#4f46e5; word-break:break-all;">${url}</a>`)
        .split(/\n{2,}/)
        .map(p => `<p style="font-size:14px; line-height:24px; color:#555; margin:0 0 16px; white-space:pre-wrap;">${p}</p>`)
        .join('')
    const unsub = publicId
        ? `<p style="font-size:12px; color:#999; text-align:center; margin:8px 0 0;"><a href="${APP_URL}/unsubscribe/${publicId}" style="color:#999;">Unsubscribe from studio announcements</a></p>`
        : ''
    return `<div style="background-color:#f6f9fc; padding:24px 0; font-family:-apple-system, sans-serif;">
        <div style="background-color:#ffffff; margin:0 auto; padding:32px 28px; max-width:560px; border-radius:8px;">
            ${paragraphs}
            <p style="font-size:12px; color:#999; text-align:center; margin:28px 0 0;">Lionel Yu Piano Studio</p>
            ${unsub}
        </div>
    </div>`
}

type SendLog = { sent: Record<string, { at: string; to: string; subject: string; resendId?: string }> }

async function run() {
    const send = process.argv.includes('--send')
    const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
        auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: students, error } = await s
        .from('profiles')
        .select('id, name, preferred_name, email, notification_email, public_id, announcement_emails_opt_out')
        .eq('role', 'student')
        .eq('status', 'active')
        .order('name')
    if (error) throw new Error(error.message)

    const { data: logFile } = await s.storage.from(BUCKET).download(LOG_PATH)
    const log: SendLog = logFile ? JSON.parse(await logFile.text()) : { sent: {} }

    const recipients = (students as any[])
        .filter(p => !p.announcement_emails_opt_out)
        .map(p => {
            const to = (p.notification_email || p.email || '').trim()
            const first = (p.preferred_name || p.name || '').trim().split(/\s+/)[0]
            const isPerformer = PERFORMERS.has(p.name)
            return {
                key: `student:${p.id}`,
                name: p.name,
                first,
                to,
                publicId: p.public_id || null,
                variant: isPerformer ? 'A (performer)' : 'B (listener)',
                body: isPerformer ? performerBody(first) : listenerBody(first),
            }
        })
        .filter(r => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.to))

    const already = recipients.filter(r => log.sent[r.key])
    const toSend = recipients.filter(r => !log.sent[r.key])

    console.log(`active students: ${students!.length}, sendable: ${recipients.length}, already sent: ${already.length}, to send now: ${toSend.length}`)
    for (const r of toSend) console.log(`  ${r.variant}  ${r.name} <${r.to}>  greeting "Hi ${r.first},"`)
    if (already.length) for (const r of already) console.log(`  SKIP (already sent) ${r.name} <${r.to}>`)

    if (!send) {
        console.log('\n--- dry run, nothing sent. Sample bodies below. ---\n')
        const a = toSend.find(r => r.variant.startsWith('A'))
        const b = toSend.find(r => r.variant.startsWith('B'))
        if (a) console.log(`=== VARIANT A -> ${a.name} ===\n${a.body}\n`)
        if (b) console.log(`=== VARIANT B -> ${b.name} ===\n${b.body}\n`)
        return
    }

    if (toSend.length === 0) { console.log('Nothing left to send.'); return }

    const resend = new Resend(process.env.RESEND_API_KEY!)
    const { data, error: sendError } = await resend.batch.send(
        toSend.map(r => ({
            from: FROM,
            replyTo: REPLY_TO,
            to: r.to,
            subject: SUBJECT,
            html: renderHtml(r.body, r.publicId),
            text: r.body,
        }))
    )
    if (sendError) throw new Error(`Resend error: ${sendError.message}`)

    const ids = (data?.data || []).map(d => d.id)
    const now = new Date().toISOString()
    toSend.forEach((r, i) => { log.sent[r.key] = { at: now, to: r.to, subject: SUBJECT, resendId: ids[i] } })
    const { error: upErr } = await s.storage.from(BUCKET).upload(LOG_PATH, JSON.stringify(log, null, 2), {
        contentType: 'application/json', upsert: true,
    })
    if (upErr) console.error(`WARNING: send log write failed (${upErr.message}). Emails DID go out.`)

    console.log(`\nSent ${toSend.length}:`)
    toSend.forEach((r, i) => console.log(`  ${r.name} <${r.to}>  id=${ids[i] || 'none'}`))
}

run().catch(e => { console.error(e); process.exit(1) })
