"use client"

import { InquiryForm } from "@/components/inquiry-form"
import { useState } from "react"
import { CheckCircle2, Music, Mail, Phone, MapPin } from "lucide-react"

export default function ContactPage() {
    const [isSuccess, setIsSuccess] = useState(false)

    return (
        <div className="min-h-screen bg-background">
            <div className="container mx-auto px-4 py-12 md:py-20 lg:py-24">
                <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12 lg:gap-20 items-start">

                    {/* Left Column: Contact Info & Branding */}
                    <div className="space-y-8">
                        <div>
                            <h1 className="text-4xl md:text-5xl font-serif font-bold tracking-tight mb-4">
                                Get in Touch
                            </h1>
                            <p className="text-xl text-muted-foreground leading-relaxed">
                                Ready to start your musical journey? I'd love to hear from you. Fill out the form or reach out directly.
                            </p>
                        </div>

                        <div className="space-y-6">
                            <div className="flex items-center gap-4">
                                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                    <Mail className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="font-medium">Email</p>
                                    <p className="text-muted-foreground">support@musicalbasics.com</p>
                                </div>
                            </div>

                            <div className="flex items-start gap-4">
                                <div className="p-3 bg-secondary rounded-lg">
                                    <Music className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="font-medium">Studio</p>
                                    <p className="text-muted-foreground">Lionel Yu Piano Studio</p>
                                </div>
                            </div>
                        </div>

                        {/* Philosophy Card */}
                        <div className="bg-card border rounded-xl p-8 shadow-sm">
                            <h3 className="font-serif font-semibold text-xl mb-4">Teaching Philosophy</h3>
                            <p className="text-muted-foreground leading-relaxed">
                                "My teaching philosophy centers on three pillars: discipline, creativity, and joy. I believe that mastery comes from consistent practice, but the journey should always be filled with the excitement of musical discovery."
                            </p>
                        </div>
                    </div>

                    {/* Right Column: Inquiry Form */}
                    <div className="bg-card border rounded-xl shadow-sm p-6 md:p-8">
                        {isSuccess ? (
                            <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
                                <div className="h-20 w-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center animate-in fade-in zoom-in duration-300">
                                    <CheckCircle2 className="h-10 w-10" />
                                </div>
                                <div className="space-y-2">
                                    <h2 className="text-2xl font-serif font-semibold">Inquiry Sent!</h2>
                                    <p className="text-muted-foreground max-w-xs mx-auto">
                                        Thank you for reaching out. We have received your details and will get back to you within 24 hours.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <InquiryForm
                                onSuccess={() => setIsSuccess(true)}
                                className="space-y-6"
                            />
                        )}
                    </div>

                </div>
            </div>
        </div>
    )
}
