
import { createClient } from '@/lib/supabase/server'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ShieldAlert } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export const dynamic = 'force-dynamic'

export default async function AuthLogsPage() {
    const supabase = await createClient()

    // Fetch logs (admin only policed by RLS / layout)
    const { data: logs, error } = await supabase
        .from('auth_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)

    if (error) {
        return (
            <div className="p-4 text-red-500">
                Failed to load logs: {error.message}
            </div>
        )
    }

    const formatTime = (isoString: string) => {
        return new Date(isoString).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit'
        })
    }

    const getStatusBadge = (status: string) => {
        if (status === 'success') return <Badge className="bg-green-600">Success</Badge>
        if (status === 'failure') return <Badge variant="destructive">Failure</Badge>
        return <Badge variant="outline">{status}</Badge>
    }

    const getEventBadge = (type: string) => {
        switch (type) {
            case 'login': return <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">Login</Badge>
            case 'failed_login': return <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">Failed Login</Badge>
            case 'reset_request': return <Badge variant="outline" className="border-yellow-200 bg-yellow-50 text-yellow-700">Reset Req</Badge>
            case 'reset_completed': return <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">Reset Done</Badge>
            default: return <Badge variant="secondary">{type}</Badge>
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center space-x-2">
                <ShieldAlert className="h-6 w-6 text-muted-foreground" />
                <h1 className="text-3xl font-bold tracking-tight">Login & Security Logs</h1>
            </div>

            <div className="flex justify-end">
                <Button variant="outline" asChild>
                    <Link href="/admin">
                        Back to Admin Dashboard
                    </Link>
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Recent Activity</CardTitle>
                    <CardDescription>
                        Showing the last 50 authentication events.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[180px]">Timestamp</TableHead>
                                <TableHead>User / Email</TableHead>
                                <TableHead>Event</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Details</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {logs?.map((log) => (
                                <TableRow key={log.id}>
                                    <TableCell className="font-mono text-xs text-muted-foreground">
                                        {formatTime(log.created_at)}
                                    </TableCell>
                                    <TableCell>{log.user_email}</TableCell>
                                    <TableCell>{getEventBadge(log.event_type)}</TableCell>
                                    <TableCell>{getStatusBadge(log.status)}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">
                                        {log.details || '-'}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {logs?.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                        No logs found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
