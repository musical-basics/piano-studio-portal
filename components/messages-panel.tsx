"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Send, Music, Loader2, Paperclip } from "lucide-react"
import { sendMessage, getConversation, markMessagesAsRead, getAdminProfile, uploadChatAttachment } from "@/app/messages/actions"
import type { Message, MessageAttachment } from "@/lib/supabase/database.types"
import { ChatAttachmentPreview, ChatPendingAttachments } from "@/components/chat-attachment-preview"

interface MessagesPanelProps {
  studentId: string
  teacherName?: string
}

export function MessagesPanel({ studentId, teacherName }: MessagesPanelProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [adminId, setAdminId] = useState<string | null>(null)
  const [currentTeacherName, setCurrentTeacherName] = useState(teacherName)
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)

  // Attachment states
  const [pendingAttachments, setPendingAttachments] = useState<{ file: File; preview?: string; uploading?: boolean }[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  // Load admin profile and messages on mount
  useEffect(() => {
    async function loadData() {
      setIsLoading(true)

      // Get admin profile
      const { admin } = await getAdminProfile()
      if (admin) {
        setAdminId(admin.id)
        if (admin.name) {
          setCurrentTeacherName(admin.name)
        }

        // Get conversation with admin
        const { messages: conversationMessages } = await getConversation(admin.id)
        setMessages(conversationMessages)

        // Mark messages as read
        await markMessagesAsRead(admin.id)
      }

      setIsLoading(false)
    }

    loadData()
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Poll for new messages every 5 seconds
  useEffect(() => {
    if (!adminId) return

    const interval = setInterval(async () => {
      const { messages: newMessages } = await getConversation(adminId)
      setMessages(newMessages)
    }, 5000)

    return () => clearInterval(interval)
  }, [adminId])

  const handleSendMessage = async () => {
    if ((!newMessage.trim() && pendingAttachments.length === 0) || !adminId) return

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
        adminId,
        tempMessage.trim() || (uploadedAttachments.length > 0 ? '📎 Attachment' : ''),
        uploadedAttachments.length > 0 ? uploadedAttachments : undefined
      )

      if (result.success && result.message) {
        setMessages((prev) => [...prev, result.message!])
      } else if (result.error) {
        alert(`Failed to send message: ${result.error}`)
        setNewMessage(tempMessage)
        setPendingAttachments(tempAttachments)
      }
    } catch (error) {
      console.error('Error sending message:', error)
      setNewMessage(tempMessage)
      setPendingAttachments(tempAttachments)
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

  const unreadCount = messages.filter((m) => !m.is_read && !isFromStudent(m)).length

  return (
    <Card className="flex flex-col h-[600px]">
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

      <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
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
          messages.map((message) => (
            <div key={message.id} className={`flex ${isFromStudent(message) ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${isFromStudent(message)
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-muted rounded-bl-md"
                  }`}
              >
                {message.content && message.content !== '📎 Attachment' && (
                  <p className="text-sm leading-relaxed">{message.content}</p>
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
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </CardContent>

      <div className="border-t">
        {/* Pending Attachments Preview */}
        {pendingAttachments.length > 0 && (
          <ChatPendingAttachments
            attachments={pendingAttachments}
            onRemove={handleRemoveAttachment}
          />
        )}

        <div className="p-4 flex gap-2">
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
        <p className="text-xs text-muted-foreground pb-4 text-center">Press Enter to send</p>
      </div>
    </Card>
  )
}
