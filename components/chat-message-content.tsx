"use client"

import { useMemo } from "react"

/**
 * Message body rendering shared by the student panel, the floating widget and
 * the admin chat.
 *
 * Messages are stored as plain text, so a pasted link used to render as dead
 * text you had to select and copy. This turns links into real anchors and, for
 * the handful of sites a piano studio actually trades links for, embeds the
 * player inline so a practice video plays without leaving the portal.
 *
 * Only http/https (and mailto:) ever become anchors — a `javascript:` or `data:`
 * URL in a message stays inert text.
 */

// Matches bare URLs, www-prefixed hosts, and email addresses. Parentheses are
// allowed inside a URL (Wikipedia article titles use them) and unbalanced ones
// are trimmed back afterwards, along with trailing sentence punctuation, so
// "see https://x.com/a." doesn't swallow the full stop.
const LINK_PATTERN =
    /(https?:\/\/[^\s<>]+|www\.[^\s<>]+|[^\s<>()@]+@[^\s<>()@]+\.[a-z]{2,})/gi

const TRAILING_PUNCTUATION = /[.,;:!?'"]+$/

/** Balance trailing parens: keep the ")" in a wiki-style URL, drop a wrapping one. */
function trimTrailing(raw: string): { url: string; tail: string } {
    let url = raw
    let tail = ""

    const punct = url.match(TRAILING_PUNCTUATION)
    if (punct) {
        tail = punct[0] + tail
        url = url.slice(0, -punct[0].length)
    }

    while (url.endsWith(")") && (url.match(/\)/g)?.length ?? 0) > (url.match(/\(/g)?.length ?? 0)) {
        tail = ")" + tail
        url = url.slice(0, -1)
    }

    return { url, tail }
}

type Token =
    | { kind: "text"; value: string }
    | { kind: "link"; href: string; label: string }
    | { kind: "email"; href: string; label: string }

function tokenize(text: string): Token[] {
    const tokens: Token[] = []
    let lastIndex = 0

    // A fresh regex per call: the global flag makes lastIndex stateful.
    const pattern = new RegExp(LINK_PATTERN.source, "gi")
    let match: RegExpExecArray | null

    while ((match = pattern.exec(text)) !== null) {
        const raw = match[0]
        const { url, tail } = trimTrailing(raw)

        if (!url) continue

        if (match.index > lastIndex) {
            tokens.push({ kind: "text", value: text.slice(lastIndex, match.index) })
        }

        if (url.includes("@") && !url.includes("/")) {
            tokens.push({ kind: "email", href: `mailto:${url}`, label: url })
        } else {
            const href = url.startsWith("http") ? url : `https://${url}`
            tokens.push({ kind: "link", href, label: url })
        }

        if (tail) tokens.push({ kind: "text", value: tail })
        lastIndex = match.index + raw.length
    }

    if (lastIndex < text.length) {
        tokens.push({ kind: "text", value: text.slice(lastIndex) })
    }

    return tokens
}

export interface MediaEmbed {
    provider: "youtube" | "vimeo"
    src: string
    title: string
}

/** Recognize the video links worth playing in place. Returns null for anything else. */
export function detectEmbed(href: string): MediaEmbed | null {
    let url: URL
    try {
        url = new URL(href)
    } catch {
        return null
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return null

    const host = url.hostname.replace(/^www\./, "").toLowerCase()

    if (host === "youtu.be") {
        const id = url.pathname.slice(1).split("/")[0]
        if (!/^[\w-]{6,}$/.test(id)) return null
        return { provider: "youtube", src: `https://www.youtube.com/embed/${id}`, title: "YouTube video" }
    }

    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
        if (url.pathname === "/watch") {
            const id = url.searchParams.get("v")
            if (!id || !/^[\w-]{6,}$/.test(id)) return null
            return { provider: "youtube", src: `https://www.youtube.com/embed/${id}`, title: "YouTube video" }
        }
        const shortsOrEmbed = url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/)
        if (shortsOrEmbed) {
            return {
                provider: "youtube",
                src: `https://www.youtube.com/embed/${shortsOrEmbed[1]}`,
                title: "YouTube video",
            }
        }
        return null
    }

    if (host === "vimeo.com" || host === "player.vimeo.com") {
        const id = url.pathname.match(/(\d{6,})/)?.[1]
        if (!id) return null
        return { provider: "vimeo", src: `https://player.vimeo.com/video/${id}`, title: "Vimeo video" }
    }

    return null
}

interface MessageContentProps {
    content: string
    /** Styles links for a dark (own-message) bubble instead of a light one. */
    onDark?: boolean
    /** Suppress the inline video player; links still render as links. */
    noEmbeds?: boolean
    className?: string
}

export function MessageContent({ content, onDark = false, noEmbeds = false, className }: MessageContentProps) {
    const tokens = useMemo(() => tokenize(content), [content])

    // At most one player per message: a wall of iframes in a chat bubble is worse
    // than the links themselves.
    const embed = useMemo(() => {
        if (noEmbeds) return null
        for (const token of tokens) {
            if (token.kind !== "link") continue
            const found = detectEmbed(token.href)
            if (found) return found
        }
        return null
    }, [tokens, noEmbeds])

    const linkClass = onDark
        ? "underline underline-offset-2 decoration-primary-foreground/50 hover:decoration-primary-foreground break-words"
        : "underline underline-offset-2 text-primary decoration-primary/40 hover:decoration-primary break-words"

    return (
        <>
            <p className={`text-sm leading-relaxed whitespace-pre-wrap break-words ${className || ""}`}>
                {tokens.map((token, i) => {
                    if (token.kind === "text") return <span key={i}>{token.value}</span>
                    return (
                        <a
                            key={i}
                            href={token.href}
                            target={token.kind === "link" ? "_blank" : undefined}
                            rel="noopener noreferrer nofollow"
                            className={linkClass}
                        >
                            {token.label}
                        </a>
                    )
                })}
            </p>

            {embed && (
                <div className="mt-2 rounded-lg overflow-hidden border bg-black/5 aspect-video max-w-[320px]">
                    <iframe
                        src={embed.src}
                        title={embed.title}
                        loading="lazy"
                        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        referrerPolicy="strict-origin-when-cross-origin"
                        allowFullScreen
                        className="w-full h-full border-0"
                    />
                </div>
            )}
        </>
    )
}
