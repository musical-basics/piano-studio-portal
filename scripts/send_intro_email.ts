// Sends the new-student intro email (with the Online Lessons Setup PDF attached)
// via Resend. Defaults to the test inbox for review; pass a recipient to send
// for real.
//
// Usage:
//   npx tsx scripts/send_intro_email.ts                      # test -> musicalbasics@gmail.com
//   npx tsx scripts/send_intro_email.ts shunyingchen5@gmail.com   # real send to Franz
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { Resend } from 'resend'
import { config } from 'dotenv'
config({ path: '.env.local' })

const TEST_RECIPIENT = 'musicalbasics@gmail.com'
const recipient = process.argv[2] || TEST_RECIPIENT

const STUDENT = {
  firstName: 'Franz',
  email: 'shunyingchen5@gmail.com',
  tempPassword: 'piano123',
  day: 'Sundays',
  time: '3:15 PM Pacific',
}
const PORTAL_URL = 'https://lessons.musicalbasics.com'
const PDF_PATH = resolve('docs/Online Lessons Setup LYPS 2025.pdf')

const subject = 'Welcome to Lionel Yu Piano Studio 🎹'

const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 15px; color: #1a1a1a; line-height: 1.55;">
  <p>Hi ${STUDENT.firstName},</p>
  <p>Welcome! Your student portal account is ready. You can sign in here:</p>
  <p>
    Portal: <a href="${PORTAL_URL}">${PORTAL_URL.replace('https://', '')}</a><br/>
    Email: ${STUDENT.email}<br/>
    Temporary password: ${STUDENT.tempPassword}
  </p>
  <p>Please sign in and change your password. You'll find everything else in the portal.</p>
  <p>The setup guide is attached.</p>
  <p>Any questions, just reply.</p>
  <p>Warmly,<br/>Lionel Yu</p>
</div>
`

const text = `Hi ${STUDENT.firstName},

Welcome! Your student portal account is ready. You can sign in here:

Portal: ${PORTAL_URL}
Email: ${STUDENT.email}
Temporary password: ${STUDENT.tempPassword}

Please sign in and change your password. You'll find everything else in the portal.

The setup guide is attached.

Any questions, just reply.

Warmly,
Lionel Yu
`

async function run() {
  const resend = new Resend(process.env.RESEND_API_KEY!)
  const pdf = readFileSync(PDF_PATH)
  const isTest = recipient === TEST_RECIPIENT

  const { data, error } = await resend.emails.send({
    from: 'Lionel Yu Piano Studio <notifications@updates.musicalbasics.com>',
    to: recipient,
    replyTo: 'lionel@musicalbasics.com',
    subject: isTest ? `[TEST] ${subject}` : subject,
    html,
    text,
    attachments: [{ filename: 'Online Lessons Setup.pdf', content: pdf }],
  })

  if (error) {
    console.error('Resend error:', error)
    process.exit(1)
  }
  console.log(`Sent to ${recipient} (id: ${data?.id}). Attachment: ${(pdf.length / 1024 / 1024).toFixed(1)} MB.`)
}

run().catch((e) => {
  console.error('FAILED:', e)
  process.exit(1)
})
