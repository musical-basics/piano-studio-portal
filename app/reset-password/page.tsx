"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Music, Loader2, Lock, Eye, EyeOff, CheckCircle, ShieldAlert, KeyRound } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

function ResetPasswordForm() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [isLoading, setIsLoading] = useState(false)
    const [isVerifying, setIsVerifying] = useState(false)
    const [isSessionVerified, setIsSessionVerified] = useState(false)
    const [error, setError] = useState("")
    const [success, setSuccess] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)

    const code = searchParams.get("code")
    const tokenHash = searchParams.get("token_hash")
    const type = searchParams.get("type") || "recovery"

    // Check if user already has a session when loading the page without query parameters
    useEffect(() => {
        async function checkActiveSession() {
            if (!code && !tokenHash) {
                const supabase = createClient()
                const { data: { session } } = await supabase.auth.getSession()
                if (session) {
                    setIsSessionVerified(true)
                } else {
                    setError("No active reset session found. Please request a new reset link.")
                }
            }
        }
        checkActiveSession()
    }, [code, tokenHash])

    // Triggered manually by the user clicking "Verify & Continue"
    // This blocks automated email crawlers (even JS-enabled ones) from consuming the token
    async function handleVerifyLink() {
        if (!code && !tokenHash) return

        setIsVerifying(true)
        setError("")
        const supabase = createClient()

        try {
            let authError = null
            if (code) {
                const { error } = await supabase.auth.exchangeCodeForSession(code)
                authError = error
            } else if (tokenHash) {
                const { error } = await supabase.auth.verifyOtp({
                    token_hash: tokenHash,
                    type: type as any,
                })
                authError = error
            }

            if (authError) {
                console.error("Verification error:", authError)
                setError("This password reset link is invalid or has expired. Please request a new one.")
            } else {
                setIsSessionVerified(true)
            }
        } catch (err: any) {
            setError(err?.message || "An unexpected error occurred during verification.")
        } finally {
            setIsVerifying(false)
        }
    }

    async function handleSubmit(formData: FormData) {
        setIsLoading(true)
        setError("")

        const password = formData.get("password") as string
        const confirmPassword = formData.get("confirmPassword") as string

        if (!password || !confirmPassword) {
            setError("Both password fields are required")
            setIsLoading(false)
            return
        }

        if (password !== confirmPassword) {
            setError("Passwords do not match")
            setIsLoading(false)
            return
        }

        if (password.length < 6) {
            setError("Password must be at least 6 characters")
            setIsLoading(false)
            return
        }

        try {
            const supabase = createClient()
            const { error: updateError } = await supabase.auth.updateUser({ password })

            if (updateError) {
                setError(updateError.message)
                setIsLoading(false)
                return
            }

            setSuccess(true)
            
            // Get user profile to determine redirect
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                const { data: profile } = await supabase
                    .from("profiles")
                    .select("role")
                    .eq("id", user.id)
                    .single()

                setTimeout(() => {
                    if (profile?.role === "admin") {
                        router.push("/admin")
                    } else {
                        router.push("/student")
                    }
                }, 2000)
            } else {
                setTimeout(() => {
                    router.push("/login")
                }, 2000)
            }
        } catch (err: any) {
            setError(err?.message || "An unexpected error occurred")
            setIsLoading(false)
        }
    }

    if (error) {
        return (
            <div className="text-center space-y-4 py-4">
                <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center mx-auto">
                    <ShieldAlert className="h-6 w-6 text-red-600" />
                </div>
                <h3 className="font-semibold text-lg text-slate-900">Verification Failed</h3>
                <p className="text-slate-500 text-sm max-w-xs mx-auto">
                    {error}
                </p>
                <div className="pt-2">
                    <Button 
                        variant="outline" 
                        onClick={() => router.push("/forgot-password")}
                        className="transition-all hover:bg-slate-100"
                    >
                        Request New Link
                    </Button>
                </div>
            </div>
        )
    }

    if (success) {
        return (
            <div className="text-center space-y-4 py-4">
                <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                    <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
                <h3 className="font-semibold text-lg text-slate-900">Password updated!</h3>
                <p className="text-muted-foreground text-sm">
                    Your password has been successfully updated. Redirecting you to your dashboard...
                </p>
            </div>
        )
    }

    // Step 1: Manual Verification Screen to block automated bots/scanners
    if (!isSessionVerified && (code || tokenHash)) {
        return (
            <div className="text-center space-y-6 py-4">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto animate-pulse">
                    <KeyRound className="h-8 w-8 text-primary" />
                </div>
                <div className="space-y-2">
                    <h3 className="font-semibold text-lg text-slate-900">Verify Reset Link</h3>
                    <p className="text-slate-500 text-sm max-w-xs mx-auto">
                        To protect your account from automated email scanners, please click the button below to verify your password reset link.
                    </p>
                </div>
                <Button 
                    onClick={handleVerifyLink} 
                    className="w-full transition-all duration-200 shadow-md hover:shadow-lg font-medium py-6"
                    disabled={isVerifying}
                >
                    {isVerifying ? (
                        <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Verifying Reset Link...
                        </>
                    ) : (
                        "Verify & Continue"
                    )}
                </Button>
            </div>
        )
    }

    // Step 2: Show Password Reset Form
    return (
        <form action={handleSubmit} className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        className="pl-10 pr-10"
                        minLength={6}
                        required
                    />
                    <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                </div>
                <p className="text-xs text-muted-foreground">
                    Must be at least 6 characters
                </p>
            </div>

            <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        id="confirmPassword"
                        name="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="••••••••"
                        className="pl-10 pr-10"
                        minLength={6}
                        required
                    />
                    <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                </div>
            </div>

            <Button type="submit" className="w-full py-6 transition-all font-medium" disabled={isLoading}>
                {isLoading ? (
                    <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Updating...
                    </>
                ) : (
                    "Update Password"
                )}
            </Button>
        </form>
    )
}

export default function ResetPasswordPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
            <Card className="w-full max-w-md border border-slate-200/80 shadow-xl backdrop-blur-[2px]">
                <CardHeader className="text-center pb-4">
                    <div className="flex justify-center mb-4">
                        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                            <Music className="h-8 w-8 text-primary animate-pulse" />
                        </div>
                    </div>
                    <CardTitle className="text-2xl font-serif font-bold text-slate-800">Set New Password</CardTitle>
                    <CardDescription className="text-slate-500">
                        Securely update your password credentials
                    </CardDescription>
                </CardHeader>
                <CardContent className="px-6 pb-6">
                    <Suspense fallback={
                        <div className="flex flex-col items-center justify-center p-8 space-y-4">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <p className="text-sm text-muted-foreground">Loading password reset form...</p>
                        </div>
                    }>
                        <ResetPasswordForm />
                    </Suspense>
                </CardContent>
            </Card>
        </div>
    )
}
