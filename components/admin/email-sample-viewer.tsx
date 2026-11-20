"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

// One email's samples on /admin/emails (#1003): a switch between its versions,
// the subject, the inbox preview line, and the email itself in a sandboxed
// iframe so its styles stay inside it. No scripts run in the frame.

export type ViewerSample = { label?: string; subject: string; preview?: string; html: string }

/** Links in the sample open in a new tab instead of inside the frame. */
function withNewTabLinks(html: string): string {
    const base = '<base target="_blank">'
    return /<head[^>]*>/i.test(html) ? html.replace(/<head([^>]*)>/i, `<head$1>${base}`) : base + html
}

function EmailFrame({ html, title }: { html: string; title: string }) {
    const ref = useRef<HTMLIFrameElement>(null)
    const [height, setHeight] = useState(480)
    const srcDoc = useMemo(() => withNewTabLinks(html), [html])

    const observer = useRef<ResizeObserver | null>(null)

    // Size the frame to the email's own height, so the page scrolls, not the
    // frame. Measured on the email's body: the document itself never reads
    // shorter than the frame, so it could only ever grow.
    const fit = useCallback(() => {
        const doc = ref.current?.contentDocument
        const body = doc?.body
        if (!body) return
        const style = doc.defaultView?.getComputedStyle(body)
        const margins = style ? parseFloat(style.marginTop) + parseFloat(style.marginBottom) : 0
        setHeight(Math.min(Math.max(Math.ceil(body.scrollHeight + margins), 120), 4000))
    }, [])

    // Fit when the email loads, and again whenever it reflows (a narrower window).
    const onLoad = useCallback(() => {
        fit()
        observer.current?.disconnect()
        const body = ref.current?.contentDocument?.body
        if (body && typeof ResizeObserver !== "undefined") {
            observer.current = new ResizeObserver(() => fit())
            observer.current.observe(body)
        }
    }, [fit])

    useEffect(() => {
        if (ref.current?.contentDocument?.readyState === "complete") onLoad()
        return () => observer.current?.disconnect()
    }, [srcDoc, onLoad])

    return (
        <iframe
            ref={ref}
            title={title}
            srcDoc={srcDoc}
            sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            onLoad={onLoad}
            style={{ height }}
            className="w-full rounded-md border bg-white"
        />
    )
}

export function EmailSampleViewer({ name, samples }: { name: string; samples: ViewerSample[] }) {
    const [index, setIndex] = useState(0)
    const sample = samples[index] ?? samples[0]
    if (!sample) return null

    return (
        <div className="space-y-3">
            {samples.length > 1 && (
                <div role="tablist" aria-label={`${name} versions`} className="flex flex-wrap gap-2">
                    {samples.map((s, i) => (
                        <button
                            key={s.label ?? i}
                            type="button"
                            role="tab"
                            aria-selected={i === index}
                            onClick={() => setIndex(i)}
                            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${i === index
                                ? "border-primary bg-primary text-primary-foreground"
                                : "bg-background text-muted-foreground hover:bg-muted"}`}
                        >
                            {s.label ?? `Version ${i + 1}`}
                        </button>
                    ))}
                </div>
            )}
            <div className="space-y-1 rounded-md bg-muted/50 p-3 text-sm">
                <p className="break-words">
                    <span className="text-muted-foreground">Subject: </span>
                    <span className="font-medium">{sample.subject}</span>
                </p>
                {sample.preview && sample.preview !== sample.subject && (
                    <p className="break-words">
                        <span className="text-muted-foreground">Inbox preview: </span>
                        {sample.preview}
                    </p>
                )}
            </div>
            <EmailFrame html={sample.html} title={`${name}${sample.label ? `, ${sample.label}` : ""}`} />
        </div>
    )
}
