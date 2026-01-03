"use server"

import { createClient } from "@/lib/supabase/server"
import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

export async function submitInquiry(formData: FormData) {
    const supabase = await createClient()

    const name = formData.get("name") as string
    const email = formData.get("email") as string
    const phone = formData.get("phone") as string
    const experience = formData.get("experience") as string
    const goals = formData.get("goals") as string

    if (!name || !email || !experience || !goals) {
        return { success: false, error: "Missing required fields" }
    }

    try {
        // 1. Insert into database
        const { error: dbError } = await supabase
            .from("inquiries")
            .insert({
                name,
                email,
                phone: phone || null,
                experience,
                goals,
                status: 'new'
            })

        if (dbError) {
            console.error("Database error:", dbError)
            return { success: false, error: "Failed to save inquiry" }
        }

        // 2. Get Admin Email (from profiles where role=admin)
        // We'll fallback to a default if not found
        const { data: admin } = await supabase
            .from("profiles")
            .select("email, studio_name, name")
            .eq("role", "admin")
            .limit(1)
            .single()

        const adminEmail = admin?.email || "lionel@musicalbasics.com" // Fallback to a safe email or env var
        const studioName = admin?.studio_name || "Lionel Yu Piano Studio"

        // 3. Send Email Notification to Admin
        await resend.emails.send({
            from: 'Piano Studio Inquiries <system@updates.musicalbasics.com>',
            to: adminEmail,
            subject: `New Lesson Inquiry: ${name}`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2>New Student Inquiry</h2>
                    <p>You have received a new inquiry from your website.</p>
                    
                    <div style="background-color: #f4f4f4; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <p><strong>Name:</strong> ${name}</p>
                        <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
                        <p><strong>Phone:</strong> ${phone || "Not provided"}</p>
                        <p><strong>Experience:</strong> ${experience}</p>
                        <hr style="border: 0; border-top: 1px solid #ddd; margin: 15px 0;">
                        <p><strong>Goals:</strong></p>
                        <p style="white-space: pre-wrap;">${goals}</p>
                    </div>

                    <p>
                        <a href="${process.env.NEXT_PUBLIC_APP_URL}/admin/inquiries" style="background-color: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                            View in Dashboard
                        </a>
                    </p>
                </div>
            `
        })

        // 4. Send Confirmation Email to Student (Optional - typically good practice)
        // For now, we skip to keep it simple as requested, but we could add it easily.

        return { success: true }

    } catch (error) {
        console.error("Inquiry submission error:", error)
        return { success: false, error: "Failed to submit inquiry" }
    }
}
