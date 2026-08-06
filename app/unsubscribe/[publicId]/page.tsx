import { getUnsubscribeContext } from '@/app/actions/unsubscribe'
import { UnsubscribeForm } from '@/components/unsubscribe-form'
import { Music } from 'lucide-react'

export const dynamic = 'force-dynamic'

// Public token-based unsubscribe page for announcement emails.
export default async function UnsubscribePage({
    params,
}: {
    params: Promise<{ publicId: string }>
}) {
    const { publicId } = await params
    const context = await getUnsubscribeContext(publicId)

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="flex items-center justify-center gap-3 mb-6">
                    <div className="h-10 w-10 bg-primary rounded-full flex items-center justify-center">
                        <Music className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <h1 className="text-xl font-serif font-semibold">Lionel Yu Piano Studio</h1>
                </div>
                {'error' in context ? (
                    <div className="bg-card border rounded-lg p-8 text-center text-muted-foreground">
                        This link is not valid.
                    </div>
                ) : (
                    <UnsubscribeForm
                        publicId={publicId}
                        name={context.name}
                        initialOptedOut={context.optedOut}
                    />
                )}
            </div>
        </div>
    )
}
