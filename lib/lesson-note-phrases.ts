/**
 * One-tap phrases under the lesson notes box (Lionel's #944), so a lesson can
 * be logged from a phone in seconds: on the email's Log it page
 * (app/api/lesson-action) and in the admin log dialogs. Change this list to
 * change them everywhere. Safe for the browser: no server imports.
 */
export const LESSON_NOTE_PHRASES: readonly string[] = [
    'Great job today!',
    'Keep counting',
    'Practice hands separately',
]

/**
 * Adds a phrase to the end of the notes, on its own line. Never replaces what
 * is there (only blank space is dropped). The Log it page's script does the
 * same in the browser.
 */
export function appendNotePhrase(notes: string, phrase: string): string {
    const base = notes.replace(/[ \t]+$/, '')
    if (!base.trim()) return phrase
    return base.endsWith('\n') ? `${base}${phrase}` : `${base}\n${phrase}`
}
