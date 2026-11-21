import { cn } from "@/lib/utils"

/** The small "Classroom" / "Zoom" label of a lesson recording (the admin Recordings view, #1916). */
export function RecordingSourceLabel({ source, className }: { source: "classroom" | "zoom"; className?: string }) {
    return (
        <span
            className={cn(
                "inline-flex items-center rounded border px-1.5 py-px text-[11px] font-medium leading-4",
                source === "classroom"
                    ? "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-700 dark:bg-violet-950/50 dark:text-violet-300"
                    : "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
                className,
            )}
        >
            {source === "classroom" ? "Classroom" : "Zoom"}
        </span>
    )
}
