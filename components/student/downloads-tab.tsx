"use client"

import { Download, FileText, Music } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { Resource } from "@/app/actions/resources"

/**
 * The old Downloads tab ("Practice Materials": the library files assigned to
 * the student), restored as it was before #1083 (commit a1ac702) for the
 * control half of the My music rollout (protocol 1.20, lib/rollouts.ts).
 * `onDownload` records the use for the Tests card; it never blocks the download.
 */

// Category badge colors
const categoryColors: Record<string, string> = {
    'Sheet Music': 'bg-blue-100 text-blue-800',
    'Theory': 'bg-purple-100 text-purple-800',
    'Scales': 'bg-green-100 text-green-800',
    'Exercises': 'bg-orange-100 text-orange-800',
    'Recording': 'bg-pink-100 text-pink-800',
}

export function DownloadsTab({ resources, onDownload }: { resources: Resource[]; onDownload?: () => void }) {
    const handleDownload = (resource: Resource) => {
        onDownload?.()
        // Open file in new tab for download
        window.open(resource.file_url, '_blank')
    }

    return (
        <div className="space-y-4" data-testid="downloads-tab">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-serif font-semibold">Practice Materials</h2>
                <Badge variant="secondary">{resources.length} files</Badge>
            </div>
            {resources.length === 0 ? (
                <Card className="border-2">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                        <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
                        <h3 className="font-semibold text-lg mb-2">No Practice Materials Yet</h3>
                        <p className="text-muted-foreground max-w-sm">
                            Your teacher will add practice materials here for you to download.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {resources.map((resource) => (
                        <Card key={resource.id} className="border-2 hover:shadow-md transition-shadow">
                            <CardContent className="flex items-center justify-between p-6">
                                <div className="flex items-center gap-4 flex-1">
                                    <div className="h-14 w-14 bg-primary/10 rounded-lg flex items-center justify-center">
                                        {resource.file_type === 'mp3' || resource.file_type === 'wav' ? (
                                            <Music className="h-6 w-6 text-primary" />
                                        ) : (
                                            <FileText className="h-6 w-6 text-primary" />
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-semibold mb-1">{resource.title}</h3>
                                        {resource.description && (
                                            <p className="text-sm text-muted-foreground mb-2">{resource.description}</p>
                                        )}
                                        {resource.student_note && (
                                            <div className="mt-2 mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-100 dark:border-blue-800">
                                                <p className="text-xs font-semibold uppercase tracking-wider text-blue-800 dark:text-blue-300 mb-1">Teacher&apos;s Instructions</p>
                                                <p className="text-sm text-blue-900 dark:text-blue-100 whitespace-pre-wrap">{resource.student_note}</p>
                                            </div>
                                        )}
                                        <Badge
                                            variant="secondary"
                                            className={`text-xs ${categoryColors[resource.category] || ''}`}
                                        >
                                            {resource.category}
                                        </Badge>
                                    </div>
                                </div>
                                <Button size="sm" onClick={() => handleDownload(resource)}>
                                    <Download className="h-4 w-4 mr-2" />
                                    Download
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}
