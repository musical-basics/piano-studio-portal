"use client"

import { useState } from "react"
import { submitWaitlistSignup } from "@/app/actions/trial-inquiries"

/** The "Join the waitlist" form, styled like the main site's contact form. Signups land in the portal's Inquiries. */
export function WaitlistForm() {
    const [state, setState] = useState<"idle" | "sending" | "sent">("idle")
    const [error, setError] = useState<string | null>(null)

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        setState("sending")
        setError(null)
        const result = await submitWaitlistSignup({
            name: String(data.get("name") || ""),
            email: String(data.get("email") || ""),
            message: String(data.get("message") || ""),
            company: String(data.get("company") || ""),
        })
        if (result.success) {
            setState("sent")
        } else {
            setState("idle")
            setError(result.error || "Something went wrong. Please try again.")
        }
    }

    if (state === "sent") {
        return (
            <div className="mb-rte text-center" role="status">
                <h3>
                    <strong>Thank you!</strong>
                </h3>
                <p>You&apos;re on the waitlist. I&apos;ll be in touch by email.</p>
            </div>
        )
    }

    return (
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="mb-visually-hidden" htmlFor="waitlist-name">
                Name
            </label>
            <input id="waitlist-name" name="name" type="text" autoComplete="name" placeholder="Name" className="mb-field" />
            <label className="mb-visually-hidden" htmlFor="waitlist-email">
                Email
            </label>
            <input id="waitlist-email" name="email" type="email" autoComplete="email" required placeholder="Email *" className="mb-field" />
            <label className="mb-visually-hidden" htmlFor="waitlist-message">
                Tell me about yourself and your piano experience!
            </label>
            <textarea
                id="waitlist-message"
                name="message"
                rows={4}
                placeholder="Tell me about yourself and your piano experience!"
                className="mb-field md:col-span-2"
            />
            <div className="mb-visually-hidden" aria-hidden="true">
                <label htmlFor="waitlist-company">Company</label>
                <input id="waitlist-company" name="company" type="text" tabIndex={-1} autoComplete="off" />
            </div>
            {error ? (
                <p className="text-[rgb(180,35,24)] md:col-span-2" role="alert">
                    {error}
                </p>
            ) : null}
            <div className="mt-2 md:col-span-2">
                <button type="submit" className="mb-btn" disabled={state === "sending"}>
                    {state === "sending" ? "Sending..." : "Send"}
                </button>
            </div>
        </form>
    )
}
