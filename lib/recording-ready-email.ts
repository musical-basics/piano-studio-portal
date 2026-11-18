import { Resend } from 'resend'
import RecordingReadyEmail from '@/components/emails/recording-ready-email'
import { resolveNotificationEmail } from '@/lib/notification-email'
import type { DbClient } from '@/lib/supabase/admin'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

/**
 * Email a student that a lesson recording is on their dashboard. Never throws:
 * a mailer hiccup must not fail the attach that called it.
 */
export async function notifyRecordingReady(
    supabase: DbClient,
    studentId: string,
    lessonDate: string | null
): Promise<void> {
    try {
        if (!resend) return

        const { data: student } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', studentId)
            .single()

        const studentEmail = resolveNotificationEmail(student)
        if (!studentEmail) {
            console.log(`[RecordingReady] Student ${studentId} has no email; skipping notification.`)
            return
        }

        const { data: admin } = await supabase
            .from('profiles')
            .select('studio_name, email')
            .eq('role', 'admin')
            .limit(1)
            .single()

        const studioName = (admin?.studio_name as string) || 'Lionel Yu Piano Studio'
        const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://lessons.musicalbasics.com'}/student`

        const formattedDate = lessonDate
            ? new Date(`${lessonDate}T12:00:00Z`).toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                  timeZone: 'UTC',
              })
            : undefined

        const { error: emailError } = await resend.emails.send({
            from: `${studioName} <notifications@updates.musicalbasics.com>`,
            to: studentEmail,
            ...(admin?.email ? { replyTo: admin.email as string } : {}),
            subject: 'Your lesson recording is ready 🎹',
            react: RecordingReadyEmail({
                studentName: (student.name as string) || 'Student',
                lessonDate: formattedDate,
                dashboardUrl,
                studioName,
            }),
        })

        if (emailError) {
            console.error('[RecordingReady] Email failed:', emailError)
        } else {
            console.log(`[RecordingReady] Email sent for student ${studentId}`)
        }
    } catch (err) {
        console.error('[RecordingReady] Notification error (non-blocking):', err)
    }
}
