"use client"

import { useState } from "react"
import { X, FileText, Download, DownloadCloud, Loader2, Image as ImageIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { MessageAttachment } from "@/lib/supabase/database.types"
import { downloadAllAttachments, downloadAttachment, toDownloadUrl } from "@/lib/download-attachment"

interface ChatAttachmentPreviewProps {
    attachments: MessageAttachment[]
    /** If true, shows remove buttons (for pre-send state) */
    editable?: boolean
    /** Callback when an attachment is removed (only used when editable=true) */
    onRemove?: (index: number) => void
    /** Compact mode for smaller display in message bubbles */
    compact?: boolean
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ChatAttachmentPreview({
    attachments,
    editable = false,
    onRemove,
    compact = false
}: ChatAttachmentPreviewProps) {
    if (!attachments || attachments.length === 0) return null

    return (
        <div className={compact ? '' : 'mt-2'}>
            <div className="flex flex-wrap gap-2">
            {attachments.map((attachment, index) => (
                <div key={`${attachment.url}-${index}`}>
                    {attachment.type === 'image' ? (
                        // Image Preview
                        <div className={`relative group ${compact ? 'max-w-[160px]' : 'max-w-[200px]'}`}>
                            <a
                                href={attachment.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block"
                            >
                                <img
                                    src={attachment.url}
                                    alt={attachment.name}
                                    className={`rounded-lg object-cover border transition-opacity hover:opacity-90 ${compact ? 'max-h-[120px]' : 'max-h-[150px]'
                                        }`}
                                />
                            </a>
                            {editable && onRemove ? (
                                <Button
                                    variant="destructive"
                                    size="icon"
                                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => onRemove(index)}
                                >
                                    <X className="h-3 w-3" />
                                </Button>
                            ) : (
                                // Images had no save affordance of their own; the
                                // link only opened them in a tab.
                                <button
                                    type="button"
                                    onClick={() => downloadAttachment(attachment.url, attachment.name)}
                                    title={`Download ${attachment.name}`}
                                    aria-label={`Download ${attachment.name}`}
                                    className="absolute bottom-1.5 right-1.5 h-7 w-7 rounded-full bg-background/90 border shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-foreground"
                                >
                                    <Download className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                    ) : (
                        // File Preview
                        <div
                            className={`relative group flex items-center gap-2 border rounded-lg bg-muted/50 ${compact ? 'px-2 py-1.5' : 'px-3 py-2'
                                }`}
                        >
                            <div className={`shrink-0 ${compact ? 'text-muted-foreground' : 'text-primary'}`}>
                                <FileText className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <a
                                    href={attachment.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`block font-medium truncate hover:underline ${compact ? 'text-xs max-w-[100px]' : 'text-sm max-w-[140px]'
                                        }`}
                                    title={attachment.name}
                                >
                                    {attachment.name}
                                </a>
                                {!compact && (
                                    <p className="text-xs text-muted-foreground">
                                        {formatFileSize(attachment.size)}
                                    </p>
                                )}
                            </div>
                            {editable && onRemove ? (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 shrink-0"
                                    onClick={() => onRemove(index)}
                                >
                                    <X className="h-3 w-3" />
                                </Button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => downloadAttachment(attachment.url, attachment.name)}
                                    title={`Download ${attachment.name}`}
                                    aria-label={`Download ${attachment.name}`}
                                    className="shrink-0 text-muted-foreground hover:text-foreground"
                                >
                                    <Download className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
                                </button>
                            )}
                        </div>
                    )}
                </div>
            ))}
            </div>

            {/* One click to save the whole set. Files are fetched and saved one
                at a time; see lib/download-attachment.ts for why a plain
                <a download> can't do this across origins. */}
            {!editable && attachments.length > 1 && (
                <DownloadAllButton attachments={attachments} compact={compact} />
            )}
        </div>
    )
}

/**
 * "Download all" affordance for a message carrying more than one attachment.
 *
 * Shows live progress because saving happens file by file, and reports how many
 * failed rather than pretending a partial batch succeeded.
 */
function DownloadAllButton({
    attachments,
    compact,
}: {
    attachments: MessageAttachment[]
    compact: boolean
}) {
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
    const [error, setError] = useState<string | null>(null)

    const isDownloading = progress !== null

    const handleClick = async () => {
        if (isDownloading) return
        setError(null)
        setProgress({ done: 0, total: attachments.length })

        const { failed } = await downloadAllAttachments(
            attachments.map((a) => ({ url: a.url, name: a.name })),
            (done, total) => setProgress({ done, total }),
        )

        setProgress(null)
        if (failed > 0) {
            setError(`${failed} of ${attachments.length} file${failed === 1 ? '' : 's'} could not be downloaded`)
        }
    }

    return (
        <div className="mt-2">
            <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleClick}
                disabled={isDownloading}
                className={compact ? 'h-7 px-2 text-xs' : 'h-8'}
            >
                {isDownloading ? (
                    <>
                        <Loader2 className={`animate-spin mr-1.5 ${compact ? 'h-3 w-3' : 'h-3.5 w-3.5'}`} />
                        Downloading {progress.done} of {progress.total}...
                    </>
                ) : (
                    <>
                        <DownloadCloud className={`mr-1.5 ${compact ? 'h-3 w-3' : 'h-3.5 w-3.5'}`} />
                        Download all ({attachments.length})
                    </>
                )}
            </Button>
            {error && <p className="text-xs text-destructive mt-1">{error}</p>}
        </div>
    )
}

export interface PendingAttachment {
    id?: string
    file?: File
    libraryFile?: { url: string; name: string; type: string; size: number }
    preview?: string // For image previews (data URL)
    uploading?: boolean
}

interface ChatPendingAttachmentsProps {
    attachments: PendingAttachment[]
    onRemove: (index: number) => void
}

/** Preview component for attachments that are pending (not yet uploaded/sent) */
export function ChatPendingAttachments({
    attachments,
    onRemove
}: ChatPendingAttachmentsProps) {
    if (!attachments || attachments.length === 0) return null

    return (
        <div className="flex flex-wrap gap-2 p-2 border-t bg-muted/30">
            {attachments.map((attachment, index) => (
                <div key={`pending-${index}`} className="relative group">
                    {attachment.preview ? (
                        // Image with preview
                        <div className="relative">
                            <img
                                src={attachment.preview}
                                alt={attachment.file?.name || attachment.libraryFile?.name || 'Attachment'}
                                className={`h-16 w-16 object-cover rounded-lg border ${attachment.uploading ? 'opacity-50' : ''
                                    }`}
                            />
                            {attachment.uploading && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                </div>
                            )}
                        </div>
                    ) : (
                        // File without preview
                        <div
                            className={`flex items-center gap-2 px-2 py-1.5 border rounded-lg bg-background ${attachment.uploading ? 'opacity-50' : ''
                                }`}
                        >
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs truncate max-w-[80px]">
                                {attachment.file?.name || attachment.libraryFile?.name || 'Unknown file'}
                            </span>
                            {attachment.uploading && (
                                <div className="h-3 w-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            )}
                        </div>
                    )}
                    {!attachment.uploading && (
                        <Button
                            variant="destructive"
                            size="icon"
                            className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => onRemove(index)}
                        >
                            <X className="h-3 w-3" />
                        </Button>
                    )}
                </div>
            ))}
        </div>
    )
}
