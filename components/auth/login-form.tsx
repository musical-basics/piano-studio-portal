"use client"

import type React from "react"
import Link from "next/link"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Music, Lock, Mail, AlertCircle } from "lucide-react"
import { login } from "@/app/login/actions"

export function LoginForm() {
    const [error, setError] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setIsLoading(true)
        setError(null)

        const formData = new FormData(e.currentTarget)
        const result = await login(formData)

        if (result?.error) {
            setError(result.error)
            setIsLoading(false)
        }
        // If successful, the server action will redirect
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background p-4">
            {/* Background Piano Keys Pattern */}
            <div className="absolute inset-0 opacity-[0.02] pointer-events-none">
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

            <Card className="w-full max-w-md relative shadow-2xl border-2">
                <CardHeader className="space-y-4 pb-8">
                    <div className="flex justify-center">
                        <div className="h-16 w-16 bg-primary rounded-full flex items-center justify-center">
                            <Music className="h-8 w-8 text-primary-foreground" />
                        </div>
                    </div>
                    <div className="text-center space-y-2">
                        <CardTitle className="text-3xl font-serif text-balance">Lionel Yu Piano Studio</CardTitle>
                        <CardDescription className="text-base">Enter your credentials to access your account</CardDescription>
                    </div>
                </CardHeader>

                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {error && (
                            <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                                <AlertCircle className="h-4 w-4" />
                                <span>{error}</span>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-sm font-medium">
                                Email Address
                            </Label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="email"
                                    name="email"
                                    type="email"
                                    placeholder="student@gmail.com"
                                    className="pl-10 h-11"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="password" className="text-sm font-medium">
                                    Password
                                </Label>
                                <Link
                                    href="/forgot-password"
                                    className="text-xs text-muted-foreground hover:text-primary transition-colors"
                                >
                                    Forgot password?
                                </Link>
                            </div>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="password"
                                    name="password"
                                    type="password"
                                    placeholder="••••••••"
                                    className="pl-10 h-11"
                                    required
                                />
                            </div>
                        </div>

                        <Button type="submit" className="w-full h-11 text-base" disabled={isLoading}>
                            {isLoading ? "Signing in..." : "Sign In"}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
