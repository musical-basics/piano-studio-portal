import type { Metadata } from "next"
import Link from "next/link"
import { Music, ArrowLeft, MessageSquare } from "lucide-react"

// Public page describing the studio's text messages: who gets them, how a
// family signs up, the exact consent wording, STOP/HELP, and the privacy
// promise. Carriers review this page when the texting number is registered
// (Twilio A2P 10DLC), so keep it public and keep the consent wording below in
// step with the checkbox in components/student/settings-form.tsx.

export const metadata: Metadata = {
    title: "Text Messages | Lionel Yu Piano Studio",
    description: "How Lionel Yu Piano Studio texts families, how to sign up, and how your number is kept private.",
}

const CONSENT_TEXT =
    "Yes, text me messages from Lionel Yu Piano Studio about my lessons at this number. Message frequency varies. Message and data rates may apply. Reply STOP to stop at any time, or HELP for help."

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="space-y-3">
            <h2 className="font-serif text-2xl font-bold">{title}</h2>
            <div className="space-y-3 text-gray-600 leading-relaxed">{children}</div>
        </section>
    )
}

/** A still picture of the sign-up card in the portal's Settings page. */
function OptInPreview() {
    return (
        <figure className="space-y-2">
            <div aria-hidden className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4 max-w-md">
                <div className="space-y-1">
                    <p className="flex items-center gap-2 font-semibold text-gray-950">
                        <MessageSquare className="h-5 w-5" />
                        Text messages
                    </p>
                    <p className="text-sm text-gray-500">
                        Get Lionel&apos;s messages by text as well as email, and answer them by replying to the text.
                    </p>
                </div>
                <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-950">Mobile number</p>
                    <div className="h-9 rounded-md border border-gray-200 px-3 flex items-center text-sm text-gray-400">
                        (604) 555-1234
                    </div>
                </div>
                <div className="flex items-start gap-3 rounded-md border border-gray-200 bg-gray-50 p-3">
                    <div className="mt-0.5 h-4 w-4 shrink-0 rounded-[4px] border border-gray-400 bg-white" />
                    <p className="text-xs leading-relaxed text-gray-500">{CONSENT_TEXT}</p>
                </div>
                <div className="inline-flex h-9 items-center rounded-md bg-gray-950 px-4 text-sm font-medium text-white">
                    Save
                </div>
            </div>
            <figcaption className="text-sm text-gray-500">
                The sign-up box in the student portal (Settings, Text messages). The box starts unticked.
            </figcaption>
        </figure>
    )
}

export default function TextingPage() {
    return (
        <div className="bg-white text-gray-950 font-sans antialiased">
            <nav className="fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-b border-gray-100 z-50">
                <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-2">
                        <Music className="h-6 w-6" />
                        <span className="font-serif text-xl font-bold">Lionel Yu Piano Studio</span>
                    </Link>
                    <Link
                        href="/login"
                        className="px-4 py-2 border border-gray-200 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
                    >
                        Student Login
                    </Link>
                </div>
            </nav>

            <div className="h-16" />

            <section className="py-16 lg:py-24">
                <div className="max-w-3xl mx-auto px-4">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-black transition-colors mb-8"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to home
                    </Link>

                    <div className="space-y-4 mb-12">
                        <h1 className="font-serif text-4xl lg:text-5xl font-bold">Text Messages</h1>
                        <p className="text-lg text-gray-500">
                            How Lionel Yu Piano Studio texts students and parents, how to sign up or stop, and how your
                            number is kept private.
                        </p>
                        <div className="h-1 w-20 bg-black" />
                    </div>

                    <div className="space-y-12">
                        <Section title="What we text">
                            <p>
                                Lionel Yu Piano Studio is run by MusicalBasics Productions LLC. When Lionel sends you a
                                message in the student portal (scheduling, lesson changes, lesson notes, or an answer to
                                your question), you can also get it as a text from the studio number. You can answer by
                                replying to the text, and your reply goes to Lionel in the portal.
                            </p>
                            <p>
                                These texts are only for students and parents enrolled in the studio, and only about
                                lessons. We never send advertising or marketing texts.
                            </p>
                        </Section>

                        <Section title="How to sign up">
                            <p>
                                Texts are off until you turn them on. Signing up is optional: lessons, the portal, and
                                email work the same without it.
                            </p>
                            <ol className="list-decimal pl-6 space-y-1">
                                <li>Log in to the student portal and open Settings.</li>
                                <li>Under Text messages, enter your mobile number.</li>
                                <li>Tick the box agreeing to receive texts, then press Save.</li>
                            </ol>
                            <p>
                                If you ask Lionel to text you, he can turn texts on for the number you give him. Either
                                way, the first text tells you how to reply and how to stop.
                            </p>
                            <p>The box says:</p>
                            <blockquote className="border-l-4 border-gray-200 pl-4 italic">{CONSENT_TEXT}</blockquote>
                            <OptInPreview />
                        </Section>

                        <Section title="How often">
                            <p>
                                Message frequency varies: you get a text each time Lionel sends you a message in the
                                portal. Message and data rates may apply, depending on your mobile plan.
                            </p>
                        </Section>

                        <Section title="Stopping and help">
                            <p>
                                Reply <strong>STOP</strong> to any text to stop texts right away; you&apos;ll get one
                                last text confirming it. Reply <strong>START</strong> to turn them back on. You can also
                                untick the box in Settings at any time.
                            </p>
                            <p>
                                Reply <strong>HELP</strong> for help, or email{" "}
                                <a href="mailto:support@musicalbasics.com" className="underline">
                                    support@musicalbasics.com
                                </a>
                                .
                            </p>
                            <p>Mobile carriers are not liable for delayed or undelivered messages.</p>
                        </Section>

                        <Section title="Privacy">
                            <p>
                                We use your mobile number only to text you about your lessons and to match your replies
                                to your account. We do not sell, rent, or share your mobile number with anyone for
                                marketing or promotional purposes.
                            </p>
                            <p>
                                Text messaging opt-in data and consent will not be shared with any third parties. Texts
                                are delivered through our messaging provider, Twilio, which handles your number only to
                                deliver them.
                            </p>
                            <p>
                                To have your number removed, untick the box in Settings, reply STOP, or email{" "}
                                <a href="mailto:support@musicalbasics.com" className="underline">
                                    support@musicalbasics.com
                                </a>
                                .
                            </p>
                        </Section>
                    </div>
                </div>
            </section>
        </div>
    )
}
