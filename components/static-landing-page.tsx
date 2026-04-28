import Link from "next/link"
import { Music, Clock, Calendar, Award, Facebook, Instagram, Mail } from "lucide-react"
import { InquiryForm } from "@/components/inquiry-form"
import { getApprovedReviews } from "@/app/actions/reviews"

const formatReviewDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })

const renderStars = (rating: number) => {
    const filled = Math.max(0, Math.min(5, rating))
    return "★".repeat(filled) + "☆".repeat(5 - filled)
}

export async function StaticLandingPage() {
    const allReviews = await getApprovedReviews()
    const featuredReviews = (allReviews ?? []).slice(0, 3)

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
                                    Master Piano with Excellence
                                </h1>
                                <p className="text-xl text-gray-500 leading-relaxed">
                                    Transform your musical journey with personalized instruction, flexible scheduling, and a
                                    proven system designed for serious students.
                                </p>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-4">
                                <Link
                                    href="/login"
                                    className="inline-flex h-12 items-center justify-center rounded-md bg-black px-8 text-base font-medium text-white shadow hover:bg-gray-800 transition-colors"
                                >
                                    Student Portal
                                </Link>
                                <a
                                    href="#contact"
                                    className="inline-flex h-12 items-center justify-center rounded-md border border-gray-200 bg-transparent px-8 text-base font-medium shadow-sm hover:bg-gray-50 transition-colors"
                                >
                                    Inquire for Lessons
                                </a>
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
                                With over 30 years of piano experience and having played in some of the world's biggest concert
                                halls, I teach students of all ages and skill levels, bringing a unique mixture of classical
                                technique and modern musicality to each student. My approach is rooted in building strong
                                technical foundations while nurturing each student's individual musical voice.
                            </p>

                            <p>
                                I have studied at Juilliard, Peabody and NYU Music Schools and with some of the world's best
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
                    <div className="max-w-4xl mx-auto">
                        <div className="text-center space-y-4 mb-12">
                            <h2 className="font-serif text-4xl font-bold">The Studio System</h2>
                            <p className="text-xl text-gray-500">Flexible consistency for serious students</p>
                            <div className="h-1 w-20 bg-black mx-auto" />
                        </div>

                        <div className="grid md:grid-cols-3 gap-6">
                            <div className="rounded-xl border-2 border-gray-100 bg-white p-6 shadow-sm hover:border-black transition-colors">
                                <div className="space-y-4">
                                    <div className="h-12 w-12 bg-black rounded-lg flex items-center justify-center text-white">
                                        <Calendar className="h-6 w-6" />
                                    </div>
                                    <h3 className="font-serif text-xl font-bold">Credit-Based Packages</h3>
                                    <p className="text-gray-500 leading-relaxed">
                                        Purchase 4-lesson packages that work with your schedule. No rigid monthly
                                        commitments&mdash;just consistent progress at your pace.
                                    </p>
                                </div>
                            </div>

                            <div className="rounded-xl border-2 border-gray-100 bg-white p-6 shadow-sm hover:border-black transition-colors">
                                <div className="space-y-4">
                                    <div className="h-12 w-12 bg-black rounded-lg flex items-center justify-center text-white">
                                        <Clock className="h-6 w-6" />
                                    </div>
                                    <h3 className="font-serif text-xl font-bold">Fair Cancellation Policy</h3>
                                    <p className="text-gray-500 leading-relaxed">
                                        Life happens. Reschedule with 24+ hours notice at no charge. We'll find you a makeup
                                        slot that works for your week.
                                    </p>
                                </div>
                            </div>

                            <div className="rounded-xl border-2 border-gray-100 bg-white p-6 shadow-sm hover:border-black transition-colors">
                                <div className="space-y-4">
                                    <div className="h-12 w-12 bg-black rounded-lg flex items-center justify-center text-white">
                                        <Award className="h-6 w-6" />
                                    </div>
                                    <h3 className="font-serif text-xl font-bold">Professional Standards</h3>
                                    <p className="text-gray-500 leading-relaxed">
                                        Clear expectations, detailed lesson notes, and recorded sessions ensure you get maximum
                                        value from every minute of instruction.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 rounded-lg bg-gray-50 border border-gray-200 p-6">
                            <p className="text-center text-lg text-gray-700">
                                <strong className="font-serif">The Result?</strong> Students make faster progress because they
                                can maintain weekly momentum without the stress of rigid scheduling. It's the perfect balance
                                of structure and flexibility.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Testimonials */}
            {featuredReviews.length > 0 && (
                <section className="py-20 bg-gray-50/50">
                    <div className="max-w-7xl mx-auto px-4">
                        <div className="max-w-5xl mx-auto">
                            <div className="text-center space-y-4 mb-12">
                                <h2 className="font-serif text-4xl font-bold">What Students Say</h2>
                                <div className="h-1 w-20 bg-black mx-auto" />
                            </div>

                            <div className="grid md:grid-cols-3 gap-6">
                                {featuredReviews.map((review: any) => {
                                    const profileCreatedAt = review.profiles?.created_at
                                    const studentSince =
                                        review.student_since ??
                                        (profileCreatedAt ? new Date(profileCreatedAt).getFullYear() : null)

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
                                                        {studentSince
                                                            ? `Student since ${studentSince}`
                                                            : formatReviewDate(review.created_at)}
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

            {/* Contact / Inquiry */}
            <section className="py-24 bg-gray-50 border-t border-gray-100" id="contact">
                <div className="max-w-3xl mx-auto px-6">
                    <div className="text-center mb-12">
                        <h2 className="font-serif text-4xl font-bold mb-4">Ready to Begin Your Musical Journey?</h2>
                        <p className="text-gray-500 text-lg">
                            Send me a message to discuss your goals and schedule a consultation.
                        </p>
                    </div>

                    <div className="rounded-xl bg-white p-6 sm:p-8 shadow-sm border border-gray-100">
                        <InquiryForm />
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

                        <p className="text-sm text-gray-500">© 2025 Lionel Yu Piano Studio. All rights reserved.</p>
                    </div>
                </div>
            </footer>
        </div>
    )
}
