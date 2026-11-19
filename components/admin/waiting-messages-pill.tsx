"use client"

import { MessageCircle } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { WaitingThread } from "@/lib/waiting-messages"

function waited(at: string): string {
    const min = Math.max(0, Math.round((Date.now() - Date.parse(at)) / 60000))
    if (min < 60) return `${min} min`
    const h = Math.round(min / 60)
    if (h < 48) return `${h} h`
    return `${Math.round(h / 24)} days`
}

/**
 * #990: "N messages waiting" next to the red unlogged pill: family threads where
 * the family wrote last (lib/waiting-messages.ts). Each opens that family's chat.
 */
export function WaitingMessagesPill({ threads, onOpen }: { threads: WaitingThread[]; onOpen: (studentId: string) => void }) {
    if (threads.length === 0) return null
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-600 dark:bg-amber-600"
                    title="Family messages still waiting for your reply"
                >
                    <MessageCircle className="h-3 w-3" />
                    {threads.length} {threads.length === 1 ? "message" : "messages"} waiting
                </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 p-2">
                <p className="px-2 pb-1 text-xs text-muted-foreground">Families who wrote last, oldest first</p>
                <ul>
                    {threads.map(t => (
                        <li key={t.studentId}>
                            <button
                                type="button"
                                className="w-full rounded-md px-2 py-1.5 text-left hover:bg-muted"
                                onClick={() => onOpen(t.studentId)}
                            >
                                <span className="flex items-center justify-between gap-2 text-sm font-medium">
                                    <span className="truncate">{t.name}</span>
                                    <span className="shrink-0 text-xs font-normal text-muted-foreground">{waited(t.at)}</span>
                                </span>
                                {t.preview && <span className="block truncate text-xs text-muted-foreground">{t.preview}</span>}
                            </button>
                        </li>
                    ))}
                </ul>
            </PopoverContent>
        </Popover>
    )
}
