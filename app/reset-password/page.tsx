"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Music, Loader2, Lock, Eye, EyeOff, CheckCircle } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

function ResetPasswordForm() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [isLoading, setIsLoading] = useState(false)
    const [isVerifying, setIsVerifying] = useState(false)
    const [error, setError] = useState("")
    const [success, setSuccess] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)

    const code = searchParams.get("code")
    const tokenHash = searchParams.get("token_hash")
    const type = searchParams.get("type") || "recovery"
    
    // Guard to prevent double execution of exchangeCodeForSession/verifyOtp in React 18+ / StrictMode
    const hasVerified = useRef(false)

    useEffect(() => {
        async function verifyLink() {
            if (hasVerified.current) return
            
            if (code || tokenHash) {
                hasVerified.current = true
                setIsVerifying(true)
                setError("")
                const supabase = createClient()

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

                setIsVerifying(false)
                if (authError) {
                    console.error("Verification error:", authError)
                    setError("This password reset link is invalid or has expired. Please request a new one.")
                }
            } else {
                // Check if user has an active session already
                const supabase = createClient()
                const { data: { session } } = await supabase.auth.getSession()
                if (!session) {
                    setError("No active reset session found. Please request a new reset link.")
                }
            }
        }
        verifyLink()
    }, [code, tokenHash, type])

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

    if (isVerifying) {
        return (
            <div className="flex flex-col items-center justify-center p-8 space-y-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Verifying your reset link...</p>
            </div>
        )
    }

    if (success) {
        return (
            <div className="text-center space-y-4 py-4">
                <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                    <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
                <h3 className="font-semibold text-lg">Password updated!</h3>
                <p className="text-muted-foreground text-sm">
                    Your password has been successfully updated. Redirecting you to your dashboard...
                </p>
            </div>
        )
    }

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
                        disabled={!!error}
                    />
                    <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        disabled={!!error}
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
                        disabled={!!error}
                    />
                    <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        disabled={!!error}
                    >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                </div>
            </div>

            {error && (
                <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
                    {error}
                </p>
            )}

            <Button type="submit" className="w-full" disabled={isLoading || !!error}>
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
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <div className="flex justify-center mb-4">
                        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                            <Music className="h-8 w-8 text-primary" />
                        </div>
                    </div>
                    <CardTitle className="text-2xl font-serif">Set New Password</CardTitle>
                    <CardDescription>
                        Enter your new password below
                    </CardDescription>
                </CardHeader>
                <CardContent>
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
