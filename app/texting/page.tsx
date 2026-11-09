import type { Metadata } from "next"
import Link from "next/link"
import { MessageSquare } from "lucide-react"
import { PublicPageShell, PublicSection } from "@/components/public-page-shell"

// Public page for the studio's text messages: who gets them, the sign-up box
// with its exact consent wording (shown unticked, live and as a screenshot of
// the portal), frequency, STOP/HELP, and the privacy promise. Carriers review
// it when the texting number is registered (Twilio A2P 10DLC), so it must stay
// public. Keep CONSENT_TEXT in step with the checkbox in
// components/student/settings-form.tsx, and retake public/sms-opt-in.png if
// that card changes.

export const metadata: Metadata = {
    title: "Text Message Terms | Lionel Yu Piano Studio",
    description: "How Lionel Yu Piano Studio texts families, how to sign up, how to stop, and how your number is kept private.",
}

const CONSENT_TEXT =
    "Yes, text me messages from Lionel Yu Piano Studio about my lessons at this number. Message frequency varies. Message and data rates may apply. Reply STOP to stop at any time, or HELP for help."

/** The sign-up box as it appears in the portal, with a real, unticked checkbox. Saving happens in the portal. */
function OptInExample() {
    return (
        <form className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4 max-w-md">
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
                <label htmlFor="example-sms-phone" className="block text-sm font-medium text-gray-950">
                    Mobile number
                </label>
                <input
                    id="example-sms-phone"
                    type="tel"
                    placeholder="(604) 555-1234"
                    className="h-9 w-full rounded-md border border-gray-200 px-3 text-sm"
                />
            </div>
            <div className="flex items-start gap-3 rounded-md border border-gray-200 bg-gray-50 p-3">
                <input
                    id="example-sms-consent"
                    type="checkbox"
                    name="smsConsent"
                    className="mt-0.5 h-4 w-4 shrink-0 accent-gray-950"
                />
                <label htmlFor="example-sms-consent" className="text-xs leading-relaxed text-gray-500">
                    {CONSENT_TEXT}{" "}
                    <Link href="/texting" className="underline">
                        Texting terms
                    </Link>{" "}
                    and{" "}
                    <Link href="/privacy" className="underline">
                        privacy policy
                    </Link>
                    .
                </label>
            </div>
            <Link
                href="/login"
                className="inline-flex h-9 items-center rounded-md bg-gray-950 px-4 text-sm font-medium text-white"
            >
                Log in to save
            </Link>
        </form>
    )
}

export default function TextingPage() {
    return (
        <PublicPageShell
            title="Text Message Terms"
            intro={
                <p>
                    How Lionel Yu Piano Studio texts students and parents, how to sign up or stop, and how your number is
                    kept private.
                </p>
            }
        >
            <PublicSection title="What we text">
                <p>
                    Lionel Yu Piano Studio is run by MusicalBasics Productions LLC. When Lionel sends you a message in the
                    student portal (scheduling, lesson changes, lesson notes, or an answer to your question), you can also
                    get it as a text from the studio number, (240) 363-1689. You can answer by replying to the text, and
                    your reply goes to Lionel in the portal.
                </p>
                <p>
                    These texts are only for students and parents enrolled in the studio, and only about lessons. We never
                    send advertising or marketing texts.
                </p>
            </PublicSection>

            <PublicSection title="How to sign up">
                <p>
                    Texts are off until you turn them on, and signing up is optional: lessons, the portal, and email work
                    the same without it. You sign up in the student portal:
                </p>
                <ol className="list-decimal pl-6 space-y-1">
                    <li>Log in to the student portal at lessons.musicalbasics.com and open Settings.</li>
                    <li>Under Text messages, enter your mobile number.</li>
                    <li>Tick the box agreeing to receive texts (it starts unticked), then press Save.</li>
                </ol>
                <p>The box looks like this:</p>
                <OptInExample />
                <p>And this is the same box inside the portal&apos;s Settings page:</p>
                <figure className="space-y-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src="/sms-opt-in.png"
                        alt="The Text messages box in the student portal's Settings page: a mobile number field, an unticked consent checkbox with the wording above, and a Save button."
                        className="w-full max-w-md rounded-xl border border-gray-200"
                    />
                    <figcaption className="text-sm text-gray-500">
                        Screenshot of the student portal, Settings, Text messages. The consent box starts unticked.
                    </figcaption>
                </figure>
                <p>
                    Your first text confirms you signed up and tells you how to reply, how to get help, and how to stop.
                </p>
            </PublicSection>

            <PublicSection title="How often">
                <p>
                    Message frequency varies: you get a text each time Lionel sends you a message in the portal. Message
                    and data rates may apply, depending on your mobile plan.
                </p>
            </PublicSection>

            <PublicSection title="Stopping and help">
                <p>
                    Reply <strong>STOP</strong> to any text to stop texts right away; you&apos;ll get one last text
                    confirming it. Reply <strong>START</strong> to turn them back on. You can also untick the box in
                    Settings at any time.
                </p>
                <p>
                    Reply <strong>HELP</strong> for help, or email{" "}
                    <a href="mailto:support@musicalbasics.com" className="underline">
                        support@musicalbasics.com
                    </a>
                    .
                </p>
                <p>Mobile carriers are not liable for delayed or undelivered messages.</p>
            </PublicSection>

            <PublicSection title="Privacy">
                <p>
                    We use your mobile number only to text you about your lessons and to match your replies to your
                    account. No mobile information will be shared with third parties or affiliates for marketing or
                    promotional purposes. Text messaging originator opt-in data and consent will not be shared with any
                    third parties. Texts are delivered through our messaging provider, Twilio, which receives your number
                    only to deliver them.
                </p>
                <p>
                    The studio&apos;s full{" "}
                    <Link href="/privacy" className="underline">
                        privacy policy
                    </Link>{" "}
                    covers everything else. To have your number removed, untick the box in Settings, reply STOP, or email{" "}
                    <a href="mailto:support@musicalbasics.com" className="underline">
                        support@musicalbasics.com
                    </a>
                    .
                </p>
            </PublicSection>
        </PublicPageShell>
    )
}
