import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getInquiryAdmin } from '@/lib/core/inquiries'
import { getInquiries } from '@/app/actions/inquiries'
import { InquiriesTab } from '@/components/admin/inquiries-tab'
import { Button } from '@/components/ui/button'

export default async function InquiriesPage() {
    const auth = await getInquiryAdmin(await createClient())
    if (auth.error === 'Not authenticated') redirect('/login')
    if (auth.error) redirect('/student')

    const { inquiries, error } = await getInquiries()
    return (
        <main className="container mx-auto max-w-5xl px-4 py-8">
            <Button variant="outline" asChild className="mb-8">
                <Link href="/admin"><ArrowLeft className="mr-2 h-4 w-4" />Back to Dashboard</Link>
            </Button>
            <InquiriesTab inquiries={inquiries} error={error} />
        </main>
    )
}
