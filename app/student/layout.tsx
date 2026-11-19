import type React from "react"
import { Toaster } from "@/components/ui/toaster"

// One toaster for the student pages. Without it every toast in the student
// portal (cancel results, settings errors, practice upload results #875) was
// silently dropped, the same gap #787 fixed for admin.
export default function StudentLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            {children}
            <Toaster />
        </>
    )
}
