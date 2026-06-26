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

    // 1. Prepare the "System Note" (We can keep this for the human/AI context)
    const contextNotes = `
**Inquiry Source:** Website Form
**Phone:** ${phone || 'N/A'}
    `.trim() // Combined for AI context

    try {
        // 2. Create the Student (Lead)
        const { data: student, error: dbError } = await supabase
            .from("crm_students")
            .insert({
                full_name: name,
                email: email,
                // user snippet did not have phone column, it is in notes
                notes: contextNotes,
                status: 'Lead',
                tags: ['Website Inquiry'],
                country_code: 'US',
                // --- NEW: Save to the dedicated column ---
                experience_level: experience
            })
            .select()
            .single()

        if (dbError || !student) {
            console.error("Database error:", dbError)
            return { success: false, error: "Failed to save inquiry" }
        }

        // 3. Post the "Musical Goals" as the First Message (Visible in Chat)
        // This ensures your CRM sees a "message" to reply to!
        const { error: messageError } = await supabase
            .from('crm_messages')
            .insert({
                student_id: student.id,
                sender_role: 'student',
                body_text: goals, // "Hello, I'm trying to learn..."
                created_at: new Date().toISOString()
            })

        if (messageError) {
            console.error('Message Creation Error:', messageError)
            // We don't fail the whole request since the student was created
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

// Website form submissions land in crm_students (see submitInquiry above and
// trial-inquiries). The admin Inquiries tab reads those leads here, mapping the
// CRM shape onto the Inquiry type the UI expects.
export async function getInquiries() {
    const supabase = await createClient()

    const { data: leads, error } = await supabase
        .from("crm_students")
        .select("id, created_at, full_name, email, notes, experience_level, status, crm_messages(body_text, sender_role, created_at)")
        .order("created_at", { ascending: false })

    if (error) {
        console.error("Error fetching inquiries:", error)
        return { inquiries: [] }
    }

    const inquiries = (leads || []).map((lead: any) => {
        // Phone is stored inside the free-text notes ("**Phone:** ...").
        const phoneMatch = lead.notes?.match(/\*\*Phone:\*\*\s*(.+)/)
        const phone = phoneMatch ? phoneMatch[1].trim() : null

        // The prospect's goals are the first message they sent.
        const messages = (lead.crm_messages || [])
            .filter((m: any) => m.sender_role === 'student')
            .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        const goals = messages[0]?.body_text || lead.notes || ''

        return {
            id: lead.id,
            name: lead.full_name,
            email: lead.email || '',
            phone: phone === 'N/A' ? null : phone,
            experience: lead.experience_level || 'Not specified',
            goals,
            status: lead.status || 'Lead',
            created_at: lead.created_at,
        }
    })

    return { inquiries }
}

export async function updateInquiryStatus(id: string, status: string) {
    const supabase = await createClient()

    try {
        const { error } = await supabase
            .from("crm_students")
            .update({ status })
            .eq("id", id)

        if (error) throw error

        return { success: true }
    } catch (error) {
        console.error("Error updating inquiry status:", error)
        return { success: false, error: "Failed to update status" }
    }
}

/**
 * approveProspect
 * Approves a website lead as a prospective student: creates a real (restricted)
 * login account, flips the CRM lead to "Prospect", and emails the person their
 * temporary credentials so they can sign in and see the audition dashboard.
 */
export async function approveProspect(leadId: string) {
    const supabase = await createClient()

    // Only an authenticated admin may approve.
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }
    const { data: me } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
    if (me?.role !== 'admin') return { success: false, error: 'Not authorized' }

    // Load the lead.
    const { data: lead, error: leadError } = await supabase
        .from('crm_students')
        .select('id, full_name, email, status')
        .eq('id', leadId)
        .single()

    if (leadError || !lead) {
        return { success: false, error: 'Lead not found' }
    }
    if (!lead.email) {
        return { success: false, error: 'This lead has no email address on file' }
    }

    // Generate a temporary password (the prospect can reset it after first login).
    const tempPassword = `piano-${Math.random().toString(36).slice(2, 8)}${Math.floor(1000 + Math.random() * 9000)}`

    // Reuse createStudent with the prospect role to create the auth user + profile.
    const { createStudent } = await import('@/app/actions/users')
    const fd = new FormData()
    fd.set('name', lead.full_name)
    fd.set('email', lead.email)
    fd.set('role', 'prospect')
    fd.set('password', tempPassword)
    const result = await createStudent(fd)

    if ('error' in result && result.error) {
        return { success: false, error: result.error }
    }

    // Mark the lead as a prospect in the CRM.
    await supabase.from('crm_students').update({ status: 'Prospect' }).eq('id', leadId)

    // Email the prospect their login details.
    const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.musicalbasics.com'}/login`
    try {
        await resend.emails.send({
            from: 'Lionel Yu Piano Studio <system@updates.musicalbasics.com>',
            to: lead.email,
            subject: 'Your audition account is ready',
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2>Welcome, ${lead.full_name}!</h2>
                    <p>Thanks for your interest in lessons. I've set up an account for you so you can prepare for your audition.</p>
                    <p>Sign in to view the camera and Zoom setup instructions, see your audition meeting time, and message me directly.</p>
                    <div style="background-color: #f4f4f4; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <p><strong>Login:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
                        <p><strong>Email:</strong> ${lead.email}</p>
                        <p><strong>Temporary password:</strong> ${tempPassword}</p>
                    </div>
                    <p>Please change your password after signing in for the first time.</p>
                    <p>See you soon,<br/>Lionel</p>
                </div>
            `
        })
    } catch (emailError) {
        console.error('Prospect welcome email error:', emailError)
        // Account was created; surface a soft warning rather than failing.
        return { success: true, warning: 'Account created, but the welcome email failed to send.', tempPassword }
    }

    return { success: true, tempPassword }
}
