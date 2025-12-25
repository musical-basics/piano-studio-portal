"use client"

import { useState } from "react"
import { Star } from "lucide-react"

interface StarRatingProps {
    rating: number
    onRatingChange?: (rating: number) => void
    interactive?: boolean
}

export function StarRating({
    rating,
    onRatingChange,
    interactive = false,
}: StarRatingProps) {
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
                        className={`h-5 w-5 transition-colors ${star <= (hoverRating || rating) ? "fill-foreground text-foreground" : "text-muted-foreground/30"
                            }`}
                    />
                </button>
            ))}
        </div>
    )
}
