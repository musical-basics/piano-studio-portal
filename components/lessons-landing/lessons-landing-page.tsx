import { Fragment } from "react"
import Link from "next/link"
import { Jost } from "next/font/google"
import { STUDIO_TZ } from "@/lib/studio-timezone"
import { MIN_STUDENT_AGE } from "@/lib/studio-policy"
import { SiteHeader } from "./site-header"
import { SiteFooter } from "./site-footer"
import { WaitlistForm } from "./waitlist-form"
import "./lessons-landing.css"

/**
 * The public landing page of lessons.musicalbasics.com, ported on 2026-11-10
 * from the MusicalBasics site's /lessons page (link.musicalbasics.com/lessons,
 * whose content lives in the Shopify theme template page.lesson-page). This is
 * the studio's own copy, so it outlives the Shopify theme.
 *
 * Kept from the Shopify page: the header and footer, the banner photo, every
 * heading and paragraph, the four student quotes and the waitlist form.
 * Changed on purpose (each is on Lionel's board as a decision, brief #247):
 * - the "studio is full" notice names the current month instead of a stale one;
 * - Lesson Rates and the first-lesson offer are the portal's current ones
 *   (quarterly tuition, free 15-minute trial), not the page's old $60/$10;
 * - "Ready to Start" gets a button down to the form (the Shopify page had none);
 * - the form posts into the portal's Inquiries instead of Shopify's inbox.
 * The four sections switched off in the Shopify theme stay off.
 */

const jost = Jost({ subsets: ["latin"], variable: "--font-jost", display: "swap" })

/** Lionel's rolling "studio is full" note. Set to false to take it off the page. */
const SHOW_FULL_NOTICE = true

function currentMonth(): string {
    return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: STUDIO_TZ }).format(new Date())
}

const QUOTES = [
    {
        text: "I was using a piano app to learn. After a couple of months, I feel like a robot on an assembly line, losing motivation. Lionel helped me discover who I needed to be; an artist! He gave me directions and tools that would help me do just that.",
        by: "Bai V., United States",
    },
    {
        text: "Lionel is an excellent piano teacher! He always provides detailed feedback and recordings after each lesson, which help my kids review and practice effectively at home. The music sheets he prepares include clear counting instructions, making it easy for kids to follow and build good rhythm. My children started learning with Lionel when they were 8 and 9 years old, and they’ve already made great progress in their fundamental skills and posture. We’re very grateful for his patience, professionalism, and dedication!",
        by: "Xu Y., United States",
    },
    {
        text: "I have experience as a self-guided piano student, and finally decided to search for the right teacher to help me improve. I'm happy to have found Lionel, because not only did he teach me skills that I never saw in any other tutorials online, but he was also able to correct my posture and other issues that I would not have otherwise figured out without an actual teacher. I am lucky that he's my teacher and guiding me on my piano journey, and I highly recommended him as a talented and patient teacher for all levels! (also-If you are a self guided learner like I was, don't wait- he can correct things that will stall your progress later!)",
        by: "Padhma B., United States",
    },
    {
        text: "I feel very fortunate to learn from Lionel. He is not only extremely knowledgeable about improvisation but also incredibly patient and supportive throughout the lessons. His teaching style makes complex concepts clear and enjoyable, and I’ve gained so many skills under his guidance. Highly recommend.",
        by: "Jay W., Italy",
    },
]

function Section({
    pt,
    pb,
    align = "center",
    children,
}: {
    pt: number
    pb: number
    align?: "center" | "left"
    children: React.ReactNode
}) {
    return (
        <section className="mb-scheme-bg1 mb-section-pad" style={{ "--mb-pt": `${pt}px`, "--mb-pb": `${pb}px` } as React.CSSProperties}>
            <div className="mb-page-width">
                <div
                    className={`mx-auto flex max-w-[980px] flex-col gap-4 ${
                        align === "center" ? "text-center items-center" : "text-left items-start"
                    }`}
                >
                    {children}
                </div>
            </div>
        </section>
    )
}

export function LessonsLandingPage() {
    return (
        <div className={`${jost.variable} mb-site`}>
            <a
                href="#MainContent"
                className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:text-black"
            >
                Skip to content
            </a>
            <SiteHeader />

            <main id="MainContent" className="flex-1">
                <section className="mb-banner mb-banner--dim">
                    <div className="mb-banner__media">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/landing/piano-hands.jpg" alt="" />
                    </div>
                    {/* The second way into the portal, like the old landing's "Student Portal" button (briefs #275, #285). */}
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 px-6 text-center">
                        <p className="text-[14px] font-semibold uppercase tracking-[3px] text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.5)]">
                            Already a student?
                        </p>
                        <Link href="/login" className="mb-btn mb-btn--outline-light">
                            Student Portal
                        </Link>
                    </div>
                </section>

                {SHOW_FULL_NOTICE ? (
                    <Section pt={40} pb={28}>
                        <div className="mb-rte w-full">
                            <h2>
                                <strong>
                                    Important note: Lionel&apos;s studio is full for the remainder of {currentMonth()}. We will resume
                                    accepting new students at the beginning of next month. For now you can{" "}
                                    <a href="#waitlist">join the waitlist</a>.
                                </strong>
                            </h2>
                        </div>
                    </Section>
                ) : null}

                <Section pt={SHOW_FULL_NOTICE ? 20 : 40} pb={0}>
                    <div className="mb-rte w-full">
                        <h1>
                            <strong>Unlock Your Piano Potential: Online Lessons with Lionel Yu</strong>
                        </h1>
                        <p>
                            My lessons are designed to build a powerful classical foundation, whether you&apos;re a complete
                            beginner or a professional. I&apos;ll help you master the techniques and artistry to achieve your
                            personal piano goals.
                        </p>
                        <h2>
                            <strong>My Teaching Philosophy</strong>
                        </h2>
                        <p>
                            My teaching style is built on patience, commitment, and making music enjoyable. I believe the most
                            important lesson is discovering the music within yourself. I love the piano and dedicated my entire
                            life to it, and my goal is to help you find that same joy, whether you&apos;re just getting started
                            or have been playing for years.
                        </p>
                        <h3>
                            <strong>For Parents</strong>: I especially enjoy working with young students and partnering with
                            parents to foster a lifelong love for music in their children. For younger students, this means
                            creating a supportive, fun environment where they can build confidence and bring forth their inner
                            voice.
                        </h3>
                    </div>
                </Section>

                <Section pt={12} pb={12} align="left">
                    <div className="mb-rte w-full">
                        <h2>
                            <strong>What We&apos;ll Work On</strong>
                        </h2>
                        <h3>My lessons are tailored to your personal goals. We can focus on:</h3>
                        <ul>
                            <li>
                                <strong>Beginner Basics:</strong> Learn proper hand positions, finger placement, music theory,
                                and how to read music in a fun and natural way.
                            </li>
                            <li>
                                <strong>Young Beginners</strong>: Building foundational skills through engaging activities and
                                age-appropriate repertoire.
                            </li>
                            <li>
                                <strong>Classical Piano:</strong> Refine your technique and learn beautiful pieces from the great
                                composers, understanding the many layers of musicality and artistry in high-level classical
                                performance.
                            </li>
                            <li>
                                <strong>Improvisation &amp; Creativity:</strong> Break free from sheet music and learn to play by
                                ear, improvise, and compose your own music. Bring forth the music inside of you.
                            </li>
                            <li>
                                <strong>Professional Coaching:</strong> For aspiring professionals/serious amateurs, I offer
                                coaching on content creation, branding, and navigating the music business.
                            </li>
                        </ul>
                        <h2>
                            <strong>Lesson Rates</strong>
                        </h2>
                        <ul>
                            <li>
                                <strong>30-Minute Weekly Lessons:</strong> $635 per quarter (12 lessons)
                            </li>
                            <li>
                                <strong>45-Minute Weekly Lessons:</strong> $935 per quarter (12 lessons)
                            </li>
                            <li>
                                <strong>60-Minute Weekly Lessons:</strong> $1,135 per quarter (12 lessons)
                            </li>
                            <li>
                                <strong>Trial Lesson (15 Mins):</strong> Free
                            </li>
                            <li>
                                <strong>Ages:</strong> {MIN_STUDENT_AGE} and up
                            </li>
                            <li>
                                Every quarter includes lesson recordings, custom sheet music &amp; exercises, online recital
                                participation, and masterclass library access while enrolled.
                            </li>
                            <li>All lessons are conducted one-on-one, with a dedicated weekly time slot to ensure consistent progress.</li>
                            <li>All lessons are conducted via Zoom, with the meeting link being shared via email.</li>
                        </ul>
                    </div>
                </Section>

                <Section pt={16} pb={28}>
                    <h2 className="mb-h1">
                        <strong>What My Students Say</strong>
                    </h2>
                    <div className="mb-rte w-full">
                        {QUOTES.map((q) => (
                            <Fragment key={q.by}>
                                <p>&ldquo;{q.text}&rdquo;</p>
                                <p>
                                    <strong>{q.by}</strong>
                                </p>
                            </Fragment>
                        ))}
                        <h2>
                            <Link href="/reviews">
                                <strong>View More of My Student&apos;s Reviews</strong>
                            </Link>
                        </h2>
                    </div>
                </Section>

                <section className="mb-section-pad" style={{ "--mb-pt": "0px", "--mb-pb": "0px" } as React.CSSProperties}>
                    <div className="mb-page-width">
                        <div className="grid grid-cols-1 overflow-hidden rounded-[6px] md:grid-cols-2">
                            <div className="relative min-h-[300px]">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src="/landing/lionel-portrait.jpg" alt="Lionel Yu" className="absolute inset-0 h-full w-full object-cover" />
                            </div>
                            <div className="mb-scheme-bg1 flex flex-col items-start justify-center gap-4 p-8 text-left md:p-14">
                                <h2 className="mb-h1">Ready to Start Your Musical Journey?</h2>
                                <div className="mb-rte">
                                    <p>
                                        <strong>
                                            Whether you are an adult student ready to start your own journey, or a parent looking
                                            for the right mentor for your child,
                                        </strong>{" "}
                                        the first step is a free 15-minute trial lesson for us to meet so I can hear you play.
                                        I&apos;d love to hear about your musical goals. Send me a message today to get started!
                                    </p>
                                </div>
                                <a href="#waitlist" className="mb-btn mt-2">
                                    Send me a message
                                </a>
                            </div>
                        </div>
                    </div>
                </section>

                <section
                    id="waitlist"
                    className="mb-scheme-bg1 mb-section-pad scroll-mt-28"
                    style={{ "--mb-pt": "20px", "--mb-pb": "36px" } as React.CSSProperties}
                >
                    <div className="mb-page-width mb-page-width--narrow">
                        <h2 className="mb-h1 mb-8 text-center">Join the waitlist</h2>
                        <WaitlistForm />
                    </div>
                </section>
            </main>

            <SiteFooter />
        </div>
    )
}
