"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Music, Clock, Calendar, Award, Facebook, Instagram, Mail } from "lucide-react"
import { InquiryModal } from "@/components/inquiry-modal"
import { useState } from "react"

export function StaticLandingPage() {
    const [showInquiryModal, setShowInquiryModal] = useState(false)

    return (
        <div className="min-h-screen bg-background">
            {/* Navigation */}
            <nav className="border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60 sticky top-0 z-50">
                <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Music className="h-6 w-6" />
                        <span className="font-serif text-xl font-bold">Piano Studio</span>
                    </div>
                    <Link href="/login">
                        <Button variant="outline" size="sm">
                            Student Login
                        </Button>
                    </Link>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="relative py-20 lg:py-32 overflow-hidden">
                {/* Background Piano Keys Pattern */}
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
                    <div
                        className="w-full h-full"
                        style={{
                            backgroundImage: `repeating-linear-gradient(
                90deg,
                #000 0px,
                #000 60px,
                #fff 60px,
                #fff 70px,
                #000 70px,
                #000 100px,
                #fff 100px,
                #fff 110px
              )`,
                            backgroundSize: "100% 200px",
                        }}
                    />
                </div>

                <div className="container mx-auto px-4">
                    <div className="grid lg:grid-cols-2 gap-12 items-center">
                        {/* Left Content */}
                        <div className="space-y-8">
                            <div className="space-y-4">
                                <h1 className="font-serif text-5xl lg:text-6xl font-bold text-balance leading-tight">
                                    Master Piano with Excellence
                                </h1>
                                <p className="text-xl text-muted-foreground text-pretty leading-relaxed">
                                    Transform your musical journey with personalized instruction, flexible scheduling, and a proven system
                                    designed for serious students.
                                </p>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-4">
                                <Button size="lg" className="text-base h-12 px-8" onClick={() => setShowInquiryModal(true)}>
                                    Inquire for Lessons
                                </Button>
                                <Link href="/student">
                                    <Button variant="outline" size="lg" className="text-base h-12 px-8 w-full sm:w-auto bg-transparent">
                                        Student Portal
                                    </Button>
                                </Link>
                            </div>

                            {/* Stats */}
                            <div className="grid grid-cols-3 gap-6 pt-8 border-t">
                                <div>
                                    <div className="font-serif text-3xl font-bold">15+</div>
                                    <div className="text-sm text-muted-foreground">Years Teaching</div>
                                </div>
                                <div>
                                    <div className="font-serif text-3xl font-bold">200+</div>
                                    <div className="text-sm text-muted-foreground">Students Taught</div>
                                </div>
                                <div>
                                    <div className="font-serif text-3xl font-bold">98%</div>
                                    <div className="text-sm text-muted-foreground">Satisfaction Rate</div>
                                </div>
                            </div>
                        </div>

                        {/* Right Image */}
                        <div className="relative">
                            <div className="aspect-[4/5] rounded-lg overflow-hidden border-2 border-border shadow-2xl">
                                <img
                                    src="/professional-piano-teacher-at-grand-piano-in-elega.jpg"
                                    alt="Professional Piano Instruction"
                                    className="w-full h-full object-cover"
                                />
                            </div>
                            {/* Decorative Element */}
                            <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-primary/10 rounded-full -z-10" />
                            <div className="absolute -top-6 -right-6 w-24 h-24 bg-primary/5 rounded-full -z-10" />
                        </div>
                    </div>
                </div>
            </section>

            {/* About Me Section */}
            <section className="py-20 bg-muted/30">
                <div className="container mx-auto px-4">
                    <div className="max-w-3xl mx-auto">
                        <div className="text-center space-y-4 mb-12">
                            <h2 className="font-serif text-4xl font-bold">About Your Teacher</h2>
                            <div className="h-1 w-20 bg-primary mx-auto" />
                        </div>

                        <div className="space-y-6 text-lg leading-relaxed">
                            <p>
                                With over 15 years of experience teaching piano to students of all ages and skill levels, I bring a
                                unique blend of classical training and modern pedagogy to every lesson. My approach is rooted in
                                building strong technical foundations while nurturing each student's individual musical voice.
                            </p>

                            <p>
                                I hold a Master's degree in Piano Performance from a prestigious conservatory and have performed
                                internationally as a soloist and chamber musician. But my greatest joy comes from witnessing the moment
                                when a student discovers their own musical potential.
                            </p>

                            <Card className="border-l-4 border-l-primary bg-background">
                                <CardContent className="pt-6">
                                    <p className="font-serif text-xl italic text-balance">
                                        "My teaching philosophy centers on three pillars: discipline, creativity, and joy. I believe that
                                        mastery comes from consistent practice, but the journey should always be filled with the excitement
                                        of musical discovery."
                                    </p>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </div>
            </section>

            {/* Studio Policy Section */}
            <section className="py-20">
                <div className="container mx-auto px-4">
                    <div className="max-w-4xl mx-auto">
                        <div className="text-center space-y-4 mb-12">
                            <h2 className="font-serif text-4xl font-bold">The Studio System</h2>
                            <p className="text-xl text-muted-foreground">Flexible consistency for serious students</p>
                            <div className="h-1 w-20 bg-primary mx-auto" />
                        </div>

                        <div className="grid md:grid-cols-3 gap-6">
                            {/* Credit-Based System */}
                            <Card className="border-2 hover:border-primary transition-colors">
                                <CardContent className="pt-6 space-y-4">
                                    <div className="h-12 w-12 bg-primary rounded-lg flex items-center justify-center">
                                        <Calendar className="h-6 w-6 text-primary-foreground" />
                                    </div>
                                    <h3 className="font-serif text-xl font-bold">Credit-Based Packages</h3>
                                    <p className="text-muted-foreground leading-relaxed">
                                        Purchase 4-lesson packages that work with your schedule. No rigid monthly commitments—just
                                        consistent progress at your pace.
                                    </p>
                                </CardContent>
                            </Card>

                            {/* Flexible Rescheduling */}
                            <Card className="border-2 hover:border-primary transition-colors">
                                <CardContent className="pt-6 space-y-4">
                                    <div className="h-12 w-12 bg-primary rounded-lg flex items-center justify-center">
                                        <Clock className="h-6 w-6 text-primary-foreground" />
                                    </div>
                                    <h3 className="font-serif text-xl font-bold">Fair Cancellation Policy</h3>
                                    <p className="text-muted-foreground leading-relaxed">
                                        Life happens. Reschedule with 24+ hours notice at no charge. We'll find you a makeup slot that works
                                        for your week.
                                    </p>
                                </CardContent>
                            </Card>

                            {/* Professional Accountability */}
                            <Card className="border-2 hover:border-primary transition-colors">
                                <CardContent className="pt-6 space-y-4">
                                    <div className="h-12 w-12 bg-primary rounded-lg flex items-center justify-center">
                                        <Award className="h-6 w-6 text-primary-foreground" />
                                    </div>
                                    <h3 className="font-serif text-xl font-bold">Professional Standards</h3>
                                    <p className="text-muted-foreground leading-relaxed">
                                        Clear expectations, detailed lesson notes, and recorded sessions ensure you get maximum value from
                                        every minute of instruction.
                                    </p>
                                </CardContent>
                            </Card>
                        </div>

                        <Card className="mt-8 bg-primary/5 border-primary/20">
                            <CardContent className="pt-6">
                                <p className="text-center text-lg">
                                    <strong className="font-serif">The Result?</strong> Students make faster progress because they can
                                    maintain weekly momentum without the stress of rigid scheduling. It's the perfect balance of structure
                                    and flexibility.
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </section>

            {/* Testimonials Section */}
            <section className="py-20 bg-muted/30">
                <div className="container mx-auto px-4">
                    <div className="max-w-5xl mx-auto">
                        <div className="text-center space-y-4 mb-12">
                            <h2 className="font-serif text-4xl font-bold">What Students Say</h2>
                            <div className="h-1 w-20 bg-primary mx-auto" />
                        </div>

                        <div className="grid md:grid-cols-3 gap-6">
                            <Card className="bg-background">
                                <CardContent className="pt-6 space-y-4">
                                    <div className="flex gap-1">
                                        {[...Array(5)].map((_, i) => (
                                            <Music key={i} className="h-4 w-4 fill-primary text-primary" />
                                        ))}
                                    </div>
                                    <p className="text-muted-foreground italic leading-relaxed">
                                        "The credit system is brilliant! I travel for work and this is the only studio that accommodates my
                                        schedule without penalty. My technique has improved more in 6 months here than 2 years elsewhere."
                                    </p>
                                    <div className="pt-4 border-t">
                                        <p className="font-semibold">Sarah M.</p>
                                        <p className="text-sm text-muted-foreground">Adult Student, 2 years</p>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="bg-background">
                                <CardContent className="pt-6 space-y-4">
                                    <div className="flex gap-1">
                                        {[...Array(5)].map((_, i) => (
                                            <Music key={i} className="h-4 w-4 fill-primary text-primary" />
                                        ))}
                                    </div>
                                    <p className="text-muted-foreground italic leading-relaxed">
                                        "My daughter loves her lessons! The recorded sessions are invaluable for practice at home. The
                                        teacher strikes the perfect balance between challenging her and keeping it fun."
                                    </p>
                                    <div className="pt-4 border-t">
                                        <p className="font-semibold">Jennifer L.</p>
                                        <p className="text-sm text-muted-foreground">Parent of Student, 3 years</p>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="bg-background">
                                <CardContent className="pt-6 space-y-4">
                                    <div className="flex gap-1">
                                        {[...Array(5)].map((_, i) => (
                                            <Music key={i} className="h-4 w-4 fill-primary text-primary" />
                                        ))}
                                    </div>
                                    <p className="text-muted-foreground italic leading-relaxed">
                                        "Professional, organized, and incredibly talented. The online portal with lesson notes and sheet
                                        music keeps everything in one place. This is how modern music education should work."
                                    </p>
                                    <div className="pt-4 border-t">
                                        <p className="font-semibold">David K.</p>
                                        <p className="text-sm text-muted-foreground">Advanced Student, 1 year</p>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-20 border-t">
                <div className="container mx-auto px-4">
                    <div className="max-w-3xl mx-auto text-center space-y-8">
                        <h2 className="font-serif text-4xl font-bold text-balance">Ready to Begin Your Musical Journey?</h2>
                        <p className="text-xl text-muted-foreground text-pretty">
                            Limited openings available for serious students. Schedule a consultation to discuss your goals and find
                            the perfect lesson time.
                        </p>
                        <Button size="lg" className="text-base h-12 px-8" onClick={() => setShowInquiryModal(true)}>
                            Inquire for Lessons
                        </Button>

                        <InquiryModal open={showInquiryModal} onOpenChange={setShowInquiryModal} />
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t bg-muted/30">
                <div className="container mx-auto px-4 py-12">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="flex items-center gap-2">
                            <Music className="h-6 w-6" />
                            <span className="font-serif text-lg font-bold">Piano Studio</span>
                        </div>

                        <div className="flex gap-6">
                            <a
                                href="https://facebook.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <Facebook className="h-5 w-5" />
                                <span className="sr-only">Facebook</span>
                            </a>
                            <a
                                href="https://instagram.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <Instagram className="h-5 w-5" />
                                <span className="sr-only">Instagram</span>
                            </a>
                            <a
                                href="mailto:contact@pianostudio.com"
                                className="text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <Mail className="h-5 w-5" />
                                <span className="sr-only">Email</span>
                            </a>
                        </div>

                        <p className="text-sm text-muted-foreground">© 2025 Piano Studio. All rights reserved.</p>
                    </div>
                </div>
            </footer>
        </div>
    )
}
