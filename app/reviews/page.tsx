import Link from "next/link"
import { Music } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getApprovedReviews } from "@/app/actions/reviews"
import { StarRating } from "./star-rating"
import { SubmitReview } from "./submit-review"

// Format date utility
const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
    })
}

const getStudentSinceYear = (profileCreatedAt?: string) => {
    if (!profileCreatedAt) return null
    return new Date(profileCreatedAt).getFullYear()
}

export default async function ReviewsPage() {
    const reviews = await getApprovedReviews()

    return (
        <div className="min-h-screen bg-background">
            {/* Navigation */}
            <nav className="border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60 sticky top-0 z-50">
                <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-2">
                        <Music className="h-6 w-6" />
                        <span className="font-serif text-xl font-bold">Piano Studio</span>
                    </Link>
                    <Link href="/login">
                        <Button variant="outline" size="sm">
                            Student Login
                        </Button>
                    </Link>
                </div>
            </nav>

            {/* Header */}
            <section className="py-16 border-b">
                <div className="container mx-auto px-4">
                    <div className="max-w-3xl mx-auto text-center space-y-4">
                        <h1 className="font-serif text-5xl lg:text-6xl font-bold tracking-tight">Student Reviews</h1>
                        <p className="text-xl text-muted-foreground">Hear from the studio community.</p>
                        <div className="h-1 w-20 bg-foreground mx-auto" />
                    </div>
                </div>
            </section>

            {/* Reviews Masonry Grid */}
            <section className="py-16">
                <div className="container mx-auto px-4">
                    <div className="columns-1 md:columns-2 lg:columns-3 gap-6 space-y-6">
                        {reviews.map((review: any) => {
                            const profile = review.profiles
                            const studentSince = profile?.created_at ? getStudentSinceYear(profile.created_at) : null

                            return (
                                <Card
                                    key={review.id}
                                    className="break-inside-avoid border bg-background shadow-sm hover:shadow-md transition-shadow"
                                >
                                    <CardContent className="pt-6 space-y-4">
                                        {/* Star Rating */}
                                        <StarRating rating={review.rating} />

                                        {/* Review Text */}
                                        <blockquote className="text-lg leading-relaxed text-foreground">"{review.text}"</blockquote>

                                        {/* Footer */}
                                        <div className="pt-4 border-t flex items-center justify-between">
                                            <span className="font-serif font-semibold text-foreground">{review.name}</span>
                                            {studentSince ? (
                                                <Badge variant="secondary" className="text-xs font-normal">
                                                    Student since {studentSince}
                                                </Badge>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">{formatDate(review.created_at)}</span>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            )
                        })}
                        {reviews.length === 0 && (
                            <div className="col-span-full text-center py-10 text-muted-foreground">
                                No reviews yet. Be the first to share your experience!
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {/* Floating Action Button & Modal */}
            <SubmitReview />

            {/* Footer */}
            <footer className="border-t bg-muted/30">
                <div className="container mx-auto px-4 py-8">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                        <Link href="/" className="flex items-center gap-2">
                            <Music className="h-5 w-5" />
                            <span className="font-serif font-bold">Piano Studio</span>
                        </Link>
                        <p className="text-sm text-muted-foreground">© 2025 Piano Studio. All rights reserved.</p>
                    </div>
                </div>
            </footer>
        </div>
    )
}
