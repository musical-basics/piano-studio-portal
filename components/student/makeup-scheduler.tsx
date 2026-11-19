"use client"

import { MoveRequestDialog } from "./move-request"

interface MakeupSchedulerProps {
    /** The family's lesson to move; null keeps the picker closed. */
    lessonId: string | null
    onClose: () => void
    /** An admin previewing this student: the times show, moving is off. */
    isPreview?: boolean
}

/**
 * The family make-up picker (#927): pick one of the teacher's free times in the
 * next two weeks and the lesson moves right away, the usual reschedule (Zoom,
 * calendar, the usual "Lesson Rescheduled" email). Shown only while
 * FAMILY_MAKEUP_PICKER_ON (lib/studio-policy.ts). Same dialog and slot finder as
 * "Request a different time" (#878).
 */
export function MakeupScheduler({ lessonId, onClose, isPreview = false }: MakeupSchedulerProps) {
    return <MoveRequestDialog kind="makeup" lessonId={lessonId} onClose={onClose} isPreview={isPreview} />
}
