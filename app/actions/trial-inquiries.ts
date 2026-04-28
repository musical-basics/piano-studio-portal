"use server"

import { createClient } from "@/lib/supabase/server"
import { Resend } from "resend"
import { TrialInquiryAutoResponse } from "@/components/emails/trial-inquiry-autoresponse"

const resend = new Resend(process.env.RESEND_API_KEY)

interface TrialInquiryInput {
    name: string
    email: string
    ageConfirmed: boolean
    timezone: string
    availability: string[]
    experience: string
    goals: string
}

export async function submitTrialInquiry(input: TrialInquiryInput) {
    const supabase = await createClient()

    const { name, email, ageConfirmed, timezone, availability, experience, goals } = input

    if (!name || !email || !timezone || !experience || !goals) {
        return { success: false, error: "Missing required fields" }
    }

    if (!ageConfirmed) {
        return { success: false, error: "Age confirmation is required" }
    }

    if (availability.length === 0) {
        return { success: false, error: "Please select at least one availability window" }
    }

    const contextNotes = [
        `**Inquiry Source:** Trial Lesson Form`,
        `**Time Zone:** ${timezone}`,
        `**Availability:** ${availability.join(", ")}`,
        `**Age 12+ confirmed:** Yes`,
    ].join("\n")

    try {
        const { data: student, error: dbError } = await supabase
            .from("crm_students")
            .insert({
                full_name: name,
                email,
                notes: contextNotes,
                status: "Lead",
                tags: ["Trial Inquiry"],
                country_code: "US",
                experience_level: experience,
            })
            .select()
            .single()

        if (dbError || !student) {
            console.error("Database error:", dbError)
            return { success: false, error: "Failed to save inquiry" }
        }

        const { error: messageError } = await supabase
            .from("crm_messages")
            .insert({
                student_id: student.id,
                sender_role: "student",
                body_text: goals,
                created_at: new Date().toISOString(),
            })

        if (messageError) {
            console.error("Message creation error:", messageError)
        }

        const { data: admin } = await supabase
            .from("profiles")
            .select("email, studio_name")
            .eq("role", "admin")
            .limit(1)
            .single()

        const adminEmail = admin?.email || "lionel@musicalbasics.com"
        const studioName = admin?.studio_name || "Lionel Yu Piano Studio"

        await resend.emails.send({
            from: "Piano Studio Inquiries <system@updates.musicalbasics.com>",
            to: adminEmail,
            replyTo: email,
            subject: `Trial Lesson Request: ${name}`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2>New Trial Lesson Request</h2>
                    <p>A new trial inquiry came in from the website.</p>

                    <div style="background-color: #f4f4f4; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
                        <p><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>
                        <p><strong>Age 12+ confirmed:</strong> Yes</p>
                        <p><strong>Time zone:</strong> ${escapeHtml(timezone)}</p>
                        <p><strong>Availability:</strong> ${escapeHtml(availability.join(", "))}</p>
                        <p><strong>Experience level:</strong> ${escapeHtml(experience)}</p>
                        <hr style="border: 0; border-top: 1px solid #ddd; margin: 15px 0;">
                        <p><strong>Goals:</strong></p>
                        <p style="white-space: pre-wrap;">${escapeHtml(goals)}</p>
                    </div>

                    <p>
                        <a href="${process.env.NEXT_PUBLIC_APP_URL}/admin/inquiries" style="background-color: #111; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                            View in Dashboard
                        </a>
                    </p>
                </div>
            `,
        })

        const firstName = name.split(" ")[0] || name
        await resend.emails.send({
            from: `Lionel Yu <system@updates.musicalbasics.com>`,
            to: email,
            replyTo: adminEmail,
            subject: "Got it. I'll be in touch within 48 hours.",
            react: TrialInquiryAutoResponse({ firstName, studioName }),
        })

        return { success: true }
    } catch (error) {
        console.error("Trial inquiry submission error:", error)
        return { success: false, error: "Failed to submit inquiry" }
    }
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
}
