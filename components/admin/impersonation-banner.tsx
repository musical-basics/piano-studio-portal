'use client'

import { stopImpersonating } from '@/app/actions/impersonate'
import { useTransition } from 'react'
import { Eye, X, ArrowLeft } from 'lucide-react'

export function ImpersonationBanner({ studentName }: { studentName: string }) {
    const [isPending, startTransition] = useTransition()

    const handleExit = () => {
        startTransition(async () => {
            await stopImpersonating()
        })
    }

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 bg-amber-500 text-amber-950 shadow-2xl border-t-2 border-amber-600">
            <div className="flex items-center gap-2.5 text-sm font-semibold">
                <Eye className="h-4 w-4 shrink-0" />
                <span>
                    Admin Preview — viewing as{' '}
                    <span className="underline underline-offset-2">{studentName}</span>
                </span>
                <span className="text-amber-700 font-normal hidden sm:inline">
                    · Actions like cancel/confirm are live — be careful
                </span>
            </div>

            <button
                onClick={handleExit}
                disabled={isPending}
                className="flex items-center gap-1.5 text-sm font-semibold bg-amber-950/15 hover:bg-amber-950/25 transition-colors rounded-md px-3 py-1.5 disabled:opacity-60"
            >
                {isPending ? (
                    <span className="animate-pulse">Exiting…</span>
                ) : (
                    <>
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Exit Preview
                    </>
                )}
            </button>
        </div>
    )
}
