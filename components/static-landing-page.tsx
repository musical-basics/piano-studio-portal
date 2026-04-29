import Link from "next/link"
import { Music, Repeat, Sparkles, Users, Facebook, Instagram, Mail } from "lucide-react"
import { TrialInquiryForm } from "@/components/trial-inquiry-form"
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion"
import { getApprovedReviews } from "@/app/actions/reviews"

const formatReviewDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })

const renderStars = (rating: number) => {
    const filled = Math.max(0, Math.min(5, rating))
    return "★".repeat(filled) + "☆".repeat(5 - filled)
}

const PRICING_TIERS = [
    { duration: "30 minutes", price: "$635", note: "per quarter" },
    { duration: "45 minutes", price: "$935", note: "per quarter", featured: true },
    { duration: "60 minutes", price: "$1,135", note: "per quarter" },
]

const HOMEPAGE_FAQS = [
    {
        q: "How long is a quarter?",
        a: "Each quarter is 3 months with 12 lesson credits included. Spring (Mar–May), Summer (Jun–Aug), Fall (Sep–Nov), Winter (Dec–Feb).",
    },
    {
        q: "How does the credit system work?",
        a: "You get 12 credits per quarter, and each lesson uses one. Credits are valid for 4 months total (your 3-month quarter plus a 1-month buffer), so unused credits roll forward automatically.",
    },
    {
        q: "What if I need to miss a lesson?",
        a: "Reschedule with 24+ hours notice and your credit isn't used. Less than 24 hours, half a credit is consumed. Less than 30 minutes notice or a no-show, the full credit is used.",
    },
    {
        q: "What does my quarterly tuition cover?",
        a: "12 private lessons, recordings of every session, custom sheet music tailored to your goals, personalized practice exercises, twice-yearly online recitals, and full access to my premium masterclass library (100+ lessons) while enrolled.",
    },
    {
        q: "What ages do you teach?",
        a: "Students 12 and over. Currently focused on teen and adult learners.",
    },
]

export async function StaticLandingPage() {
    const allReviews = await getApprovedReviews()
    const featuredReviews = (allReviews ?? []).filter((r: any) => r.featured).slice(0, 4)

    return (
        <div className="scroll-smooth bg-white text-gray-950 font-sans antialiased selection:bg-black selection:text-white">
            {/* Navigation */}
            <nav className="fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-b border-gray-100 z-50">
                <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Music className="h-6 w-6" />
                        <span className="font-serif text-xl font-bold">Lionel Yu Piano Studio</span>
                    </div>
                    <Link
                        href="/login"
                        className="px-4 py-2 border border-gray-200 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
                    >
                        Student Login
                    </Link>
                </div>
            </nav>

            {/* Spacer for fixed nav */}
            <div className="h-16" />

            {/* Hero */}
            <section className="relative py-20 lg:py-32 overflow-hidden">
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
                    <div
                        className="w-full h-full"
                        style={{
                            backgroundImage:
                                "repeating-linear-gradient(90deg, #000 0px, #000 60px, #fff 60px, #fff 70px, #000 70px, #000 100px, #fff 100px, #fff 110px)",
                            backgroundSize: "100% 200px",
                        }}
                    />
                </div>

                <div className="max-w-7xl mx-auto px-4">
                    <div className="grid lg:grid-cols-2 gap-12 items-center">
                        <div className="space-y-8">
                            <div className="space-y-4">
                                <h1 className="font-serif text-5xl lg:text-6xl font-bold leading-tight">
                                    Structured quarters. Personalized instruction. A proven system for serious students.
                                </h1>
                                <p className="text-xl text-gray-500 leading-relaxed">
                                    Transform your musical journey with quarterly piano instruction designed around your goals, backed by 30+ years of experience and training from Juilliard, Peabody, and NYU.
                                </p>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-4">
                                <a
                                    href="#trial"
                                    className="inline-flex h-12 items-center justify-center rounded-md bg-black px-8 text-base font-medium text-white shadow hover:bg-gray-800 transition-colors"
                                >
                                    Request a Free Trial
                                </a>
                                <Link
                                    href="/login"
                                    className="inline-flex h-12 items-center justify-center rounded-md border border-gray-200 bg-transparent px-8 text-base font-medium shadow-sm hover:bg-gray-50 transition-colors"
                                >
                                    Student Portal
                                </Link>
                            </div>

                            <div className="grid grid-cols-3 gap-6 pt-8 border-t border-gray-100">
                                <div>
                                    <div className="font-serif text-3xl font-bold">1.27m</div>
                                    <div className="text-sm text-gray-500">YouTube Subscribers</div>
                                </div>
                                <div>
                                    <div className="font-serif text-3xl font-bold">50+</div>
                                    <div className="text-sm text-gray-500">Students Taught</div>
                                </div>
                                <div>
                                    <div className="font-serif text-3xl font-bold">100%</div>
                                    <div className="text-sm text-gray-500">Satisfaction Rate</div>
                                </div>
                            </div>
                        </div>

                        <div className="relative">
                            <div className="aspect-[4/5] rounded-lg overflow-hidden border-2 border-gray-100 shadow-2xl">
                                <img
                                    src="/lionel-yu-at-piano.JPG"
                                    alt="Professional Piano Instruction"
                                    className="w-full h-full object-cover"
                                />
                            </div>
                            <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-gray-900/10 rounded-full -z-10" />
                            <div className="absolute -top-6 -right-6 w-24 h-24 bg-gray-900/5 rounded-full -z-10" />
                        </div>
                    </div>
                </div>
            </section>

            {/* Enrollment Banner */}
            <section className="bg-black text-white">
                <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 text-center">
                    <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-wider">
                        Now Enrolling
                    </span>
                    <span className="font-serif text-lg sm:text-xl font-semibold">Summer 2026 Quarter</span>
                </div>
            </section>

            {/* About */}
            <section className="py-20 bg-gray-50/50">
                <div className="max-w-7xl mx-auto px-4">
                    <div className="max-w-3xl mx-auto">
                        <div className="text-center space-y-4 mb-12">
                            <h2 className="font-serif text-4xl font-bold">About Your Teacher</h2>
                            <div className="h-1 w-20 bg-black mx-auto" />
                        </div>

                        <div className="space-y-6 text-lg leading-relaxed text-gray-700">
                            <p>
                                With over 30 years of piano experience and having played in some of the world&apos;s biggest concert
                                halls, I teach students of all ages and skill levels, bringing a unique mixture of classical
                                technique and modern musicality to each student. My approach is rooted in building strong
                                technical foundations while nurturing each student&apos;s individual musical voice.
                            </p>

                            <p>
                                I have studied at Juilliard, Peabody and NYU Music Schools and with some of the world&apos;s best
                                pianists, such as Stanislav Khristenko, Assaff Weisman, Peter Dugan, and others. But my greatest
                                joy comes from witnessing the moment when a student discovers their own musical potential.
                            </p>

                            <div className="rounded-lg border-l-4 border-l-black bg-white p-6 shadow-sm">
                                <p className="font-serif text-xl italic text-gray-800">
                                    &ldquo;My teaching philosophy centers on three pillars: discipline, creativity, and joy. I
                                    believe that mastery comes from consistent practice, but the journey should always be filled
                                    with the excitement of musical discovery.&rdquo;
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Studio System */}
            <section className="py-20">
                <div className="max-w-7xl mx-auto px-4">
                    <div className="max-w-5xl mx-auto">
                        <div className="text-center space-y-4 mb-12">
                            <h2 className="font-serif text-4xl font-bold">The Studio System</h2>
                            <p className="text-xl text-gray-500">Quarterly enrollment built around real life</p>
                            <div className="h-1 w-20 bg-black mx-auto" />
                        </div>

                        <div className="grid md:grid-cols-3 gap-6">
                            <div className="rounded-xl border-2 border-gray-100 bg-white p-6 shadow-sm hover:border-black transition-colors">
                                <div className="space-y-4">
                                    <div className="h-12 w-12 bg-black rounded-lg flex items-center justify-center text-white">
                                        <Repeat className="h-6 w-6" />
                                    </div>
                                    <h3 className="font-serif text-xl font-bold">Quarterly Enrollment</h3>
                                    <p className="text-gray-500 leading-relaxed">
                                        12 lesson credits per quarter. Use them across 3 months of structured instruction with a built-in buffer month for makeups. Give 24+ hours notice when you reschedule and the credit rolls forward automatically.
                                    </p>
                                </div>
                            </div>

                            <div className="rounded-xl border-2 border-gray-100 bg-white p-6 shadow-sm hover:border-black transition-colors">
                                <div className="space-y-4">
                                    <div className="h-12 w-12 bg-black rounded-lg flex items-center justify-center text-white">
                                        <Sparkles className="h-6 w-6" />
                                    </div>
                                    <h3 className="font-serif text-xl font-bold">What&apos;s Included</h3>
                                    <p className="text-gray-500 leading-relaxed">
                                        Every quarter comes with lesson recordings, custom sheet music tailored to your goals, personalized practice exercises, participation in twice-yearly online recitals, and full access to my premium masterclass library (100+ lessons) while you&apos;re enrolled.
                                    </p>
                                </div>
                            </div>

                            <div className="rounded-xl border-2 border-gray-100 bg-white p-6 shadow-sm hover:border-black transition-colors">
                                <div className="space-y-4">
                                    <div className="h-12 w-12 bg-black rounded-lg flex items-center justify-center text-white">
                                        <Users className="h-6 w-6" />
                                    </div>
                                    <h3 className="font-serif text-xl font-bold">Performance &amp; Community</h3>
                                    <p className="text-gray-500 leading-relaxed">
                                        Twice-yearly online recitals give you real performance experience and a deadline to play toward. Open to anyone who has taken lessons in the past year. You&apos;ll be part of a community of students from teen beginners to working professionals.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Pricing */}
            <section className="py-20 bg-gray-50/50">
                <div className="max-w-7xl mx-auto px-4">
                    <div className="max-w-5xl mx-auto">
                        <div className="text-center space-y-4 mb-12">
                            <h2 className="font-serif text-4xl font-bold">Quarterly Tuition</h2>
                            <p className="text-xl text-gray-500">12 credits per quarter. Credits valid for 4 months.</p>
                            <div className="h-1 w-20 bg-black mx-auto" />
                        </div>

                        <div className="grid md:grid-cols-3 gap-6">
                            {PRICING_TIERS.map((tier) => (
                                <div
                                    key={tier.duration}
                                    className={`rounded-xl border-2 bg-white p-8 shadow-sm transition-colors flex flex-col ${tier.featured
                                        ? "border-black shadow-md relative"
                                        : "border-gray-100 hover:border-black"
                                        }`}
                                >
                                    {tier.featured && (
                                        <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-black text-white text-xs font-medium uppercase tracking-wider px-3 py-1 rounded-full">
                                            Most Popular
                                        </span>
                                    )}
                                    <div className="space-y-2 text-center flex-1">
                                        <div className="font-serif text-xl font-bold">{tier.duration}</div>
                                        <div className="font-serif text-5xl font-bold">{tier.price}</div>
                                        <div className="text-sm text-gray-500">{tier.note}</div>
                                    </div>
                                    <a
                                        href="#trial"
                                        className={`mt-6 inline-flex h-11 items-center justify-center rounded-md px-6 text-sm font-medium transition-colors ${tier.featured
                                            ? "bg-black text-white hover:bg-gray-800"
                                            : "border border-gray-200 bg-white hover:bg-gray-50"
                                            }`}
                                    >
                                        Request a Free Trial
                                    </a>
                                </div>
                            ))}
                        </div>

                        <p className="mt-8 text-center text-gray-600 max-w-2xl mx-auto">
                            Every quarter includes lesson recordings, custom sheet music &amp; exercises, online recital participation, and masterclass library access while enrolled.
                        </p>
                    </div>
                </div>
            </section>

            {/* Testimonials */}
            {featuredReviews.length > 0 && (
                <section className="py-20">
                    <div className="max-w-7xl mx-auto px-4">
                        <div className="max-w-5xl mx-auto">
                            <div className="text-center space-y-4 mb-12">
                                <h2 className="font-serif text-4xl font-bold">What Students Say</h2>
                                <div className="h-1 w-20 bg-black mx-auto" />
                            </div>

                            <div className="grid md:grid-cols-3 gap-6">
                                {featuredReviews.map((review: any) => {
                                    const profileCreatedAt = review.profiles?.created_at
                                    const fallbackLabel = profileCreatedAt
                                        ? `Student since ${new Date(profileCreatedAt).getFullYear()}`
                                        : null
                                    const tenureLabel = review.tenure_label ?? fallbackLabel

                                    return (
                                        <div
                                            key={review.id}
                                            className="rounded-xl bg-white p-6 shadow-sm border border-gray-100"
                                        >
                                            <div className="space-y-4">
                                                <div className="flex gap-1">
                                                    <span className="text-black tracking-wider">
                                                        {renderStars(review.rating)}
                                                    </span>
                                                </div>
                                                <p className="text-gray-600 italic leading-relaxed">
                                                    &ldquo;{review.text}&rdquo;
                                                </p>
                                                <div className="pt-4 border-t border-gray-100">
                                                    <p className="font-semibold">{review.name}</p>
                                                    <p className="text-sm text-gray-500">
                                                        {tenureLabel ?? formatReviewDate(review.created_at)}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>

                            <div className="mt-10 text-center">
                                <Link
                                    href="/reviews"
                                    className="inline-flex items-center text-sm font-medium text-black hover:underline"
                                >
                                    Read more reviews →
                                </Link>
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {/* FAQ (condensed) */}
            <section className="py-20 bg-gray-50/50">
                <div className="max-w-7xl mx-auto px-4">
                    <div className="max-w-3xl mx-auto">
                        <div className="text-center space-y-4 mb-10">
                            <h2 className="font-serif text-4xl font-bold">Frequently Asked Questions</h2>
                            <div className="h-1 w-20 bg-black mx-auto" />
                        </div>

                        <div className="rounded-xl bg-white border border-gray-100 shadow-sm px-6">
                            <Accordion type="single" collapsible className="w-full">
                                {HOMEPAGE_FAQS.map((faq, idx) => (
                                    <AccordionItem key={faq.q} value={`faq-${idx}`}>
                                        <AccordionTrigger className="text-base font-semibold">
                                            {faq.q}
                                        </AccordionTrigger>
                                        <AccordionContent className="text-gray-600 leading-relaxed">
                                            {faq.a}
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                            </Accordion>
                        </div>

                        <div className="mt-8 text-center">
                            <Link
                                href="/faqs"
                                className="inline-flex items-center text-sm font-medium text-black hover:underline"
                            >
                                See all FAQs →
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* Trial CTA + form */}
            <section className="py-24 bg-white border-t border-gray-100" id="trial">
                <div className="max-w-3xl mx-auto px-6">
                    <div className="text-center mb-12 space-y-4">
                        <h2 className="font-serif text-4xl font-bold">Free 15-Minute Trial Lesson</h2>
                        <p className="text-gray-600 text-lg leading-relaxed">
                            Before enrolling, let&apos;s meet. We&apos;ll talk through your goals, assess where you are, and make sure we&apos;re the right fit. Send a quick note using the form below and I&apos;ll personally reply within 48 hours to schedule.
                        </p>
                    </div>

                    <div className="rounded-xl bg-white p-6 sm:p-8 shadow-sm border border-gray-100">
                        <TrialInquiryForm />
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-gray-100 bg-gray-50/50">
                <div className="max-w-7xl mx-auto px-4 py-12">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="flex items-center gap-2">
                            <Music className="h-6 w-6" />
                            <span className="font-serif text-lg font-bold">Lionel Yu Piano Studio</span>
                        </div>

                        <div className="flex gap-6">
                            <a
                                href="https://facebook.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-gray-500 hover:text-black transition-colors"
                            >
                                <Facebook className="h-5 w-5" />
                                <span className="sr-only">Facebook</span>
                            </a>
                            <a
                                href="https://instagram.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-gray-500 hover:text-black transition-colors"
                            >
                                <Instagram className="h-5 w-5" />
                                <span className="sr-only">Instagram</span>
                            </a>
                            <a
                                href="mailto:support@musicalbasics.com"
                                className="text-gray-500 hover:text-black transition-colors"
                            >
                                <Mail className="h-5 w-5" />
                                <span className="sr-only">Email</span>
                            </a>
                        </div>

                        <p className="text-sm text-gray-500">© {new Date().getFullYear()} Lionel Yu Piano Studio. All rights reserved.</p>
                    </div>
                </div>
            </footer>
        </div>
    )
}
