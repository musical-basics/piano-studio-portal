'use client'

import { useState, useRef, useCallback } from 'react'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/hooks/use-toast'
import {
    Plus,
    Upload,
    MoreHorizontal,
    Pencil,
    Trash2,
    FileText,
    Music,
    Loader2,
    Users,
    ArrowLeft,
    CheckSquare,
    Square,
} from 'lucide-react'
import Link from 'next/link'
import {
    Resource,
    ResourceCategory,
    createResource,
    updateResource,
    updateResourceAssignments,
    deleteResource,
    uploadLibraryFile,
    getResourceWithAssignments,
} from '@/app/actions/resources'

interface Student {
    id: string
    name: string
    email: string
}

interface LibraryManagerProps {
    initialResources: Resource[]
    students: Student[]
}

const CATEGORIES: ResourceCategory[] = ['Sheet Music', 'Theory', 'Scales', 'Exercises', 'Recording']

const categoryColors: Record<ResourceCategory, string> = {
    'Sheet Music': 'bg-blue-100 text-blue-800',
    'Theory': 'bg-purple-100 text-purple-800',
    'Scales': 'bg-green-100 text-green-800',
    'Exercises': 'bg-orange-100 text-orange-800',
    'Recording': 'bg-pink-100 text-pink-800',
}

export function LibraryManager({ initialResources, students }: LibraryManagerProps) {
    const { toast } = useToast()
    const [resources, setResources] = useState<Resource[]>(initialResources)
    const [isLoading, setIsLoading] = useState(false)

    // Upload Modal State
    const [showUploadModal, setShowUploadModal] = useState(false)
    const [uploadFile, setUploadFile] = useState<File | null>(null)
    const [uploadTitle, setUploadTitle] = useState('')
    const [uploadCategory, setUploadCategory] = useState<ResourceCategory>('Sheet Music')
    const [uploadDescription, setUploadDescription] = useState('')
    const [selectedStudents, setSelectedStudents] = useState<string[]>([])
    const [isDragging, setIsDragging] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Edit Modal State
    const [showEditModal, setShowEditModal] = useState(false)
    const [editingResource, setEditingResource] = useState<Resource | null>(null)
    const [editTitle, setEditTitle] = useState('')
    const [editCategory, setEditCategory] = useState<ResourceCategory>('Sheet Music')
    const [editDescription, setEditDescription] = useState('')
    const [editSelectedStudents, setEditSelectedStudents] = useState<string[]>([])
    const [replaceFile, setReplaceFile] = useState<File | null>(null)
    const editFileInputRef = useRef<HTMLInputElement>(null)

    // File handling
    const handleFileDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
        const file = e.dataTransfer.files[0]
        if (file) {
            setUploadFile(file)
            setUploadTitle(file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' '))
        }
    }, [])

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            setUploadFile(file)
            setUploadTitle(file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' '))
        }
    }, [])

    const handleReplaceFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            setReplaceFile(file)
        }
    }, [])

    // Upload resource
    const handleUpload = async () => {
        if (!uploadFile || !uploadTitle) {
            toast({ variant: 'destructive', title: 'Error', description: 'Please provide a file and title' })
            return
        }

        setIsLoading(true)

        try {
            // Upload file first
            const formData = new FormData()
            formData.append('file', uploadFile)
            const { url, error: uploadError } = await uploadLibraryFile(formData)

            if (uploadError || !url) {
                throw new Error(uploadError || 'Failed to upload file')
            }

            // Create resource
            const fileType = uploadFile.name.split('.').pop()?.toLowerCase() || 'pdf'
            const result = await createResource(
                {
                    title: uploadTitle,
                    description: uploadDescription || undefined,
                    category: uploadCategory,
                    file_url: url,
                    file_type: fileType,
                },
                selectedStudents
            )

            if (!result.success) {
                throw new Error(result.error || 'Failed to create resource')
            }

            toast({ title: 'Success', description: 'Resource uploaded successfully' })

            // Refresh resources list
            setResources(prev => [{
                id: result.resourceId!,
                title: uploadTitle,
                description: uploadDescription || null,
                category: uploadCategory,
                file_url: url,
                file_type: fileType,
                created_at: new Date().toISOString(),
                assignment_count: selectedStudents.length
            }, ...prev])

            // Reset form
            setShowUploadModal(false)
            setUploadFile(null)
            setUploadTitle('')
            setUploadCategory('Sheet Music')
            setUploadDescription('')
            setSelectedStudents([])
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message })
        } finally {
            setIsLoading(false)
        }
    }

    // Open edit modal
    const handleEdit = async (resource: Resource) => {
        setIsLoading(true)
        setEditingResource(resource)
        setEditTitle(resource.title)
        setEditCategory(resource.category)
        setEditDescription(resource.description || '')
        setReplaceFile(null)

        // Fetch current assignments
        const { resource: fullResource } = await getResourceWithAssignments(resource.id)
        if (fullResource) {
            setEditSelectedStudents(fullResource.assigned_students.map(s => s.id))
        }

        setIsLoading(false)
        setShowEditModal(true)
    }

    // Save edit
    const handleSaveEdit = async () => {
        if (!editingResource) return

        setIsLoading(true)

        try {
            // Handle file replacement if needed
            let newFileUrl = editingResource.file_url
            let newFileType = editingResource.file_type

            if (replaceFile) {
                const formData = new FormData()
                formData.append('file', replaceFile)
                const { url, error: uploadError } = await uploadLibraryFile(formData)

                if (uploadError || !url) {
                    throw new Error(uploadError || 'Failed to upload new file')
                }

                newFileUrl = url
                newFileType = replaceFile.name.split('.').pop()?.toLowerCase() || 'pdf'
            }

            // Update resource metadata
            const updateResult = await updateResource(editingResource.id, {
                title: editTitle,
                description: editDescription || undefined,
                category: editCategory,
                file_url: newFileUrl,
                file_type: newFileType,
            })

            if (!updateResult.success) {
                throw new Error(updateResult.error || 'Failed to update resource')
            }

            // Update assignments
            const assignResult = await updateResourceAssignments(editingResource.id, editSelectedStudents)

            if (!assignResult.success) {
                throw new Error(assignResult.error || 'Failed to update assignments')
            }

            toast({ title: 'Success', description: 'Resource updated successfully' })

            // Update local state
            setResources(prev => prev.map(r =>
                r.id === editingResource.id
                    ? {
                        ...r,
                        title: editTitle,
                        description: editDescription || null,
                        category: editCategory,
                        file_url: newFileUrl,
                        file_type: newFileType,
                        assignment_count: editSelectedStudents.length
                    }
                    : r
            ))

            setShowEditModal(false)
            setEditingResource(null)
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message })
        } finally {
            setIsLoading(false)
        }
    }

    // Delete resource
    const handleDelete = async (resource: Resource) => {
        if (!confirm(`Delete "${resource.title}"? This will remove it from all students.`)) return

        setIsLoading(true)

        const result = await deleteResource(resource.id)

        if (result.success) {
            toast({ title: 'Deleted', description: 'Resource removed successfully' })
            setResources(prev => prev.filter(r => r.id !== resource.id))
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error })
        }

        setIsLoading(false)
    }

    // Toggle student selection
    const toggleStudent = (studentId: string, selectedList: string[], setSelectedList: (ids: string[]) => void) => {
        if (selectedList.includes(studentId)) {
            setSelectedList(selectedList.filter(id => id !== studentId))
        } else {
            setSelectedList([...selectedList, studentId])
        }
    }

    // Select all students
    const selectAllStudents = (selectedList: string[], setSelectedList: (ids: string[]) => void) => {
        if (selectedList.length === students.length) {
            setSelectedList([])
        } else {
            setSelectedList(students.map(s => s.id))
        }
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/admin">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-serif font-bold">Resource Library</h1>
                        <p className="text-muted-foreground">Manage practice materials for your students</p>
                    </div>
                </div>
                <Button onClick={() => setShowUploadModal(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Upload Resource
                </Button>
            </div>

            {/* Resources Table */}
            <div className="border rounded-lg">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Title</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Assigned To</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {resources.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                                    No resources yet. Click "Upload Resource" to add your first one.
                                </TableCell>
                            </TableRow>
                        ) : (
                            resources.map(resource => (
                                <TableRow key={resource.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            {resource.file_type === 'mp3' ? (
                                                <Music className="h-4 w-4 text-muted-foreground" />
                                            ) : (
                                                <FileText className="h-4 w-4 text-muted-foreground" />
                                            )}
                                            <span className="font-medium">{resource.title}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="secondary" className={categoryColors[resource.category]}>
                                            {resource.category}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1 text-muted-foreground">
                                            <Users className="h-4 w-4" />
                                            <span>{resource.assignment_count || 0} students</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => handleEdit(resource)}>
                                                    <Pencil className="h-4 w-4 mr-2" />
                                                    Edit
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={() => handleDelete(resource)}
                                                    className="text-red-600"
                                                >
                                                    <Trash2 className="h-4 w-4 mr-2" />
                                                    Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Upload Modal */}
            <Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-serif">Upload Resource</DialogTitle>
                        <DialogDescription>
                            Add a new practice material to the library
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        {/* Drag & Drop Zone */}
                        <div
                            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
                                }`}
                            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={handleFileDrop}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf,.mp3,.wav,.png,.jpg,.jpeg"
                                className="hidden"
                                onChange={handleFileSelect}
                            />
                            {uploadFile ? (
                                <div className="flex items-center justify-center gap-2">
                                    <FileText className="h-6 w-6 text-primary" />
                                    <span className="font-medium">{uploadFile.name}</span>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                                    <p className="text-muted-foreground">
                                        Drag & drop a file here, or click to browse
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        PDF, MP3, WAV, PNG, JPG
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Title */}
                        <div className="space-y-2">
                            <Label htmlFor="title">Title</Label>
                            <Input
                                id="title"
                                value={uploadTitle}
                                onChange={(e) => setUploadTitle(e.target.value)}
                                placeholder="Resource title"
                            />
                        </div>

                        {/* Category */}
                        <div className="space-y-2">
                            <Label>Category</Label>
                            <Select value={uploadCategory} onValueChange={(v) => setUploadCategory(v as ResourceCategory)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {CATEGORIES.map(cat => (
                                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Description */}
                        <div className="space-y-2">
                            <Label htmlFor="description">Description (optional)</Label>
                            <Textarea
                                id="description"
                                value={uploadDescription}
                                onChange={(e) => setUploadDescription(e.target.value)}
                                placeholder="Brief description of this resource"
                                rows={2}
                            />
                        </div>

                        {/* Student Assignment */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>Assign to Students</Label>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => selectAllStudents(selectedStudents, setSelectedStudents)}
                                >
                                    {selectedStudents.length === students.length ? 'Deselect All' : 'Select All'}
                                </Button>
                            </div>
                            <div className="border rounded-lg max-h-40 overflow-y-auto">
                                {students.map(student => (
                                    <div
                                        key={student.id}
                                        className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer"
                                        onClick={() => toggleStudent(student.id, selectedStudents, setSelectedStudents)}
                                    >
                                        {selectedStudents.includes(student.id) ? (
                                            <CheckSquare className="h-4 w-4 text-primary" />
                                        ) : (
                                            <Square className="h-4 w-4 text-muted-foreground" />
                                        )}
                                        <span>{student.name}</span>
                                    </div>
                                ))}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {selectedStudents.length} student(s) selected
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-3 justify-end">
                        <Button variant="outline" onClick={() => setShowUploadModal(false)} disabled={isLoading}>
                            Cancel
                        </Button>
                        <Button onClick={handleUpload} disabled={isLoading || !uploadFile}>
                            {isLoading ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Uploading...
                                </>
                            ) : (
                                <>
                                    <Upload className="h-4 w-4 mr-2" />
                                    Upload
                                </>
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Edit Modal */}
            <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-serif">Edit Resource</DialogTitle>
                        <DialogDescription>
                            Update resource details and assignments
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        {/* Replace File */}
                        <div className="space-y-2">
                            <Label>Replace File (optional)</Label>
                            <div className="flex items-center gap-2">
                                <Input
                                    ref={editFileInputRef}
                                    type="file"
                                    accept=".pdf,.mp3,.wav,.png,.jpg,.jpeg"
                                    onChange={handleReplaceFileSelect}
                                    className="flex-1"
                                />
                            </div>
                            {replaceFile && (
                                <p className="text-sm text-green-600">
                                    New file: {replaceFile.name}
                                </p>
                            )}
                        </div>

                        {/* Title */}
                        <div className="space-y-2">
                            <Label htmlFor="edit-title">Title</Label>
                            <Input
                                id="edit-title"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                            />
                        </div>

                        {/* Category */}
                        <div className="space-y-2">
                            <Label>Category</Label>
                            <Select value={editCategory} onValueChange={(v) => setEditCategory(v as ResourceCategory)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {CATEGORIES.map(cat => (
                                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Description */}
                        <div className="space-y-2">
                            <Label htmlFor="edit-description">Description</Label>
                            <Textarea
                                id="edit-description"
                                value={editDescription}
                                onChange={(e) => setEditDescription(e.target.value)}
                                rows={2}
                            />
                        </div>

                        {/* Student Assignment */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>Assigned Students</Label>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => selectAllStudents(editSelectedStudents, setEditSelectedStudents)}
                                >
                                    {editSelectedStudents.length === students.length ? 'Deselect All' : 'Select All'}
                                </Button>
                            </div>
                            <div className="border rounded-lg max-h-40 overflow-y-auto">
                                {students.map(student => (
                                    <div
                                        key={student.id}
                                        className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer"
                                        onClick={() => toggleStudent(student.id, editSelectedStudents, setEditSelectedStudents)}
                                    >
                                        {editSelectedStudents.includes(student.id) ? (
                                            <CheckSquare className="h-4 w-4 text-primary" />
                                        ) : (
                                            <Square className="h-4 w-4 text-muted-foreground" />
                                        )}
                                        <span>{student.name}</span>
                                    </div>
                                ))}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {editSelectedStudents.length} student(s) selected
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-3 justify-end">
                        <Button variant="outline" onClick={() => setShowEditModal(false)} disabled={isLoading}>
                            Cancel
                        </Button>
                        <Button onClick={handleSaveEdit} disabled={isLoading}>
                            {isLoading ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Pencil className="h-4 w-4 mr-2" />
                                    Save Changes
                                </>
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
