"use client"

import type React from "react"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Music, PenLine, Star, CheckCircle } from "lucide-react"

// Mock reviews data
const mockReviews = [
  {
    id: "1",
    name: "Emily C.",
    studentSince: "2023",
    rating: 5,
    text: "The credit system is brilliant! I travel for work and this is the only studio that accommodates my schedule without penalty. My technique has improved more in 6 months here than 2 years elsewhere.",
  },
  {
    id: "2",
    name: "Marcus J.",
    studentSince: "2022",
    rating: 5,
    text: "Professor Williams has completely transformed my understanding of jazz piano. The personalized lesson notes and video recordings are invaluable.",
  },
  {
    id: "3",
    name: "Jennifer L.",
    studentSince: "2021",
    rating: 5,
    text: "My daughter loves her lessons! The recorded sessions are invaluable for practice at home. The teacher strikes the perfect balance between challenging her and keeping it fun.",
  },
  {
    id: "4",
    name: "David K.",
    studentSince: "2024",
    rating: 5,
    text: "Professional, organized, and incredibly talented. The online portal with lesson notes and sheet music keeps everything in one place. This is how modern music education should work.",
  },
  {
    id: "5",
    name: "Sophie M.",
    studentSince: "2023",
    rating: 5,
    text: "I started as a complete beginner and now I'm playing Chopin! The structured approach and patient guidance made all the difference. Highly recommend for adult learners.",
  },
  {
    id: "6",
    name: "Robert T.",
    studentSince: "2022",
    rating: 5,
    text: "The Winter Recitals are such a highlight. It's wonderful to be part of a studio community that celebrates progress at every level.",
  },
  {
    id: "7",
    name: "Anna W.",
    studentSince: "2024",
    rating: 5,
    text: "Finally found a teacher who understands that adults have busy schedules. The flexibility here is unmatched.",
  },
  {
    id: "8",
    name: "Michael P.",
    studentSince: "2021",
    rating: 5,
    text: "Three years in and I'm still learning something new every lesson. The depth of knowledge and teaching skill is exceptional. Worth every penny.",
  },
  {
    id: "9",
    name: "Lisa H.",
    studentSince: "2023",
    rating: 5,
    text: "The theory workshops have completely changed how I approach music. I finally understand what I'm playing, not just how to play it.",
  },
]

// Star rating component
function StarRating({
  rating,
  onRatingChange,
  interactive = false,
}: {
  rating: number
  onRatingChange?: (rating: number) => void
  interactive?: boolean
}) {
  const [hoverRating, setHoverRating] = useState(0)

  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!interactive}
          onClick={() => interactive && onRatingChange?.(star)}
          onMouseEnter={() => interactive && setHoverRating(star)}
          onMouseLeave={() => interactive && setHoverRating(0)}
          className={interactive ? "cursor-pointer transition-transform hover:scale-110" : "cursor-default"}
        >
          <Star
            className={`h-5 w-5 transition-colors ${
              star <= (hoverRating || rating) ? "fill-foreground text-foreground" : "text-muted-foreground/30"
            }`}
          />
        </button>
      ))}
    </div>
  )
}

export default function ReviewsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    review: "",
    rating: 0,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500))

    setIsSubmitting(false)
    setIsSubmitted(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    // Reset form after modal closes
    setTimeout(() => {
      setIsSubmitted(false)
      setFormData({ name: "", review: "", rating: 0 })
    }, 300)
  }

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
            {mockReviews.map((review) => (
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
                    <Badge variant="secondary" className="text-xs font-normal">
                      Student since {review.studentSince}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Floating Action Button */}
      <Button
        onClick={() => setIsModalOpen(true)}
        className="fixed bottom-8 right-8 h-auto py-4 px-6 rounded-full shadow-xl hover:shadow-2xl hover:scale-105 transition-all duration-200 z-40 bg-foreground text-background hover:bg-foreground/90"
      >
        <PenLine className="h-5 w-5 mr-3 flex-shrink-0" />
        <span className="text-sm font-medium">Are you a student of Lionel's? Submit a review here!</span>
      </Button>

      {/* Submit Review Modal */}
      <Dialog open={isModalOpen} onOpenChange={handleCloseModal}>
        <DialogContent className="sm:max-w-md">
          {!isSubmitted ? (
            <>
              <DialogHeader>
                <DialogTitle className="font-serif text-2xl">Share Your Experience</DialogTitle>
                <DialogDescription>Your feedback helps others discover the studio.</DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-6 pt-4">
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
              <Button onClick={handleCloseModal} variant="outline" className="mt-4 bg-transparent">
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
