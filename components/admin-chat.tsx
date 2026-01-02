"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Send, Music, User, Search, Loader2, Paperclip } from "lucide-react"
import { sendMessage, getConversation, markMessagesAsRead, getStudentsWithMessages, uploadChatAttachment } from "@/app/messages/actions"
import type { Message, Profile, MessageAttachment } from "@/lib/supabase/database.types"
import { ChatAttachmentPreview, ChatPendingAttachments } from "@/components/chat-attachment-preview"

type StudentWithMessages = Profile & {
  lastMessage: Message | null
  unreadCount: number
}

interface AdminChatProps {
  initialStudentId?: string | null
  onClearInitialStudent?: () => void
}

export function AdminChat({ initialStudentId, onClearInitialStudent }: AdminChatProps) {
  const [students, setStudents] = useState<StudentWithMessages[]>([])
  const [selectedStudent, setSelectedStudent] = useState<StudentWithMessages | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [searchQuery, setSearchQuery] = useState("")

  // Loading states
  const [isLoadingStudents, setIsLoadingStudents] = useState(true)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [isSending, setIsSending] = useState(false)

  // Attachment states
  const [pendingAttachments, setPendingAttachments] = useState<{ file: File; preview?: string; uploading?: boolean }[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    // Small timeout ensures DOM is updated before scrolling
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, 100)
  }

  // 1. Load students on mount
  useEffect(() => {
    async function loadStudents() {
      setIsLoadingStudents(true)
      try {
        const { students: studentData } = await getStudentsWithMessages()
        setStudents(studentData || [])
      } catch (error) {
        console.error("Failed to load students", error)
      } finally {
        setIsLoadingStudents(false)
      }
    }
    loadStudents()
  }, [])

  // Handle initialStudentId logic
  useEffect(() => {
    if (initialStudentId && students.length > 0) {
      const studentToSelect = students.find(s => s.id === initialStudentId)
      if (studentToSelect) {
        setSelectedStudent(studentToSelect)
        // Clear the initial ID from parent to prevent sticky state
        if (onClearInitialStudent) {
          onClearInitialStudent()
        }
      }
    }
  }, [initialStudentId, students, onClearInitialStudent])

  // 2. Load messages when student is selected
  useEffect(() => {
    if (!selectedStudent) return

    const studentId = selectedStudent.id

    async function loadMessages() {
      setIsLoadingMessages(true)
      try {
        const { messages: conversationMessages } = await getConversation(studentId)
        // CRITICAL FIX: Default to [] if null to prevent white screen crash
        setMessages(conversationMessages || [])
      } catch (error) {
        console.error("Failed to load conversation", error)
        setMessages([])
      } finally {
        setIsLoadingMessages(false)
        // Scroll to bottom after loading messages
        setTimeout(() => scrollToBottom(), 100)
      }

      // Mark as read in background
      await markMessagesAsRead(studentId)

      // Update local unread count immediately
      setStudents(prev => prev.map(s =>
        s.id === studentId ? { ...s, unreadCount: 0 } : s
      ))
    }

    loadMessages()
  }, [selectedStudent])

  // Removed auto-scroll useEffect triggered by polling

  // Poll for new messages
  useEffect(() => {
    if (!selectedStudent) return
    const interval = setInterval(async () => {
      const { messages: newMessages } = await getConversation(selectedStudent.id)
      if (newMessages) setMessages(newMessages)
    }, 5000)
    return () => clearInterval(interval)
  }, [selectedStudent])

  const handleSendMessage = async () => {
    if ((!newMessage.trim() && pendingAttachments.length === 0) || !selectedStudent) return

    const tempMessage = newMessage
    const tempAttachments = [...pendingAttachments]
    setNewMessage("")
    setPendingAttachments([])
    setIsSending(true)

    try {
      // Upload all pending attachments first
      const uploadedAttachments: MessageAttachment[] = []
      for (const pending of tempAttachments) {
        const formData = new FormData()
        formData.append('file', pending.file)
        const result = await uploadChatAttachment(formData)
        if (result.attachment) {
          uploadedAttachments.push(result.attachment)
        } else if (result.error) {
          console.error('Failed to upload attachment:', result.error)
        }
      }

      // Send message with attachments
      const result = await sendMessage(
        selectedStudent.id,
        tempMessage.trim() || (uploadedAttachments.length > 0 ? '📎 Attachment' : ''),
        uploadedAttachments.length > 0 ? uploadedAttachments : undefined
      )

      if (result.success && result.message) {
        setMessages(prev => [...prev, result.message!])
        setStudents(prev => prev.map(s =>
          s.id === selectedStudent.id
            ? { ...s, lastMessage: result.message! }
            : s
        ))
        // Scroll to newly sent message
        setTimeout(() => scrollToBottom(), 100)
      } else {
        setNewMessage(tempMessage)
        setPendingAttachments(tempAttachments)
        alert("Failed to send")
      }
    } catch (error) {
      console.error('Error sending message:', error)
      setNewMessage(tempMessage)
      setPendingAttachments(tempAttachments)
      alert("Failed to send")
    } finally {
      setIsSending(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const newAttachments = Array.from(files).map(file => {
      const isImage = file.type.startsWith('image/')
      return {
        file,
        preview: isImage ? URL.createObjectURL(file) : undefined,
        uploading: false
      }
    })

    setPendingAttachments(prev => [...prev, ...newAttachments].slice(0, 5)) // Max 5

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleRemoveAttachment = (index: number) => {
    setPendingAttachments(prev => {
      const attachment = prev[index]
      if (attachment?.preview) {
        URL.revokeObjectURL(attachment.preview)
      }
      return prev.filter((_, i) => i !== index)
    })
  }

  const filteredStudents = students.filter((student) =>
    (student.name || '').toLowerCase().includes(searchQuery.toLowerCase()),
  )
    .sort((a, b) => {
      // Get timestamps (default to 0 if no message exists)
      const timeA = a.lastMessage?.created_at ? new Date(a.lastMessage.created_at).getTime() : 0
      const timeB = b.lastMessage?.created_at ? new Date(b.lastMessage.created_at).getTime() : 0

      // Sort descending (newest first)
      return timeB - timeA
    })

  const totalUnread = students.reduce((acc, s) => acc + s.unreadCount, 0)
  const isFromAdmin = (message: Message) => selectedStudent ? message.sender_id !== selectedStudent.id : false

  // Format Date Logic
  const formatSidebarDate = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
      // Today: Show Time only
      return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    } else if (diffDays === 1) {
      return "Yesterday"
    } else if (diffDays < 7) {
      // This week: Show Day Name (e.g., "Mon")
      return date.toLocaleDateString("en-US", { weekday: "short" })
    } else {
      // Older: Show Date (e.g., "Dec 12")
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    }
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

    // Time options
    const timeOpts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" }

    // Today: "3:45 PM"
    if (diffDays === 0) {
      return date.toLocaleTimeString("en-US", timeOpts)
    }

    // Yesterday: "Yesterday 3:45 PM"
    if (diffDays === 1) {
      return `Yesterday ${date.toLocaleTimeString("en-US", timeOpts)}`
    }

    // Older: "Dec 8, 3:45 PM"
    return `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${date.toLocaleTimeString("en-US", timeOpts)}`
  }

  return (
    // REPLACED <Card> with standard <div> to fix flex layout issues
    <div className="h-[600px] flex items-stretch overflow-hidden border rounded-xl bg-background shadow-sm">

      {/* LEFT SIDEBAR - Explicit width and border */}
      <div className="w-[300px] md:w-[320px] flex flex-col border-r bg-muted/20 shrink-0">

        {/* Header */}
        <div className="p-4 border-b shrink-0 bg-background/50 backdrop-blur">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-serif font-semibold text-lg">Students</h3>
            {totalUnread > 0 && <Badge variant="destructive">{totalUnread} new</Badge>}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 bg-background"
            />
          </div>
        </div>

        {/* List - overflow-y-auto handles the scroll */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {isLoadingStudents ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filteredStudents.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">No students found</p>
          ) : (
            filteredStudents.map((student) => (
              <button
                key={student.id}
                onClick={() => setSelectedStudent(student)}
                className={`w-full p-3 rounded-lg text-left transition-all flex items-start gap-3 border ${selectedStudent?.id === student.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent border-transparent hover:bg-muted"
                  }`}
              >
                <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 border ${selectedStudent?.id === student.id ? "bg-primary-foreground/20 border-transparent" : "bg-background border-border"
                  }`}>
                  <User className={selectedStudent?.id === student.id ? "text-primary-foreground" : "text-muted-foreground"} size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-0.5">
                    {/* Name and Badge Group */}
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="font-medium truncate text-sm">
                        {student.name || 'Unknown'}
                      </span>
                      {student.unreadCount > 0 && selectedStudent?.id !== student.id && (
                        <Badge variant="destructive" className="h-5 px-1.5 text-[10px] rounded-full shrink-0">
                          {student.unreadCount}
                        </Badge>
                      )}
                    </div>

                    {/* Timestamp (New!) */}
                    {student.lastMessage && (
                      <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                        {formatSidebarDate(student.lastMessage.created_at)}
                      </span>
                    )}
                  </div>
                  <p className={`text-xs truncate mt-1 ${selectedStudent?.id === student.id ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                    {student.lastMessage?.content || "No messages"}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* RIGHT CHAT AREA */}
      <div className="flex-1 flex flex-col min-w-0 bg-background h-full">
        {selectedStudent ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b flex items-center gap-3 shrink-0 bg-background/80 backdrop-blur z-10 h-[72px]">
              <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-serif font-semibold leading-none">{selectedStudent.name}</h3>
                <p className="text-xs text-muted-foreground mt-1">{selectedStudent.email}</p>
              </div>
            </div>

            {/* Messages List - This is the flexible scrolling area */}
            <div className="flex-1 overflow-y-auto p-4 bg-muted/5 space-y-6">
              {isLoadingMessages ? (
                <div className="h-full flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50">
                  <Music className="h-12 w-12 mb-2" />
                  <p>No messages yet</p>
                  <p className="text-xs">Send a message to start the conversation.</p>
                </div>
              ) : (
                <>
                  {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${isFromAdmin(msg) ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl shadow-sm ${isFromAdmin(msg)
                        ? "bg-primary text-primary-foreground rounded-br-none"
                        : "bg-white border text-foreground rounded-bl-none"
                        }`}>
                        {/* The Message Text */}
                        {msg.content && msg.content !== '📎 Attachment' && (
                          <p className="text-sm leading-relaxed">{msg.content}</p>
                        )}

                        {/* Attachments */}
                        {msg.attachments && msg.attachments.length > 0 && (
                          <ChatAttachmentPreview attachments={msg.attachments} compact />
                        )}

                        {/* The Timestamp - Right aligned, small, slightly transparent */}
                        <p className={`text-[10px] text-right mt-1 ${isFromAdmin(msg) ? "text-primary-foreground/70" : "text-muted-foreground"
                          }`}>
                          {formatTimestamp(msg.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Input Area - Pinned to bottom */}
            <div className="border-t bg-background shrink-0">
              {/* Pending Attachments Preview */}
              {pendingAttachments.length > 0 && (
                <ChatPendingAttachments
                  attachments={pendingAttachments}
                  onRemove={handleRemoveAttachment}
                />
              )}

              <div className="p-4 flex gap-2 items-center">
                {/* Hidden File Input */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept="image/*,.pdf,.doc,.docx"
                  multiple
                  className="hidden"
                />

                {/* Attachment Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSending || pendingAttachments.length >= 5}
                  title="Add attachment"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>

                <Input
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !isSending && handleSendMessage()}
                  placeholder="Type a message..."
                  disabled={isSending}
                  className="flex-1"
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={(!newMessage.trim() && pendingAttachments.length === 0) || isSending}
                  size="icon"
                >
                  {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <div className="h-20 w-20 bg-muted rounded-full flex items-center justify-center mb-4">
              <Music className="h-10 w-10 opacity-20" />
            </div>
            <p className="font-medium">Select a student</p>
            <p className="text-sm">Choose a conversation from the sidebar to start messaging.</p>
          </div>
        )}
      </div>
    </div>
  )
}