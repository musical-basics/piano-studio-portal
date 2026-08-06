import { getRecitalRsvpContext } from '@/app/actions/recital-rsvp'
import { RecitalRsvpForm } from '@/components/recital/recital-rsvp-form'
import { createAdminClient } from '@/lib/supabase/admin'
import { Music } from 'lucide-react'

export const dynamic = 'force-dynamic'

// Public token-based RSVP page, reached from the recital email CTAs:
//   /recital/[eventId]/[publicId]?a=yes|no&src=em
// No login required: the publicId identifies the family (same token as
// classroom links). All writes go through the recital-rsvp server action.
// src=em marks arrival from an email link and is logged as a click (URL-param
// tracking, no redirect wrapping).
export default async function RecitalRsvpPage({
    params,
    searchParams,
}: {
    params: Promise<{ eventId: string; publicId: string }>
    searchParams: Promise<{ a?: string; src?: string }>
}) {
    const { eventId, publicId } = await params
    const { a, src } = await searchParams
    const context = await getRecitalRsvpContext(eventId, publicId)

    if (src === 'em' && !('error' in context)) {
        try {
            const supabase = createAdminClient()
            const { data: profile } = await supabase
                .from('profiles').select('id').eq('public_id', publicId).maybeSingle()
            if (profile) {
                await supabase.from('recital_email_events').insert({
                    event_id: eventId,
                    student_id: profile.id,
                    kind: 'click',
                    detail: a === 'no' ? 'not able to make it' : 'i can attend',
                })
            }
        } catch (e) {
            console.error('recital click logging failed (non-blocking):', e)
        }
    }

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <div className="w-full max-w-lg">
                <div className="flex items-center justify-center gap-3 mb-6">
                    <div className="h-10 w-10 bg-primary rounded-full flex items-center justify-center">
                        <Music className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <h1 className="text-xl font-serif font-semibold">Lionel Yu Piano Studio</h1>
                </div>
                {'error' in context ? (
                    <div className="bg-card border rounded-lg p-8 text-center text-muted-foreground">
                        This RSVP link is not valid. Please reply to the invitation email instead.
                    </div>
                ) : (
                    <RecitalRsvpForm
                        eventId={eventId}
                        publicId={publicId}
                        eventTitle={context.event.title}
                        eventStartTime={context.event.start_time}
                        defaultName={context.student.name}
                        defaultEmail={context.student.email}
                        initialAttending={a !== 'no'}
                        existingStatus={context.existingStatus}
                    />
                )}
            </div>
        </div>
    )
}
