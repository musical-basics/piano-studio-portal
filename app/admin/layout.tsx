import type React from "react"
import { Toaster } from "@/components/ui/toaster"

// One toaster for every admin page and tab (#787). It used to live inside the
// Inquiries tab, and Radix tabs unmount the tabs you are not on, so the result
// of Cancel, Log, No-Show and every other admin action only showed up while
// Inquiries was open.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            {children}
            <Toaster />
        </>
    )
}
