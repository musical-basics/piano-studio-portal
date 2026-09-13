"use client"

import type React from "react"

import { useState, useRef, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Send, Music, Loader2, Paperclip, Upload } from "lucide-react"
import { sendMessage, getAdminProfile, uploadChatAttachment } from "@/app/messages/actions"
import type { Message, MessageAttachment } from "@/lib/supabase/database.types"
import { ChatAttachmentPreview, ChatPendingAttachments } from "@/components/chat-attachment-preview"
import { DeletedMessageBubble } from "@/components/chat-message-delete"
import { MessageEditor, EditedMarker } from "@/components/chat-message-edit"
import { MessageContent } from "@/components/chat-message-content"
import { MessageActions } from "@/components/chat-message-actions"
import { ReactionChips } from "@/components/chat-message-reactions"
import { QuotedReply, ReplyingToBanner, jumpToMessage } from "@/components/chat-message-reply"
import { usePaginatedConversation } from "@/hooks/use-paginated-conversation"
import { useChatFileDrop, screenChatFiles } from "@/hooks/use-chat-file-drop"

interface MessagesPanelProps {
  studentId: string
  teacherName?: string
  /** Fired once the teacher's messages have been marked read, to clear outside badges. */
  onRead?: () => void
}

export function MessagesPanel({ studentId, teacherName, onRead }: MessagesPanelProps) {
  const [newMessage, setNewMessage] = useState("")
  const [adminId, setAdminId] = useState<string | null>(null)
  const [currentTeacherName, setCurrentTeacherName] = useState(teacherName)
  const [isSending, setIsSending] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)

  // Attachment states
  const [pendingAttachments, setPendingAttachments] = useState<{ file: File; preview?: string; uploading?: boolean }[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100)
  }, [])

  const {
    messages,
    reactions,
    isLoadingInitial,
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
    partnerId: adminId,
    asUserId: studentId,
    onRead,
  })

  /** The message the composer is currently answering, if any. */
  const [replyTo, setReplyTo] = useState<Message | null>(null)

  /** Whose words a quoted line belongs to, from the student's side of the thread. */
  const quoteAuthor = (senderId: string) =>
    senderId === studentId ? "You" : (currentTeacherName || "Your Instructor")

  const [isResolvingAdmin, setIsResolvingAdmin] = useState(true)
  const isLoading = isResolvingAdmin || isLoadingInitial

  // Resolve the admin id once. Self-healing: keeps retrying on each poll tick
  // until it succeeds, so a transient first-load failure recovers on its own.
  const adminIdRef = useRef<string | null>(null)
  const resolveAdmin = useCallback(async (): Promise<string | null> => {
    if (adminIdRef.current) return adminIdRef.current
    try {
      const { admin } = await getAdminProfile()
      if (!admin) return null
      adminIdRef.current = admin.id
      setAdminId(admin.id)
      if (admin.name) setCurrentTeacherName(admin.name)
      return admin.id
    } catch (err) {
      console.error('MessagesPanel: resolveAdmin failed (will retry):', err)
      return null
    }
  }, [])

  // Kick off admin resolution + initial load.
  useEffect(() => {
    let cancelled = false
    setIsResolvingAdmin(true)
    resolveAdmin().finally(() => { if (!cancelled) setIsResolvingAdmin(false) })
    return () => { cancelled = true }
  }, [resolveAdmin])

  // Once the admin id is known, load the newest page.
  useEffect(() => {
    if (adminId) loadInitial()
  }, [adminId, loadInitial])

  // Poll for new messages; also refetch on focus/visibility. Re-resolves the
  // admin id first in case the initial resolution failed.
  useEffect(() => {
    const tick = async () => {
      const id = await resolveAdmin()
      if (id) poll()
    }
    const interval = setInterval(tick, 5000)
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [resolveAdmin, poll])

  // Load older messages when scrolled near the top.
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop < 80 && hasMore && !isLoadingOlder) {
      loadOlder()
    }
  }, [hasMore, isLoadingOlder, loadOlder])

  const handleSendMessage = async () => {
    if ((!newMessage.trim() && pendingAttachments.length === 0) || !adminId) return

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
        adminId,
        tempMessage.trim() || (uploadedAttachments.length > 0 ? '📎 Attachment' : ''),
        uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
        studentId,
        tempReplyTo?.id ?? null
      )

      if (result.success && result.message) {
        appendLocal(result.message)
        // Scroll to show the new message
        scrollToBottom()
      } else if (result.error) {
        alert(`Failed to send message: ${result.error}`)
        setNewMessage(tempMessage)
        setPendingAttachments(tempAttachments)
        setReplyTo(tempReplyTo)
      }
    } catch (error) {
      console.error('Error sending message:', error)
      setNewMessage(tempMessage)
      setPendingAttachments(tempAttachments)
      setReplyTo(tempReplyTo)
    } finally {
      setIsSending(false)
    }
  }

  /** Shared by the file picker and drag-and-drop so both behave identically. */
  const addFiles = useCallback((files: File[]) => {
    setAttachmentError(null)
    const newAttachments = files.map(file => ({
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
    disabled: isSending || !adminId,
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

  const handleRemoveAttachment = (index: number) => {
    setPendingAttachments(prev => {
      const attachment = prev[index]
      if (attachment?.preview) {
        URL.revokeObjectURL(attachment.preview)
      }
      return prev.filter((_, i) => i !== index)
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
      return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    } else if (diffDays === 1) {
      return `Yesterday ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
    } else if (diffDays < 7) {
      return date.toLocaleDateString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })
    } else {
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    }
  }

  // Determine if message is from current student (studentId) or admin
  const isFromStudent = (message: Message) => message.sender_id === studentId

  const unreadCount = messages.filter((m) => !m.is_read && !isFromStudent(m) && !m.deleted_at).length

  return (
    <Card className="flex flex-col h-[600px] relative" {...dropHandlers}>
      {/* Drop target overlay: files can be dropped anywhere on the conversation. */}
      {isDragging && (
        <div className="absolute inset-0 z-20 rounded-lg border-2 border-dashed border-primary bg-primary/10 backdrop-blur-[1px] flex flex-col items-center justify-center pointer-events-none">
          <Upload className="h-10 w-10 text-primary mb-2" />
          <p className="font-semibold text-primary">Drop to attach</p>
          <p className="text-xs text-muted-foreground mt-1">Images, PDF, Word or sheet music, up to 5 files</p>
        </div>
      )}

      <CardHeader className="border-b pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-primary rounded-full flex items-center justify-center">
              <Music className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <CardTitle className="text-lg font-serif">{currentTeacherName || "Your Instructor"}</CardTitle>
              <p className="text-sm text-muted-foreground">Your Instructor</p>
            </div>
          </div>
          {unreadCount > 0 && <Badge variant="destructive">{unreadCount} new</Badge>}
        </div>
      </CardHeader>

      <CardContent ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground mt-2">Loading messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Music className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No messages yet</p>
            <p className="text-sm text-muted-foreground">Start a conversation with your teacher</p>
          </div>
        ) : (
          <>
            {isLoadingOlder && (
              <div className="flex justify-center py-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {messages.map((message) => message.deleted_at ? (
              <DeletedMessageBubble
                key={message.id}
                messageId={message.id}
                isOwn={isFromStudent(message)}
                timestamp={formatTimestamp(message.created_at)}
              />
            ) : (
            <div
              key={message.id}
              data-message-id={message.id}
              className={`group flex items-end gap-1 ${isFromStudent(message) ? "justify-end" : "justify-start"}`}
            >
              {/* The action cluster sits outside the bubble, on its inner edge, so
                  it never overlaps message text or attachments. */}
              {isFromStudent(message) && editingId !== message.id && (
                <MessageActions
                  onReact={(emoji) => toggleReaction(message.id, emoji)}
                  onReply={() => setReplyTo(message)}
                  onEdit={() => setEditingId(message.id)}
                  onDelete={() => remove(message.id)}
                  deletePreview={message.content}
                />
              )}
              <div className={`flex flex-col min-w-0 max-w-[80%] ${isFromStudent(message) ? "items-end" : "items-start"}`}>
              <div
                className={`max-w-full rounded-2xl px-4 py-2.5 ${isFromStudent(message)
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-muted rounded-bl-md"
                  }`}
              >
                {message.reply_to && (
                  <QuotedReply
                    reply={message.reply_to}
                    authorLabel={quoteAuthor(message.reply_to.sender_id)}
                    onDark={isFromStudent(message)}
                    onJump={() => jumpToMessage(scrollContainerRef.current, message.reply_to!.id)}
                  />
                )}

                {editingId === message.id ? (
                  <MessageEditor
                    initialValue={message.content}
                    onSave={(content) => edit(message.id, content)}
                    onCancel={() => setEditingId(null)}
                    onDark={isFromStudent(message)}
                  />
                ) : (
                  <>
                    {message.content && message.content !== '📎 Attachment' && (
                      <MessageContent content={message.content} onDark={isFromStudent(message)} />
                    )}

                    {/* Attachments */}
                    {message.attachments && message.attachments.length > 0 && (
                      <ChatAttachmentPreview attachments={message.attachments} compact />
                    )}

                    <p
                      className={`text-xs mt-1 ${isFromStudent(message) ? "text-primary-foreground/70" : "text-muted-foreground"
                        }`}
                    >
                      {formatTimestamp(message.created_at)}
                      {message.edited_at && <EditedMarker />}
                    </p>
                  </>
                )}
              </div>

              <ReactionChips
                reactions={reactions[message.id]}
                onToggle={(emoji) => toggleReaction(message.id, emoji)}
                align={isFromStudent(message) ? "end" : "start"}
              />
              </div>

              {!isFromStudent(message) && (
                <MessageActions
                  onReact={(emoji) => toggleReaction(message.id, emoji)}
                  onReply={() => setReplyTo(message)}
                />
              )}
            </div>
            ))}
          </>
        )}
        <div ref={messagesEndRef} />
      </CardContent>

      <div className="border-t">
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

        <div className="p-4 flex gap-2">
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
            disabled={isSending || pendingAttachments.length >= 5 || !adminId}
            title="Add attachment"
          >
            <Paperclip className="h-4 w-4" />
          </Button>

          <Input
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1"
            disabled={isSending || !adminId}
          />
          <Button
            onClick={handleSendMessage}
            disabled={(!newMessage.trim() && pendingAttachments.length === 0) || isSending || !adminId}
          >
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span className="sr-only">Send message</span>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground pb-4 text-center">
          Press Enter to send · drag files in to attach
        </p>
      </div>
    </Card>
  )
}
