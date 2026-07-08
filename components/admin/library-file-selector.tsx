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
import { ScrollArea } from "@/components/ui/scroll-area"
import { Search, Folder, File, FileText, Music, Loader2, LayoutGrid, List } from "lucide-react"
import { getResources, type Resource } from "@/app/actions/resources"
import { Badge } from "@/components/ui/badge"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

type ViewMode = "grid" | "list"
type SortOption = "recent" | "title-asc" | "title-desc" | "category"

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
    { value: "recent", label: "Most recent" },
    { value: "title-asc", label: "Title (A–Z)" },
    { value: "title-desc", label: "Title (Z–A)" },
    { value: "category", label: "Category" },
]

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
    const [viewMode, setViewMode] = useState<ViewMode>("grid")
    const [sortBy, setSortBy] = useState<SortOption>("recent")

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

    const filteredResources = resources
        .filter(resource => {
            const matchesSearch = resource.title.toLowerCase().includes(searchQuery.toLowerCase())
            const matchesCategory = selectedCategory ? resource.category === selectedCategory : true
            return matchesSearch && matchesCategory
        })
        .sort((a, b) => {
            switch (sortBy) {
                case "title-asc":
                    return a.title.localeCompare(b.title)
                case "title-desc":
                    return b.title.localeCompare(a.title)
                case "category":
                    return a.category.localeCompare(b.category) || a.title.localeCompare(b.title)
                case "recent":
                default:
                    return b.created_at.localeCompare(a.created_at)
            }
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
                    <div className="flex items-center gap-2">
                        <div className="flex gap-2 pb-2 overflow-x-auto flex-1">
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

                        <div className="flex items-center gap-2 shrink-0 pb-2">
                            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                                <SelectTrigger className="h-8 w-[140px] bg-background text-xs">
                                    <SelectValue placeholder="Sort by" />
                                </SelectTrigger>
                                <SelectContent>
                                    {SORT_OPTIONS.map(opt => (
                                        <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <ToggleGroup
                                type="single"
                                value={viewMode}
                                onValueChange={(v) => { if (v) setViewMode(v as ViewMode) }}
                                className="shrink-0"
                            >
                                <ToggleGroupItem value="grid" aria-label="Grid view" className="h-8 w-8 p-0">
                                    <LayoutGrid className="h-4 w-4" />
                                </ToggleGroupItem>
                                <ToggleGroupItem value="list" aria-label="List view" className="h-8 w-8 p-0">
                                    <List className="h-4 w-4" />
                                </ToggleGroupItem>
                            </ToggleGroup>
                        </div>
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
                    ) : viewMode === "list" ? (
                        <div className="flex flex-col gap-1">
                            {filteredResources.map((resource) => (
                                <button
                                    key={resource.id}
                                    onClick={() => handleSelect(resource)}
                                    className="flex items-center gap-3 px-3 py-2 rounded-md border border-transparent bg-card hover:bg-accent/50 hover:border-accent transition-all text-left group"
                                >
                                    <div className="h-8 w-8 shrink-0 rounded-md bg-muted flex items-center justify-center group-hover:bg-background transition-colors">
                                        {getFileIcon(resource.file_type)}
                                    </div>
                                    <p className="font-medium text-sm truncate flex-1 min-w-0">{resource.title}</p>
                                    {resource.description && (
                                        <p className="hidden sm:block text-xs text-muted-foreground truncate max-w-[200px]">
                                            {resource.description}
                                        </p>
                                    )}
                                    <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded-full bg-muted whitespace-nowrap shrink-0">
                                        {resource.category}
                                    </span>
                                </button>
                            ))}
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
