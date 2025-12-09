"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Music, ArrowLeft, Loader2, Mail, CheckCircle } from "lucide-react"
import { sendResetLink } from "@/app/login/actions"

export default function ForgotPasswordPage() {
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState("")
    const [success, setSuccess] = useState(false)

    async function handleSubmit(formData: FormData) {
        setIsLoading(true)
        setError("")

        const result = await sendResetLink(formData)

        setIsLoading(false)

        if (result.error) {
            setError(result.error)
        } else if (result.success) {
            setSuccess(true)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <div className="flex justify-center mb-4">
                        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                            <Music className="h-8 w-8 text-primary" />
                        </div>
                    </div>
                    <CardTitle className="text-2xl font-serif">Reset Password</CardTitle>
                    <CardDescription>
                        Enter your email and we&apos;ll send you a link to reset your password
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {success ? (
                        <div className="text-center space-y-4">
                            <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                                <CheckCircle className="h-8 w-8 text-green-600" />
                            </div>
                            <h3 className="font-semibold text-lg">Check your email</h3>
                            <p className="text-muted-foreground text-sm">
                                We&apos;ve sent a password reset link to your email address.
                                Click the link in the email to reset your password.
                            </p>
                            <Link href="/login">
                                <Button variant="outline" className="mt-4">
                                    <ArrowLeft className="h-4 w-4 mr-2" />
                                    Back to Login
                                </Button>
                            </Link>
                        </div>
                    ) : (
                        <form action={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="email"
                                        name="email"
                                        type="email"
                                        placeholder="you@example.com"
                                        className="pl-10"
                                        required
                                    />
                                </div>
                            </div>

                            {error && (
                                <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
                                    {error}
                                </p>
                            )}

                            <Button type="submit" className="w-full" disabled={isLoading}>
                                {isLoading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Sending...
                                    </>
                                ) : (
                                    "Send Reset Link"
                                )}
                            </Button>

                            <div className="text-center">
                                <Link
                                    href="/login"
                                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                                >
                                    <ArrowLeft className="h-3 w-3 inline mr-1" />
                                    Back to Login
                                </Link>
                            </div>
                        </form>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
