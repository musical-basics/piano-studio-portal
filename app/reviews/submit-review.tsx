"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { PenLine, CheckCircle } from "lucide-react"
import { StarRating } from "./star-rating"
import { submitReview } from "@/app/actions/reviews"

export function SubmitReview() {
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isSubmitted, setIsSubmitted] = useState(false)
    const [formData, setFormData] = useState({
        name: "",
        review: "",
        rating: 0,
    })
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmitting(true)
        setError(null)

        const data = new FormData()
        data.append("name", formData.name)
        data.append("review", formData.review)
        data.append("rating", formData.rating.toString())

        try {
            const result = await submitReview(data)

            if (result.error) {
                setError(result.error)
                setIsSubmitting(false)
                return
            }

            setIsSubmitting(false)
            setIsSubmitted(true)
        } catch (err) {
            console.error(err)
            setError("An unexpected error occurred.")
            setIsSubmitting(false)
        }
    }

    const handleCloseModal = () => {
        setIsModalOpen(false)
        // Reset form after modal closes
        setTimeout(() => {
            setIsSubmitted(false)
            setFormData({ name: "", review: "", rating: 0 })
            setError(null)
        }, 300)
    }

    return (
        <>
            <Button
                onClick={() => setIsModalOpen(true)}
                className="fixed bottom-8 right-8 h-auto py-4 px-6 rounded-full shadow-xl hover:shadow-2xl hover:scale-105 transition-all duration-200 z-40 bg-foreground text-background hover:bg-foreground/90"
            >
                <PenLine className="h-5 w-5 mr-3 flex-shrink-0" />
                <span className="text-sm font-medium">Are you a student of Lionel's? Submit a review here!</span>
            </Button>

            <Dialog open={isModalOpen} onOpenChange={handleCloseModal}>
                <DialogContent className="sm:max-w-md">
                    {!isSubmitted ? (
                        <>
                            <DialogHeader>
                                <DialogTitle className="font-serif text-2xl">Share Your Experience</DialogTitle>
                                <DialogDescription>Your feedback helps others discover the studio.</DialogDescription>
                            </DialogHeader>

                            <form onSubmit={handleSubmit} className="space-y-6 pt-4">
                                {error && (
                                    <div className="text-red-500 text-sm bg-red-50 p-2 rounded">
                                        {error}
                                    </div>
                                )}

                                {/* Name Input */}
                                <div className="space-y-2">
                                    <Label htmlFor="name">Your Name</Label>
                                    <Input
                                        id="name"
                                        placeholder="e.g., Sarah M."
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        required
                                    />
                                    <p className="text-xs text-muted-foreground">Displayed as shown (e.g., first name + last initial)</p>
                                </div>

                                {/* Star Rating */}
                                <div className="space-y-2">
                                    <Label>Rating</Label>
                                    <StarRating
                                        rating={formData.rating}
                                        onRatingChange={(rating) => setFormData({ ...formData, rating })}
                                        interactive
                                    />
                                </div>

                                {/* Review Textarea */}
                                <div className="space-y-2">
                                    <Label htmlFor="review">Your Review</Label>
                                    <Textarea
                                        id="review"
                                        placeholder="Tell us about your experience at the studio..."
                                        rows={4}
                                        value={formData.review}
                                        onChange={(e) => setFormData({ ...formData, review: e.target.value })}
                                        required
                                        className="resize-none"
                                    />
                                </div>

                                {/* Submit Button */}
                                <Button type="submit" className="w-full" disabled={isSubmitting || formData.rating === 0}>
                                    {isSubmitting ? (
                                        <span className="flex items-center gap-2">
                                            <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                            Submitting...
                                        </span>
                                    ) : (
                                        "Submit Review"
                                    )}
                                </Button>
                            </form>
                        </>
                    ) : (
                        // Success State
                        <div className="py-8 text-center space-y-4">
                            <div className="mx-auto w-16 h-16 bg-foreground rounded-full flex items-center justify-center">
                                <CheckCircle className="h-8 w-8 text-background" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="font-serif text-2xl font-bold">Review Received</h3>
                                <p className="text-muted-foreground">Your review is awaiting approval to be published. Thank you!</p>
                            </div>
                            <Button onClick={handleCloseModal} variant="outline" className="mt-4 bg-transparent border-input">
                                Close
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    )
}
