import Link from "next/link"
import { Music, ArrowLeft } from "lucide-react"
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion"

type FaqItem = {
    question: string
    answer: React.ReactNode
}

type FaqGroup = {
    title: string
    items: FaqItem[]
}

const FAQ_GROUPS: FaqGroup[] = [
    {
        title: "How the Studio Works",
        items: [
            {
                question: "How long is a quarter?",
                answer: (
                    <>
                        <p>Each quarter is <strong>3 months</strong>, with <strong>12 lesson credits</strong> included. There are four quarters per year:</p>
                        <ul>
                            <li><strong>Spring</strong>: March, April, May</li>
                            <li><strong>Summer</strong>: June, July, August</li>
                            <li><strong>Fall</strong>: September, October, November</li>
                            <li><strong>Winter</strong>: December, January, February</li>
                        </ul>
                    </>
                ),
            },
            {
                question: "How does the credit system work?",
                answer: (
                    <>
                        <p>When you enroll, you receive 12 credits. Each lesson uses one credit. Credits are valid for <strong>4 months total</strong> (your 3-month quarter plus a 1-month buffer). So if you don&apos;t use all 12 during the quarter, you can carry the unused credits into the following month.</p>
                        <p>There&apos;s no cap on rollover. If life gets busy and you only use 8 credits during your quarter, the remaining 4 can be used in the buffer month.</p>
                    </>
                ),
            },
            {
                question: "Why a buffer month?",
                answer: (
                    <p>Real life happens: illness, travel, work crunches. The buffer month means a missed lesson is never a wasted lesson. You don&apos;t need to fight the calendar to get your money&apos;s worth.</p>
                ),
            },
            {
                question: "When do quarters start?",
                answer: (
                    <p>Spring starts in March, Summer in June, Fall in September, Winter in December. Enrollment is open continuously, so the next quarter is always around the corner.</p>
                ),
            },
            {
                question: "How are lessons delivered?",
                answer: (
                    <p>Lessons are conducted live over Zoom. You&apos;ll need a piano or keyboard, a webcam-equipped device, and a reasonably quiet space. Acoustic and digital instruments both work fine.</p>
                ),
            },
            {
                question: "Do you teach beginners?",
                answer: (
                    <p>Yes, students at every level from absolute beginners to working professionals. The trial lesson is the best way to figure out where you fit.</p>
                ),
            },
            {
                question: "What ages do you teach?",
                answer: (
                    <p><strong>Students 12 and over.</strong> Currently focused on teen and adult learners.</p>
                ),
            },
        ],
    },
    {
        title: "What's Included in Tuition",
        items: [
            {
                question: "What does my quarterly tuition cover?",
                answer: (
                    <>
                        <p>Every quarter includes:</p>
                        <ul>
                            <li>12 private lesson credits (30, 45, or 60 minutes depending on your tier)</li>
                            <li>Recordings of every lesson, delivered to your student portal</li>
                            <li>Custom sheet music tailored to your goals and repertoire</li>
                            <li>Personalized practice exercises between lessons</li>
                            <li>Participation in two online recitals per year</li>
                            <li>Full access to my premium masterclass library (100+ lessons) while you&apos;re enrolled</li>
                        </ul>
                    </>
                ),
            },
            {
                question: "What does it not cover?",
                answer: (
                    <ul>
                        <li>Your instrument (you&apos;ll need a piano or keyboard at home)</li>
                        <li>Sheet music outside of what I create or assign for you</li>
                        <li>Any optional external festivals or competitions you choose to participate in</li>
                    </ul>
                ),
            },
        ],
    },
    {
        title: "Scheduling, Cancellations, and Makeups",
        items: [
            {
                question: "What if I need to miss a lesson?",
                answer: (
                    <p>The credit system handles it. If you can&apos;t make a scheduled lesson, the credit isn&apos;t used. You just book a different time during the quarter or buffer month. No &ldquo;24-hour notice&rdquo; rule, no missed-lesson penalty.</p>
                ),
            },
            {
                question: "What if I run out of time and don't use all my credits?",
                answer: (
                    <p>Unused credits roll into the buffer month (the month after your quarter ends). You can use them at any pace during that month. After the buffer expires, credits don&apos;t carry into the next quarter.</p>
                ),
            },
            {
                question: "Can I save credits for later?",
                answer: (
                    <p>Within the 4-month validity window, yes. Book lessons at whatever pace works for you. After 4 months, credits expire.</p>
                ),
            },
            {
                question: "What if you have to cancel a lesson?",
                answer: (
                    <p>If I cancel for any reason, your credit is refunded immediately. You can rebook in the same quarter, the buffer month, or, in rare cases where neither works, I&apos;ll credit it to your next quarter.</p>
                ),
            },
        ],
    },
    {
        title: "Payment and Refunds",
        items: [
            {
                question: "When do I pay?",
                answer: <p>Full quarterly tuition is paid at enrollment, before the first lesson.</p>,
            },
            {
                question: "What's your refund policy?",
                answer: (
                    <ul>
                        <li><strong>Before the quarter starts:</strong> Full refund, no questions asked.</li>
                        <li><strong>After your first lesson:</strong> No cash refunds. However, unused credits can be transferred to the following quarter at your request.</li>
                        <li><strong>Genuine emergencies</strong> (medical, relocation, etc.) are handled case-by-case. Reach out and we&apos;ll figure it out.</li>
                    </ul>
                ),
            },
            {
                question: "Can I take a quarter off?",
                answer: (
                    <p>Yes. There&apos;s no obligation to enroll consecutively. Note that masterclass library access pauses when you&apos;re not actively enrolled (or holding active credits in the buffer month).</p>
                ),
            },
        ],
    },
    {
        title: "Masterclass Library",
        items: [
            {
                question: "What is the masterclass library?",
                answer: (
                    <p>A library of 100+ premium lessons covering technique, repertoire, theory, performance, and practice strategy. It&apos;s normally a separate paid product, included with quarterly enrollment.</p>
                ),
            },
            {
                question: "How long do I keep access?",
                answer: (
                    <p>Access is included while you have active credits. When your credits expire (end of the buffer month), access pauses until you re-enroll for the next quarter.</p>
                ),
            },
            {
                question: "Can I download lessons to keep?",
                answer: (
                    <p>The masterclass library is <strong>streaming-only</strong>. Lessons stream from your student portal so the content stays protected and current.</p>
                ),
            },
        ],
    },
    {
        title: "Recitals and Performance",
        items: [
            {
                question: "What are the online recitals?",
                answer: (
                    <p>Twice a year, students submit a recorded performance of a piece they&apos;ve prepared. Performances are compiled into a recital event. You get to share your progress, hear what fellow students are working on, and gain real performance experience with a real deadline.</p>
                ),
            },
            {
                question: "Who's eligible to participate?",
                answer: (
                    <p><strong>Anyone who has taken lessons in the past year.</strong> Even if you&apos;re not actively enrolled in the quarter the recital takes place, if you&apos;ve been a student within the past 12 months, you&apos;re invited to perform.</p>
                ),
            },
            {
                question: "Is participation required?",
                answer: (
                    <p>Strongly encouraged, but not required. Performance is one of the most powerful learning accelerators we have, and the recital deadline is what turns half-finished pieces into finished ones. That said, if performance pressure isn&apos;t where you want to be right now, that&apos;s fine. Your enrollment doesn&apos;t depend on it.</p>
                ),
            },
            {
                question: "What about in-person performance?",
                answer: (
                    <p>Recitals are currently online-only. Many students also pursue in-person performance opportunities through outside organizations (local festivals, MTNA events, community recitals). Happy to advise on what&apos;s worth your time.</p>
                ),
            },
        ],
    },
    {
        title: "The Trial Lesson",
        items: [
            {
                question: "What happens in the free 15-minute trial?",
                answer: (
                    <p>A quick conversation about your goals, a short play-through if you already play, and a clear next step. The goal is to figure out together whether quarterly enrollment is the right fit. No pressure, no sales pitch.</p>
                ),
            },
            {
                question: "Is there a fee for the trial?",
                answer: <p>No. It&apos;s free.</p>,
            },
            {
                question: "What if I'm not ready to enroll after the trial?",
                answer: (
                    <p>That&apos;s fine. If you want to think about it, you can. If it&apos;s not a fit, I&apos;ll tell you honestly.</p>
                ),
            },
        ],
    },
    {
        title: "Lessons Themselves",
        items: [
            {
                question: "Can I bring my own repertoire?",
                answer: (
                    <p>Yes. Most students bring at least some pieces they&apos;re personally drawn to. I&apos;ll also assign or commission custom material to fill gaps in your technique or musicianship.</p>
                ),
            },
            {
                question: "How do I get my lesson recordings?",
                answer: (
                    <p>After each session, recordings are uploaded to your student portal. You&apos;ll have access to every recording from your active enrollment.</p>
                ),
            },
            {
                question: "Do you give homework?",
                answer: (
                    <p>Yes. Practice assignments and custom exercises tailored to what we worked on. The work between lessons is where the actual progress happens.</p>
                ),
            },
            {
                question: "How much should I be practicing?",
                answer: (
                    <>
                        <p>Progress lives between lessons. Plan to work on what we cover together at least <strong>5 days a week</strong>. For most students that means:</p>
                        <ul>
                            <li><strong>30 minutes a day</strong> for beginners</li>
                            <li><strong>45 minutes a day</strong> for intermediate students</li>
                            <li><strong>60+ minutes a day</strong> for advanced students</li>
                        </ul>
                        <p>Quality of focus matters more than duration. Five short, focused sessions beat one long, distracted one.</p>
                    </>
                ),
            },
        ],
    },
    {
        title: "Equipment",
        items: [
            {
                question: "What kind of piano do I need?",
                answer: (
                    <p>Either an acoustic piano or a digital piano with <strong>88 weighted keys</strong> is strongly preferred. A 61-key keyboard works for absolute beginners but you&apos;ll outgrow it within a quarter.</p>
                ),
            },
            {
                question: "What about my Zoom setup?",
                answer: (
                    <>
                        <p>At minimum:</p>
                        <ul>
                            <li>A device with a working camera and mic (laptop, tablet, or phone with a stand)</li>
                            <li>Camera positioned so I can see your hands and the keyboard</li>
                            <li>A pair of decent headphones to avoid feedback</li>
                        </ul>
                        <p>For students serious about audio quality, an external USB mic is a worthwhile upgrade. I can recommend specific models on request.</p>
                    </>
                ),
            },
        ],
    },
]

export const metadata = {
    title: "FAQs | Lionel Yu Piano Studio",
    description: "Everything about quarterly enrollment, scheduling, recitals, and the trial lesson.",
}

export default function FaqPage() {
    return (
        <div className="bg-white text-gray-950 font-sans antialiased">
            {/* Navigation */}
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
                        <h1 className="font-serif text-4xl lg:text-5xl font-bold">Frequently Asked Questions</h1>
                        <p className="text-lg text-gray-500">
                            Everything about how the studio works: quarterly enrollment, scheduling, recitals, and what to expect from the trial lesson.
                        </p>
                        <div className="h-1 w-20 bg-black" />
                    </div>

                    <div className="space-y-12">
                        {FAQ_GROUPS.map((group) => (
                            <div key={group.title} className="space-y-4">
                                <h2 className="font-serif text-2xl font-bold border-b border-gray-200 pb-2">
                                    {group.title}
                                </h2>
                                <Accordion type="multiple" className="w-full">
                                    {group.items.map((item, idx) => (
                                        <AccordionItem
                                            key={item.question}
                                            value={`${group.title}-${idx}`}
                                        >
                                            <AccordionTrigger className="text-base font-semibold">
                                                {item.question}
                                            </AccordionTrigger>
                                            <AccordionContent className="prose prose-sm max-w-none text-gray-700 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 [&_p]:mb-3 [&_p:last-child]:mb-0">
                                                {item.answer}
                                            </AccordionContent>
                                        </AccordionItem>
                                    ))}
                                </Accordion>
                            </div>
                        ))}
                    </div>

                    <div className="mt-16 rounded-xl bg-gray-50 border border-gray-200 p-8 text-center space-y-4">
                        <h3 className="font-serif text-2xl font-bold">Still have questions?</h3>
                        <p className="text-gray-600">
                            The free 15-minute trial is the best way to get them answered. Send a quick note and I&apos;ll personally reply within 48 hours.
                        </p>
                        <Link
                            href="/#trial"
                            className="inline-flex h-11 items-center justify-center rounded-md bg-black px-6 text-base font-medium text-white shadow hover:bg-gray-800 transition-colors"
                        >
                            Request a Free Trial
                        </Link>
                    </div>
                </div>
            </section>

            <footer className="border-t border-gray-100 bg-gray-50/50">
                <div className="max-w-7xl mx-auto px-4 py-8 text-center text-sm text-gray-500">
                    © {new Date().getFullYear()} Lionel Yu Piano Studio. All rights reserved.
                </div>
            </footer>
        </div>
    )
}
