"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function submitReview(formData: FormData) {
    const supabase = await createClient()

    const name = formData.get("name") as string
    const ratingStr = formData.get("rating") as string
    const text = formData.get("review") as string

    if (!name || !ratingStr || !text) {
        return { error: "Missing required fields" }
    }

    const rating = parseInt(ratingStr, 10)

    // Get current user (nullable)
    const { data: { user } } = await supabase.auth.getUser()

    const { error } = await supabase.from("reviews").insert({
        student_id: user?.id || null,
        name,
        rating,
        text,
        status: "pending",
    })

    if (error) {
        console.error("Error submitting review:", error)
        return { error: "Failed to submit review" }
    }

    return { success: true }
}

export async function getApprovedReviews() {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from("reviews")
        .select("*, profiles(created_at)")
        .eq("status", "approved")
        .order("created_at", { ascending: false })

    if (error) {
        console.error("Error fetching reviews:", error)
        return []
    }

    return data
}
