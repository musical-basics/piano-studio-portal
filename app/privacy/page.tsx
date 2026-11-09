import type { Metadata } from "next"
import Link from "next/link"
import { PublicPageShell, PublicSection } from "@/components/public-page-shell"

// The studio portal's privacy policy. Carriers check it when the texting
// number is registered (Twilio A2P 10DLC): it must mention text messages and
// say that mobile numbers and text opt-in data are never shared for marketing.
// Keep the service list in step with what the portal actually uses.

export const metadata: Metadata = {
    title: "Privacy Policy | Lionel Yu Piano Studio",
    description: "What Lionel Yu Piano Studio collects, how it is used, and how text message consent is kept private.",
}

const EFFECTIVE = "November 9, 2026"

const mail = (
    <a href="mailto:support@musicalbasics.com" className="underline">
        support@musicalbasics.com
    </a>
)

export default function PrivacyPage() {
    return (
        <PublicPageShell
            title="Privacy Policy"
            intro={
                <p>
                    How Lionel Yu Piano Studio handles the information of its students and parents. Effective {EFFECTIVE}.
                </p>
            }
        >
            <PublicSection title="Who we are">
                <p>
                    Lionel Yu Piano Studio is run by MusicalBasics Productions LLC. This policy covers the student portal
                    at lessons.musicalbasics.com and the emails and text messages the studio sends. Questions go to{" "}
                    {mail}.
                </p>
            </PublicSection>

            <PublicSection title="What we collect">
                <ul className="list-disc pl-6 space-y-1">
                    <li>Account details: student and parent names, email address, phone number, and time zone.</li>
                    <li>
                        Lessons: your schedule, attendance, lesson notes, messages with Lionel, files you share, and
                        recordings of online lessons.
                    </li>
                    <li>
                        Billing: what you bought and your lesson balance. Card details are entered with Stripe and never
                        stored by the studio.
                    </li>
                    <li>Text messages: your mobile number and your consent, if you sign up for texts.</li>
                    <li>Inquiries: what you send through the contact form.</li>
                    <li>Basic, anonymous page-view statistics about how the portal is used.</li>
                </ul>
            </PublicSection>

            <PublicSection title="How we use it">
                <p>
                    Only to run your lessons: scheduling, teaching, lesson reminders and messages, payments, answering
                    your questions, and keeping records of lessons and credits. We do not sell your information, and we do
                    not use it for advertising.
                </p>
            </PublicSection>

            <PublicSection title="Who we share it with">
                <p>
                    We share information only with the services that run the studio, and only so they can provide that
                    service: Supabase (database and sign-in), Vercel (hosting), Stripe (payments), Zoom (online lessons),
                    Dropbox (lesson recordings), Google Calendar (Lionel&apos;s schedule), Resend (email), and Twilio
                    (text messages). We may also disclose information when the law requires it.
                </p>
            </PublicSection>

            <PublicSection title="Text messages">
                <p>
                    If you sign up for texts, we use your mobile number only to text you about your lessons and to match
                    your replies to your account. Message frequency varies, and message and data rates may apply. Reply
                    STOP to stop or HELP for help. The full terms are on the{" "}
                    <Link href="/texting" className="underline">
                        text messages page
                    </Link>
                    .
                </p>
                <p className="font-medium text-gray-950">
                    No mobile information will be shared with third parties or affiliates for marketing or promotional
                    purposes. Text messaging originator opt-in data and consent will not be shared with any third
                    parties.
                </p>
                <p>
                    All of the sharing described above excludes text messaging opt-in data and consent; that information
                    is never shared with any third party. Twilio receives your number only to deliver the texts.
                </p>
            </PublicSection>

            <PublicSection title="Children">
                <p>
                    Many of our students are children. A parent or guardian enrolls them, and we collect only what is
                    needed to teach and schedule their lessons.
                </p>
            </PublicSection>

            <PublicSection title="Keeping and deleting your information">
                <p>
                    We keep your information while you take lessons, and billing records as long as the law requires.
                    To get a copy of your information, correct it, or have it deleted, email {mail}.
                </p>
            </PublicSection>

            <PublicSection title="Changes">
                <p>If this policy changes, we will update this page and its effective date.</p>
            </PublicSection>
        </PublicPageShell>
    )
}
