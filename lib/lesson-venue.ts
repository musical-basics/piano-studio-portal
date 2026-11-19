/**
 * Where a student's lessons happen (Lionel's #980): profiles.lesson_venue,
 * 'zoom' (the default) or 'classroom', set with the switch in Edit Student.
 *
 * Every lesson still carries a Zoom link (Zoom meetings are created as before),
 * so the link alone cannot say where a lesson is. For a classroom student the
 * family is given the classroom link instead of Zoom: reminders, the lesson
 * scheduled email, the portal's join button. The studio's 9pm and morning
 * emails label those lessons "classroom".
 *
 * The classroom link needs the student's public_id. A student set to classroom
 * without one is treated as Zoom, so a family is never left with no link.
 *
 * Safe for the browser: no server imports.
 */

export type LessonVenue = 'zoom' | 'classroom'

export const CLASSROOM_BASE_URL = process.env.NEXT_PUBLIC_CLASSROOM_URL || 'https://classroom.musicalbasics.com'

type VenueProfile = { lesson_venue?: string | null; public_id?: string | null } | null | undefined

/** "https://classroom.musicalbasics.com/<public_id>", or null without a public_id. */
export function classroomLinkFor(publicId: string | null | undefined): string | null {
    const id = (publicId ?? '').trim()
    return id ? `${CLASSROOM_BASE_URL}/${id}` : null
}

/** What the switch says, whatever the link situation. */
export function savedVenue(profile: VenueProfile): LessonVenue {
    return profile?.lesson_venue === 'classroom' ? 'classroom' : 'zoom'
}

/** Where the family is sent: classroom only when set AND a classroom link can be made. */
export function lessonVenue(profile: VenueProfile): LessonVenue {
    return savedVenue(profile) === 'classroom' && classroomLinkFor(profile?.public_id) ? 'classroom' : 'zoom'
}

/**
 * The links a family's lesson emails show. A classroom student gets the
 * classroom link and no Zoom link; anyone else gets the Zoom link as before,
 * plus the classroom link as a backup when they have a public_id.
 */
export function familyLessonLinks(
    profile: VenueProfile,
    zoomLink: string | null | undefined,
): { venue: LessonVenue; zoomLink: string | null; classroomLink: string | null } {
    const classroomLink = classroomLinkFor(profile?.public_id)
    if (lessonVenue(profile) === 'classroom') return { venue: 'classroom', zoomLink: null, classroomLink }
    return { venue: 'zoom', zoomLink: zoomLink || null, classroomLink }
}
