"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Send, Music, User, Search, Loader2, Paperclip, ArrowLeft, Folder, Upload } from "lucide-react"
import { sendMessage, getStudentsWithMessages, uploadChatAttachment } from "@/app/messages/actions"
import type { Message, Profile, MessageAttachment } from "@/lib/supabase/database.types"
import { ChatAttachmentPreview, ChatPendingAttachments, type PendingAttachment } from "@/components/chat-attachment-preview"
import { DeletedMessageBubble } from "@/components/chat-message-delete"
import { MessageEditor, EditedMarker } from "@/components/chat-message-edit"
import { MessageContent } from "@/components/chat-message-content"
import { MessageActions } from "@/components/chat-message-actions"
import { ReactionChips } from "@/components/chat-message-reactions"
import { QuotedReply, ReplyingToBanner, jumpToMessage } from "@/components/chat-message-reply"
import { usePaginatedConversation } from "@/hooks/use-paginated-conversation"
import { useChatFileDrop, screenChatFiles } from "@/hooks/use-chat-file-drop"
import { LibraryFileSelector } from "@/components/admin/library-file-selector"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

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
  const [newMessage, setNewMessage] = useState("")
  const [searchQuery, setSearchQuery] = useState("")

  // Loading states
  const [isLoadingStudents, setIsLoadingStudents] = useState(true)
  const [isSending, setIsSending] = useState(false)

  // Lesson Intent Flag Modal State
  const [showFlagDialog, setShowFlagDialog] = useState(false)
  const [flagMessage, setFlagMessage] = useState<Message | null>(null)
  const [flagIntent, setFlagIntent] = useState<'skip_requested' | 'cancel_requested' | 'reschedule_requested'>('skip_requested')
  const [flagDate, setFlagDate] = useState("")
  const [flagNote, setFlagNote] = useState("")
  const [isSavingFlag, setIsSavingFlag] = useState(false)

  const handleOpenFlagDialog = (msg: Message, intent: 'skip_requested' | 'cancel_requested' | 'reschedule_requested') => {
    setFlagMessage(msg)
    setFlagIntent(intent)
    setFlagDate("")
    setFlagNote(`Student request: "${msg.content}"`)
    setShowFlagDialog(true)
  }

  const handleSubmitFlag = async () => {
    if (!selectedStudent || !flagMessage || !flagDate) return
    setIsSavingFlag(true)
    try {
      const { createLessonIntentFlagAction } = await import("@/app/actions/lesson-intent-flags")
      const res = await createLessonIntentFlagAction({
        studentId: selectedStudent.id,
        targetDate: flagDate,
        intent: flagIntent,
        sourceMessageId: flagMessage.id,
        note: flagNote,
      })

      if (res.error) {
        alert(`Failed to create flag: ${res.error}`)
      } else {
        setShowFlagDialog(false)
        setFlagMessage(null)
        setFlagDate("")
        setFlagNote("")
        alert("Lesson request marked successfully.")
      }
    } catch (e: any) {
      console.error(e)
      alert("An error occurred while creating the flag.")
    } finally {
      setIsSavingFlag(false)
    }
  }

  // Attachment states - Modified to support both File objects and Library resources
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    // Small timeout ensures DOM is updated before scrolling
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, 100)
  }, [])

  const {
    messages,
    reactions,
    isLoadingInitial: isLoadingMessages,
    isLoadingOlder,
    hasMore,
    scrollContainerRef,
    loadInitial,
    loadOlder,
    poll,
    appendLocal,
    remove,
    edit,
    toggleReaction,
  } = usePaginatedConversation({
    partnerId: selectedStudent?.id ?? null,
  })

  /** The message the composer is currently answering, if any. */
  const [replyTo, setReplyTo] = useState<Message | null>(null)

  /** Whose words a quoted line belongs to, from the admin's side of the thread. */
  const quoteAuthor = (senderId: string) =>
    senderId === selectedStudent?.id ? (selectedStudent?.name || "Student") : "You"

  // Load older messages when scrolled near the top.
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop < 80 && hasMore && !isLoadingOlder) {
      loadOlder()
    }
  }, [hasMore, isLoadingOlder, loadOlder])

  // Read inside the sidebar refresh so the polling loop doesn't restart on every selection.
  const selectedStudentIdRef = useRef<string | null>(null)
  selectedStudentIdRef.current = selectedStudent?.id ?? null

  /**
   * Re-fetch every thread's latest message and unread count. Without this the
   * sidebar is a snapshot from page load: replies from students, and messages
   * sent from another device or the agent API, never show up in the previews.
   */
  const refreshStudents = useCallback(async () => {
    try {
      const { students: studentData } = await getStudentsWithMessages()
      if (!studentData) return
      setStudents(prev => {
        const prevById = new Map(prev.map(s => [s.id, s]))
        return studentData.map((fresh: StudentWithMessages) => {
          const local = prevById.get(fresh.id)
          // Keep an optimistic send that landed after this fetch started.
          const localIsNewer = local?.lastMessage && (!fresh.lastMessage ||
            new Date(local.lastMessage.created_at) > new Date(fresh.lastMessage.created_at))
          return {
            ...fresh,
            lastMessage: localIsNewer ? local!.lastMessage : fresh.lastMessage,
            // The open thread is marked read by its own poll; don't flash a badge in between.
            unreadCount: fresh.id === selectedStudentIdRef.current ? 0 : fresh.unreadCount,
          }
        })
      })
    } catch (error) {
      console.error("Failed to refresh students", error)
    }
  }, [])

  // 1. Load students on mount, then keep the sidebar fresh.
  useEffect(() => {
    refreshStudents().finally(() => setIsLoadingStudents(false))

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") refreshStudents()
    }, 15000)
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshStudents()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [refreshStudents])

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

  // 2. Load newest page when student is selected, and clear the unread badge.
  useEffect(() => {
    if (!selectedStudent) return
    const studentId = selectedStudent.id
    setReplyTo(null)
    loadInitial()
    setStudents(prev => prev.map(s =>
      s.id === studentId ? { ...s, unreadCount: 0 } : s
    ))
  }, [selectedStudent, loadInitial])

  // Poll for new messages (append-only, so scrolled-in older pages are preserved).
  useEffect(() => {
    if (!selectedStudent) return
    const interval = setInterval(() => { poll() }, 5000)
    return () => clearInterval(interval)
  }, [selectedStudent, poll])

  // Mirror the open thread's newest message into its sidebar preview, so sends,
  // polled replies, edits and deletes show up there without waiting for a refresh.
  useEffect(() => {
    const newest = messages[messages.length - 1]
    const studentId = selectedStudent?.id
    // Right after switching, `messages` can still hold the previous thread.
    if (!newest || !studentId || (newest.sender_id !== studentId && newest.recipient_id !== studentId)) return
    setStudents(prev => {
      let changed = false
      const next = prev.map(s => {
        if (s.id !== studentId || s.lastMessage === newest) return s
        if (s.lastMessage && new Date(s.lastMessage.created_at) > new Date(newest.created_at)) return s
        changed = true
        return { ...s, lastMessage: newest }
      })
      return changed ? next : prev
    })
  }, [messages, selectedStudent])

  const handleSendMessage = async () => {
    if ((!newMessage.trim() && pendingAttachments.length === 0) || !selectedStudent) return

    const tempMessage = newMessage
    const tempAttachments = [...pendingAttachments]
    const tempReplyTo = replyTo
    setNewMessage("")
    setPendingAttachments([])
    setReplyTo(null)
    setIsSending(true)

    try {
      // Upload all pending attachments first
      const uploadedAttachments: MessageAttachment[] = []

      for (const pending of tempAttachments) {
        // Case 1: Library File (Already uploaded)
        if (pending.libraryFile) {
          uploadedAttachments.push({
            type: pending.libraryFile.type.includes('image') ? 'image' : 'file',
            url: pending.libraryFile.url,
            name: pending.libraryFile.name,
            size: pending.libraryFile.size
          })
          continue
        }

        // Case 2: New File Upload
        if (pending.file) {
          const formData = new FormData()
          formData.append('file', pending.file)
          const result = await uploadChatAttachment(formData)

          if (result.attachment) {
            uploadedAttachments.push(result.attachment)
          } else if (result.error) {
            console.error('Failed to upload attachment:', result.error)
            alert(`Failed to upload attachment: ${result.error}`)
            setIsSending(false)
            setNewMessage(tempMessage)
            setPendingAttachments(tempAttachments)
            setReplyTo(tempReplyTo)
            return
          }
        }
      }

      // Send message with attachments
      const result = await sendMessage(
        selectedStudent.id,
        tempMessage.trim() || (uploadedAttachments.length > 0 ? '📎 Attachment' : ''),
        uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
        undefined,
        tempReplyTo?.id ?? null
      )

      if (result.success && result.message) {
        appendLocal(result.message)
        // Scroll to newly sent message
        scrollToBottom()
      } else {
        setNewMessage(tempMessage)
        setPendingAttachments(tempAttachments)
        setReplyTo(tempReplyTo)
        alert("Failed to send")
      }
    } catch (error) {
      console.error('Error sending message:', error)
      setNewMessage(tempMessage)
      setPendingAttachments(tempAttachments)
      setReplyTo(tempReplyTo)
      alert("Failed to send message: " + (error instanceof Error ? error.message : "Unknown error"))
    } finally {
      setIsSending(false)
    }
  }

  // The sidebar preview follows these through the newest-message sync effect.
  const handleDeleteMessage = (messageId: string) => remove(messageId)
  const handleEditMessage = (messageId: string, content: string) => edit(messageId, content)

  /** Shared by the file picker and drag-and-drop so both behave identically. */
  const addFiles = useCallback((files: File[]) => {
    setAttachmentError(null)
    const newAttachments: PendingAttachment[] = files.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      uploading: false,
    }))
    setPendingAttachments(prev => [...prev, ...newAttachments].slice(0, 5)) // Max 5
  }, [])

  const remainingSlots = 5 - pendingAttachments.length

  const { isDragging, dropHandlers } = useChatFileDrop({
    onFiles: addFiles,
    onReject: setAttachmentError,
    remainingSlots,
    disabled: isSending || !selectedStudent,
  })

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    const { accepted, error } = screenChatFiles(files, remainingSlots)
    if (accepted.length > 0) addFiles(accepted)
    setAttachmentError(error)

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleLibrarySelect = (file: { url: string; name: string; type: string; size: number }) => {
    // Check if ends with image extension or type includes image
    // Since we only get file_url sometimes, simple check
    const isImage = file.type.includes('image') || /\.(jpg|jpeg|png|gif|webp)$/i.test(file.url)

    const newAttachment: PendingAttachment = {
      id: Math.random().toString(36).substring(7),
      libraryFile: file,
      preview: isImage ? file.url : undefined, // Use URL directly for library images
      uploading: false
    }

    setPendingAttachments(prev => [...prev, newAttachment].slice(0, 5))
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

  // Calendar days between the message and today (0 = today, 1 = yesterday).
  // Elapsed 24h would label last night's 8pm message as "today".
  const calendarDaysAgo = (date: Date) => {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    return Math.round((startOfToday.getTime() - startOfDate.getTime()) / (1000 * 60 * 60 * 24))
  }

  // Format Date Logic
  const formatSidebarDate = (timestamp: string) => {
    const date = new Date(timestamp)
    const diffDays = calendarDaysAgo(date)

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
    const diffDays = calendarDaysAgo(date)

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

      {/* LEFT SIDEBAR - Responsive visibility */}
      <div className={`
        flex-col border-r bg-muted/20 shrink-0 
        ${selectedStudent ? 'hidden md:flex' : 'flex w-full'} 
        md:w-[320px]
      `}>

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
                  <p className={`text-xs truncate mt-1 ${selectedStudent?.id === student.id ? "text-primary-foreground/80" : "text-muted-foreground"} ${student.lastMessage?.deleted_at ? "italic" : ""}`}>
                    {student.lastMessage?.deleted_at
                      ? "Message deleted"
                      : student.lastMessage?.content || "No messages"}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* RIGHT CHAT AREA - Responsive visibility */}
      <div className={`
        flex-1 flex-col min-w-0 bg-background h-full 
        ${selectedStudent ? 'flex' : 'hidden md:flex'}
      `}>
        {selectedStudent ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b flex items-center gap-3 shrink-0 bg-background/80 backdrop-blur z-10 h-[72px]">
              {/* Back Button for Mobile */}
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden -ml-2"
                onClick={() => setSelectedStudent(null)}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>

              <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-serif font-semibold leading-none">{selectedStudent.name}</h3>
                <p className="text-xs text-muted-foreground mt-1">{selectedStudent.email}</p>
              </div>
            </div>

            {/* Messages List - This is the flexible scrolling area.
                The wrapper (not the scroller) anchors the drop overlay, so the
                overlay stays pinned to the viewport instead of scrolling away
                with the thread's content. */}
            <div className="flex-1 min-h-0 relative flex flex-col" {...dropHandlers}>
              {isDragging && (
                <div className="absolute inset-0 z-20 border-2 border-dashed border-primary bg-primary/10 flex flex-col items-center justify-center pointer-events-none">
                  <Upload className="h-10 w-10 text-primary mb-2" />
                  <p className="font-semibold text-primary">Drop to attach</p>
                  <p className="text-xs text-muted-foreground mt-1">Images, PDF, Word or sheet music, up to 5 files</p>
                </div>
              )}
            <div
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto p-4 bg-muted/5 space-y-6"
            >
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
                  {isLoadingOlder && (
                    <div className="flex justify-center py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  {messages.map((msg) => msg.deleted_at ? (
                    <DeletedMessageBubble
                      key={msg.id}
                      messageId={msg.id}
                      isOwn={isFromAdmin(msg)}
                      timestamp={formatTimestamp(msg.created_at)}
                    />
                  ) : (
                    <div
                      key={msg.id}
                      data-message-id={msg.id}
                      className={`group flex items-end gap-1 ${isFromAdmin(msg) ? "justify-end" : "justify-start"}`}
                    >
                      {/* The action cluster sits outside the bubble, on its inner
                          edge, so it never overlaps message text or attachments. */}
                      {isFromAdmin(msg) && editingId !== msg.id && (
                        <MessageActions
                          onReact={(emoji) => toggleReaction(msg.id, emoji)}
                          onReply={() => setReplyTo(msg)}
                          onEdit={() => setEditingId(msg.id)}
                          onDelete={() => handleDeleteMessage(msg.id)}
                          deletePreview={msg.content}
                        />
                      )}
                      <div className={`flex flex-col min-w-0 max-w-[80%] ${isFromAdmin(msg) ? "items-end" : "items-start"}`}>
                      <div className={`max-w-full px-4 py-2.5 rounded-2xl shadow-sm ${isFromAdmin(msg)
                        ? "bg-primary text-primary-foreground rounded-br-none"
                        : "bg-white border text-foreground rounded-bl-none"
                        }`}>
                        {/* What this message is answering, resolved server-side. */}
                        {msg.reply_to && (
                          <QuotedReply
                            reply={msg.reply_to}
                            authorLabel={quoteAuthor(msg.reply_to.sender_id)}
                            onDark={isFromAdmin(msg)}
                            onJump={() => jumpToMessage(scrollContainerRef.current, msg.reply_to!.id)}
                          />
                        )}

                        {/* The Message Text */}
                        {editingId === msg.id ? (
                          <MessageEditor
                            initialValue={msg.content}
                            onSave={(content) => handleEditMessage(msg.id, content)}
                            onCancel={() => setEditingId(null)}
                            onDark={isFromAdmin(msg)}
                          />
                        ) : msg.content && msg.content !== '📎 Attachment' ? (
                          <MessageContent content={msg.content} onDark={isFromAdmin(msg)} />
                        ) : null}

                        {/* Attachments */}
                        {msg.attachments && msg.attachments.length > 0 && (
                          <ChatAttachmentPreview attachments={msg.attachments} compact />
                        )}

                        {/* Quick actions for student messages */}
                        {!isFromAdmin(msg) && (
                          <div className="flex gap-2 mt-2 pt-2 border-t text-[10px] text-muted-foreground border-dashed border-muted-foreground/30 flex-wrap">
                            <span className="font-semibold">Actions:</span>
                            <button
                              onClick={() => handleOpenFlagDialog(msg, 'skip_requested')}
                              className="hover:underline text-primary font-medium cursor-pointer"
                            >
                              Skip
                            </button>
                            <span>•</span>
                            <button
                              onClick={() => handleOpenFlagDialog(msg, 'cancel_requested')}
                              className="hover:underline text-primary font-medium cursor-pointer"
                            >
                              Cancel
                            </button>
                            <span>•</span>
                            <button
                              onClick={() => handleOpenFlagDialog(msg, 'reschedule_requested')}
                              className="hover:underline text-primary font-medium cursor-pointer"
                            >
                              Reschedule
                            </button>
                          </div>
                        )}

                        {/* The Timestamp - Right aligned, small, slightly transparent */}
                        <p className={`text-[10px] text-right mt-1 ${isFromAdmin(msg) ? "text-primary-foreground/70" : "text-muted-foreground"
                          }`}>
                          {formatTimestamp(msg.created_at)}
                          {msg.edited_at && <EditedMarker />}
                        </p>
                      </div>

                      <ReactionChips
                        reactions={reactions[msg.id]}
                        onToggle={(emoji) => toggleReaction(msg.id, emoji)}
                        align={isFromAdmin(msg) ? "end" : "start"}
                      />
                      </div>

                      {!isFromAdmin(msg) && (
                        <MessageActions
                          onReact={(emoji) => toggleReaction(msg.id, emoji)}
                          onReply={() => setReplyTo(msg)}
                        />
                      )}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>
            </div>

            {/* Input Area - Pinned to bottom */}
            <div className="border-t bg-background shrink-0">
              {replyTo && (
                <ReplyingToBanner
                  message={replyTo}
                  authorLabel={quoteAuthor(replyTo.sender_id)}
                  onCancel={() => setReplyTo(null)}
                />
              )}

              {/* Pending Attachments Preview */}
              {pendingAttachments.length > 0 && (
                <ChatPendingAttachments
                  attachments={pendingAttachments}
                  onRemove={handleRemoveAttachment}
                />
              )}

              {attachmentError && (
                <p className="px-4 pt-2 text-xs text-destructive">{attachmentError}</p>
              )}

              <div className="p-4 flex gap-2 items-center">
                {/* Hidden File Input */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept="image/*,.pdf,.doc,.docx,.musicxml,.mxl,.xml"
                  multiple
                  className="hidden"
                />

                {/* Attachment Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSending || pendingAttachments.length >= 5}
                  title="Upload file"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>

                {/* Library Button */}
                <LibraryFileSelector
                  onSelect={handleLibrarySelect}
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={isSending || pendingAttachments.length >= 5}
                      title="Add from Library"
                    >
                      <Folder className="h-4 w-4" />
                    </Button>
                  }
                />

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

      {/* Create Lesson Intent Flag Dialog */}
      <Dialog open={showFlagDialog} onOpenChange={setShowFlagDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark Lesson Request</DialogTitle>
            <DialogDescription>
              Create a structured intent flag for {selectedStudent?.name || 'Student'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Request Type</Label>
              <select
                value={flagIntent}
                onChange={(e: any) => setFlagIntent(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="skip_requested">Skip Lesson</option>
                <option value="cancel_requested">Cancel Lesson</option>
                <option value="reschedule_requested">Reschedule Lesson</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="flag-date">Target Date</Label>
              <Input
                id="flag-date"
                type="date"
                value={flagDate}
                onChange={(e) => setFlagDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="flag-note">Internal Notes</Label>
              <Textarea
                id="flag-note"
                value={flagNote}
                onChange={(e) => setFlagNote(e.target.value)}
                placeholder="e.g. Parent requested to skip this date..."
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowFlagDialog(false)} disabled={isSavingFlag}>
              Cancel
            </Button>
            <Button onClick={handleSubmitFlag} disabled={!flagDate || isSavingFlag}>
              {isSavingFlag ? 'Creating...' : 'Create Flag'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}