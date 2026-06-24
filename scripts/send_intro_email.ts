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
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #1a1a1a; line-height: 1.55;">
  <h1 style="font-size: 22px; margin: 0 0 4px;">Welcome to Lionel Yu Piano Studio 🎹</h1>
  <p style="font-size: 15px; color: #444; margin: 16px 0;">Hi ${STUDENT.firstName},</p>
  <p style="font-size: 15px; color: #444; margin: 16px 0;">
    Welcome! I'm delighted you're joining the studio for online piano lessons. Here is everything you need to get started.
  </p>

  <h2 style="font-size: 16px; margin: 28px 0 8px;">Your lessons</h2>
  <ul style="font-size: 15px; color: #444; margin: 0; padding-left: 20px;">
    <li>Schedule: ${STUDENT.day} at ${STUDENT.time}</li>
    <li>Length: 30 minutes, weekly</li>
    <li>Format: online over Zoom</li>
  </ul>

  <h2 style="font-size: 16px; margin: 28px 0 8px;">Your student portal</h2>
  <p style="font-size: 15px; color: #444; margin: 8px 0;">
    You have an account at <a href="${PORTAL_URL}" style="color: #635bff;">${PORTAL_URL.replace('https://', '')}</a>.
  </p>
  <ul style="font-size: 15px; color: #444; margin: 0; padding-left: 20px;">
    <li>Email: ${STUDENT.email}</li>
    <li>Temporary password: <strong>${STUDENT.tempPassword}</strong> (please change it after your first login)</li>
  </ul>
  <p style="font-size: 15px; color: #444; margin: 8px 0;">
    From the portal you can book lessons, view your schedule, and manage your tuition.
  </p>

  <h2 style="font-size: 16px; margin: 28px 0 8px;">Tuition</h2>
  <p style="font-size: 15px; color: #444; margin: 8px 0;">
    You're on our quarterly plan: $635 per quarter, billed as 3 monthly payments of $211.67.
    Each payment adds 4 lesson credits, for 12 credits per quarter (one for each weekly lesson).
  </p>

  <h2 style="font-size: 16px; margin: 28px 0 8px;">First step: start your plan</h2>
  <p style="font-size: 15px; color: #444; margin: 8px 0;">
    To activate your credits and book your first lesson, log into the portal and click
    <strong>Purchase Credits</strong> to start your subscription. Your first payment adds 4 credits right away.
  </p>
  <p style="margin: 16px 0;">
    <a href="${PORTAL_URL}" style="display: inline-block; background: #111; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 15px;">Log in to your portal →</a>
  </p>

  <h2 style="font-size: 16px; margin: 28px 0 8px;">Setting up for online lessons</h2>
  <p style="font-size: 15px; color: #444; margin: 8px 0;">
    I've attached a short setup guide (Online Lessons Setup) covering camera placement, audio tips,
    and how to join our Zoom sessions. Please take a look before our first lesson.
  </p>

  <p style="font-size: 15px; color: #444; margin: 24px 0 8px;">
    If you have any questions, just reply to this email. Looking forward to making music with you!
  </p>
  <p style="font-size: 15px; color: #444; margin: 8px 0 0;">Warmly,<br/>Lionel Yu<br/><span style="color:#888;">Lionel Yu Piano Studio</span></p>
</div>
`

const text = `Welcome to Lionel Yu Piano Studio

Hi ${STUDENT.firstName},

Welcome! I'm delighted you're joining the studio for online piano lessons. Here is everything you need to get started.

YOUR LESSONS
- Schedule: ${STUDENT.day} at ${STUDENT.time}
- Length: 30 minutes, weekly
- Format: online over Zoom

YOUR STUDENT PORTAL (${PORTAL_URL})
- Email: ${STUDENT.email}
- Temporary password: ${STUDENT.tempPassword} (please change it after your first login)
From the portal you can book lessons, view your schedule, and manage your tuition.

TUITION
You're on our quarterly plan: $635 per quarter, billed as 3 monthly payments of $211.67. Each payment adds 4 lesson credits, for 12 credits per quarter (one for each weekly lesson).

FIRST STEP: START YOUR PLAN
Log into the portal and click "Purchase Credits" to start your subscription. Your first payment adds 4 credits right away so you can book your first lesson.

SETTING UP FOR ONLINE LESSONS
I've attached a short setup guide (Online Lessons Setup) covering camera placement, audio tips, and how to join our Zoom sessions. Please take a look before our first lesson.

If you have any questions, just reply to this email. Looking forward to making music with you!

Warmly,
Lionel Yu
Lionel Yu Piano Studio
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
