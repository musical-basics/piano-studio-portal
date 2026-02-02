"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Search, Folder, File, FileText, Music, Loader2 } from "lucide-react"
import { getResources, type Resource } from "@/app/actions/resources"
import { Badge } from "@/components/ui/badge"

interface LibraryFileSelectorProps {
    onSelect: (file: { url: string; name: string; type: string; size: number }) => void
    trigger?: React.ReactNode
}

export function LibraryFileSelector({ onSelect, trigger }: LibraryFileSelectorProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [resources, setResources] = useState<Resource[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

    useEffect(() => {
        if (isOpen) {
            loadResources()
        }
    }, [isOpen])

    async function loadResources() {
        setIsLoading(true)
        try {
            const { resources: data, error } = await getResources()
            if (data) {
                setResources(data)
            } else if (error) {
                console.error("Failed to load resources:", error)
            }
        } catch (err) {
            console.error("Error loading resources:", err)
        } finally {
            setIsLoading(false)
        }
    }

    const filteredResources = resources.filter(resource => {
        const matchesSearch = resource.title.toLowerCase().includes(searchQuery.toLowerCase())
        const matchesCategory = selectedCategory ? resource.category === selectedCategory : true
        return matchesSearch && matchesCategory
    })

    const categories = Array.from(new Set(resources.map(r => r.category)))

    const handleSelect = (resource: Resource) => {
        onSelect({
            url: resource.file_url,
            name: resource.title, // Use title as name for better readability
            type: resource.file_type,
            size: 0 // We might not have size readily available, checking...
        })
        setIsOpen(false)
    }

    const getFileIcon = (type: string) => {
        if (type.includes('image')) return <FileText className="h-4 w-4 text-blue-500" />
        if (type.includes('pdf')) return <FileText className="h-4 w-4 text-red-500" />
        if (type.includes('audio')) return <Music className="h-4 w-4 text-purple-500" />
        return <File className="h-4 w-4 text-gray-500" />
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant="ghost" size="icon" title="Add from Library">
                        <Folder className="h-4 w-4" />
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="max-w-2xl h-[80vh] flex flex-col p-0 gap-0">
                <DialogHeader className="p-6 pb-2">
                    <DialogTitle>Select from Library</DialogTitle>
                </DialogHeader>

                <div className="px-6 py-2 gap-4 flex flex-col border-b bg-muted/20">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search resources..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 bg-background"
                        />
                    </div>
                    <div className="flex gap-2 pb-2 overflow-x-auto">
                        <Badge
                            variant={selectedCategory === null ? "default" : "outline"}
                            className="cursor-pointer whitespace-nowrap"
                            onClick={() => setSelectedCategory(null)}
                        >
                            All
                        </Badge>
                        {categories.map(cat => (
                            <Badge
                                key={cat}
                                variant={selectedCategory === cat ? "default" : "outline"}
                                className="cursor-pointer whitespace-nowrap"
                                onClick={() => setSelectedCategory(cat)}
                            >
                                {cat}
                            </Badge>
                        ))}
                    </div>
                </div>

                <ScrollArea className="flex-1 p-6">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-40">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : filteredResources.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Folder className="h-12 w-12 mx-auto mb-3 opacity-20" />
                            <p>No resources found</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {filteredResources.map((resource) => (
                                <button
                                    key={resource.id}
                                    onClick={() => handleSelect(resource)}
                                    className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 hover:border-accent transition-all text-left group"
                                >
                                    <div className="h-10 w-10 shrink-0 rounded-lg bg-muted flex items-center justify-center group-hover:bg-background transition-colors">
                                        {getFileIcon(resource.file_type)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm truncate">{resource.title}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded-full bg-muted">
                                                {resource.category}
                                            </span>
                                            {resource.description && (
                                                <p className="text-xs text-muted-foreground truncate max-w-[120px]">
                                                    {resource.description}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </DialogContent>
        </Dialog>
    )
}
