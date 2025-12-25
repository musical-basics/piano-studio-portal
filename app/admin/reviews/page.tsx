"use client"

import { useEffect, useState } from "react"
import { getAllReviews, updateReviewStatus, deleteReview } from "@/app/actions/reviews"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Trash2, CheckCircle, XCircle, ArrowLeft } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { StarRating } from "@/app/reviews/star-rating"
import Link from "next/link"

interface Review {
    id: string
    name: string
    rating: number
    text: string
    status: 'pending' | 'approved' | 'rejected'
    created_at: string
    student_id: string | null
    profiles?: {
        email?: string
    }
}

export default function AdminReviewsPage() {
    const [reviews, setReviews] = useState<Review[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const { toast } = useToast()

    const fetchReviews = async () => {
        setIsLoading(true)
        const result = await getAllReviews()
        if (result.error) {
            toast({
                variant: "destructive",
                title: "Error fetching reviews",
                description: result.error
            })
        } else {
            setReviews(result.data as any || [])
        }
        setIsLoading(false)
    }

    useEffect(() => {
        fetchReviews()
    }, [])

    const handleUpdateStatus = async (id: string, status: 'approved' | 'rejected') => {
        const result = await updateReviewStatus(id, status)
        if (result.error) {
            toast({
                variant: "destructive",
                title: "Update Failed",
                description: result.error
            })
        } else {
            toast({
                title: "Status Updated",
                description: `Review marked as ${status}`
            })
            fetchReviews()
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this review?")) return

        const result = await deleteReview(id)
        if (result.error) {
            toast({
                variant: "destructive",
                title: "Delete Failed",
                description: result.error
            })
        } else {
            toast({
                title: "Review Deleted",
                description: "The review has been permanently deleted."
            })
            fetchReviews()
        }
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'approved': return <Badge className="bg-green-600">Approved</Badge>
            case 'rejected': return <Badge variant="destructive">Rejected</Badge>
            default: return <Badge variant="secondary">Pending</Badge>
        }
    }

    return (
        <div className="container mx-auto px-4 py-8 max-w-7xl">
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-serif font-bold">Reviews Management</h1>
                    <p className="text-muted-foreground">Approve, reject, or delete student reviews.</p>
                </div>
                <Button variant="outline" asChild>
                    <Link href="/admin" className="gap-2">
                        <ArrowLeft className="h-4 w-4" />
                        Back to Dashboard
                    </Link>
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>All Reviews</CardTitle>
                    <CardDescription>
                        {reviews.length} reviews found
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="text-center py-10">Loading reviews...</div>
                    ) : reviews.length === 0 ? (
                        <div className="text-center py-10 text-muted-foreground">No reviews found.</div>
                    ) : (
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[150px]">Date</TableHead>
                                        <TableHead className="w-[150px]">Student</TableHead>
                                        <TableHead className="w-[100px]">Rating</TableHead>
                                        <TableHead>Review</TableHead>
                                        <TableHead className="w-[100px]">Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {reviews.map((review) => (
                                        <TableRow key={review.id}>
                                            <TableCell className="font-medium">
                                                {new Date(review.created_at).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{review.name}</span>
                                                    {review.profiles?.email && (
                                                        <span className="text-xs text-muted-foreground truncate max-w-[140px]" title={review.profiles.email}>
                                                            {review.profiles.email}
                                                        </span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <StarRating rating={review.rating} />
                                            </TableCell>
                                            <TableCell>
                                                <p className="max-w-[400px] truncate" title={review.text}>
                                                    "{review.text}"
                                                </p>
                                            </TableCell>
                                            <TableCell>
                                                {getStatusBadge(review.status)}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-2">
                                                    {review.status !== 'approved' && (
                                                        <Button size="icon" variant="outline" className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => handleUpdateStatus(review.id, 'approved')} title="Approve">
                                                            <CheckCircle className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                    {review.status !== 'rejected' && (
                                                        <Button size="icon" variant="outline" className="h-8 w-8 text-orange-600 hover:text-orange-700 hover:bg-orange-50" onClick={() => handleUpdateStatus(review.id, 'rejected')} title="Reject">
                                                            <XCircle className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => handleDelete(review.id)} title="Delete">
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
