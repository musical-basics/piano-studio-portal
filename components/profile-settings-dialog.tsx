"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Clock, Copy, Save, User as UserIcon } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { updateProfileSettings } from "@/app/actions/users"
import type { Profile } from "@/lib/supabase/database.types"

interface ProfileSettingsDialogProps {
    profile: Profile
    open?: boolean
    onOpenChange?: (open: boolean) => void
    trigger?: React.ReactNode
}

type DayAvailability = {
    day: string
    enabled: boolean
    start: string
    end: string
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DEFAULT_START = "09:00"
const DEFAULT_END = "17:00"

export function ProfileSettingsDialog({ profile, open, onOpenChange, trigger }: ProfileSettingsDialogProps) {
    const { toast } = useToast()
    const [isOpen, setIsOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)

    // Controlled open state
    const show = open !== undefined ? open : isOpen
    const setShow = onOpenChange || setIsOpen

    // Form State
    const [name, setName] = useState(profile.name || "")
    const [studioName, setStudioName] = useState(profile.studio_name || "")
    const [email, setEmail] = useState(profile.email || "")
    const [password, setPassword] = useState("")
    const [timezone, setTimezone] = useState(profile.timezone as string || "UTC")
    const [availability, setAvailability] = useState<DayAvailability[]>([])

    // Initialize availability from profile or default
    useEffect(() => {
        if (profile.available_hours) {
            try {
                // Merge saved availability with all days to ensure complete list
                const saved = profile.available_hours as DayAvailability[]
                const merged = DAYS.map(day => {
                    const found = saved.find(d => d.day === day)
                    return found || { day, enabled: false, start: DEFAULT_START, end: DEFAULT_END }
                })
                setAvailability(merged)
            } catch (e) {
                console.error("Failed to parse availability", e)
                setDefaultAvailability()
            }
        } else {
            setDefaultAvailability()
        }
    }, [profile])


    const setDefaultAvailability = () => {
        setAvailability(DAYS.map(day => ({
            day,
            enabled: false,
            start: DEFAULT_START,
            end: DEFAULT_END
        })))
    }

    const handleAvailabilityChange = (index: number, field: keyof DayAvailability, value: any) => {
        const newAvailability = [...availability]
        newAvailability[index] = { ...newAvailability[index], [field]: value }
        setAvailability(newAvailability)
    }

    const copyToAll = (sourceIndex: number) => {
        const source = availability[sourceIndex]
        const newAvailability = availability.map(day => ({
            ...day,
            enabled: source.enabled,
            start: source.start,
            end: source.end
        }))
        setAvailability(newAvailability)
        toast({ title: "Copied!", description: `Copied ${source.day}'s schedule to all days.` })
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)

        const formData = new FormData()
        formData.append('name', name)
        formData.append('studioName', studioName)
        formData.append('email', email)
        if (password) formData.append('password', password)
        formData.append('timezone', timezone)
        formData.append('availableHours', JSON.stringify(availability))

        const result = await updateProfileSettings(formData)

        setIsLoading(false)

        if (result.error) {
            toast({
                variant: "destructive",
                title: "Error",
                description: result.error
            })
        } else {
            toast({
                title: "Settings Saved",
                description: "Your profile has been updated successfully."
            })
            setShow(false)
        }
    }

    return (
        <Dialog open={show} onOpenChange={setShow}>
            {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-serif">Profile Settings</DialogTitle>
                    <DialogDescription>
                        Update your personal information and teaching availability.
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="general" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="general">General Info</TabsTrigger>
                        <TabsTrigger value="availability">Availability</TabsTrigger>
                    </TabsList>

                    <form onSubmit={handleSubmit}>
                        <TabsContent value="general" className="space-y-4 py-4">
                            <div className="grid gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Full Name</Label>
                                    <Input
                                        id="name"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="studioName">Studio Name</Label>
                                    <Input
                                        id="studioName"
                                        placeholder="e.g. Lionel Yu Piano Studio"
                                        value={studioName}
                                        onChange={(e) => setStudioName(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email Address</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="password">Change Password</Label>
                                    <Input
                                        id="password"
                                        type="password"
                                        placeholder="Leave blank to keep current password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="timezone">Timezone</Label>
                                    <Select value={timezone} onValueChange={setTimezone}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select timezone" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="UTC">UTC</SelectItem>
                                            <SelectItem value="America/Los_Angeles">Pacific Time (Standard)</SelectItem>
                                            <SelectItem value="America/New_York">Eastern Time</SelectItem>
                                            <SelectItem value="Europe/London">London</SelectItem>
                                            {/* Add more as needed */}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="availability" className="space-y-4 py-4">
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-medium">Weekly Schedule</h3>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => copyToAll(0)}
                                    >
                                        <Copy className="h-4 w-4 mr-2" />
                                        Copy Mon to All
                                    </Button>
                                </div>

                                <div className="space-y-2">
                                    {availability.map((day, index) => (
                                        <div key={day.day} className="flex items-center gap-4 p-3 border rounded-lg bg-card">
                                            <Checkbox
                                                id={`day-${index}`}
                                                checked={day.enabled}
                                                onCheckedChange={(checked) => handleAvailabilityChange(index, 'enabled', checked)}
                                            />
                                            <Label htmlFor={`day-${index}`} className="w-24 font-medium cursor-pointer">
                                                {day.day}
                                            </Label>

                                            {day.enabled ? (
                                                <div className="flex items-center gap-2 flex-1">
                                                    <Input
                                                        type="time"
                                                        value={day.start}
                                                        onChange={(e) => handleAvailabilityChange(index, 'start', e.target.value)}
                                                        className="w-32"
                                                    />
                                                    <span className="text-muted-foreground">to</span>
                                                    <Input
                                                        type="time"
                                                        value={day.end}
                                                        onChange={(e) => handleAvailabilityChange(index, 'end', e.target.value)}
                                                        className="w-32"
                                                    />
                                                </div>
                                            ) : (
                                                <div className="flex-1 text-muted-foreground text-sm italic">
                                                    Unavailable
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </TabsContent>

                        <div className="flex justify-end pt-4 border-t mt-4">
                            <Button type="submit" disabled={isLoading} className="min-w-[120px]">
                                {isLoading ? (
                                    "Saving..."
                                ) : (
                                    <>
                                        <Save className="h-4 w-4 mr-2" />
                                        Save Changes
                                    </>
                                )}
                            </Button>
                        </div>
                    </form>
                </Tabs>
            </DialogContent>
        </Dialog>
    )
}
