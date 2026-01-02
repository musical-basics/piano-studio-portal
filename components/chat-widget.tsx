"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { MessageCircle, X, Send, Music, Minimize2, Loader2, Paperclip } from "lucide-react"
import { sendMessage, getConversation, markMessagesAsRead, getAdminProfile, uploadChatAttachment } from "@/app/messages/actions"
import type { Message, MessageAttachment } from "@/lib/supabase/database.types"
import { ChatAttachmentPreview, ChatPendingAttachments } from "@/components/chat-attachment-preview"

interface ChatWidgetProps {
  studentId: string
  teacherName?: string
  unreadCount: number
}

export function ChatWidget({ studentId, teacherName, unreadCount: initialUnreadCount }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [adminId, setAdminId] = useState<string | null>(null)
  const [currentTeacherName, setCurrentTeacherName] = useState(teacherName)
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount)

  // Attachment states
  const [pendingAttachments, setPendingAttachments] = useState<{ file: File; preview?: string; uploading?: boolean }[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  // Load data when widget opens
  useEffect(() => {
    if (!isOpen) return

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
        setUnreadCount(0)
      }

      setIsLoading(false)

      // Scroll to bottom on load
      setTimeout(() => scrollToBottom(), 100)
    }

    loadData()
  }, [isOpen])

  // Removed auto-scroll useEffect that was triggered by polling

  // Poll for new messages when open
  useEffect(() => {
    if (!isOpen || !adminId) return

    const interval = setInterval(async () => {
      const { messages: newMessages } = await getConversation(adminId)
      setMessages(newMessages)
    }, 5000)

    return () => clearInterval(interval)
  }, [isOpen, adminId])

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
        // Scroll to newly sent message
        setTimeout(() => scrollToBottom(), 100)
      } else if (result.error) {
        console.error('Failed to send message:', result.error)
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
      return "Yesterday"
    } else if (diffDays < 7) {
      return date.toLocaleDateString("en-US", { weekday: "short" })
    } else {
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    }
  }

  const isFromStudent = (message: Message) => message.sender_id === studentId

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all duration-200 flex items-center justify-center hover:scale-105"
        aria-label="Open chat"
      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <>
            <MessageCircle className="h-6 w-6" />
            {unreadCount > 0 && (
              <Badge
                variant="destructive"
                className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
              >
                {unreadCount}
              </Badge>
            )}
          </>
        )}
      </button>

      {/* Chat Window Overlay */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-[380px] h-[500px] bg-card border-2 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b bg-primary text-primary-foreground">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-primary-foreground/20 rounded-full flex items-center justify-center">
                <Music className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-serif font-semibold">{currentTeacherName || "Your Instructor"}</h3>
                <p className="text-xs text-primary-foreground/70">Your Instructor</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(false)}
              className="text-primary-foreground hover:bg-primary-foreground/20"
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-background">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground mt-2">Loading...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Music className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-muted-foreground text-sm">No messages yet</p>
                <p className="text-xs text-muted-foreground">Start a conversation with your teacher</p>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${isFromStudent(message) ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 ${isFromStudent(message)
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted rounded-bl-sm"
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
                      className={`text-[10px] mt-1 ${isFromStudent(message) ? "text-primary-foreground/60" : "text-muted-foreground"
                        }`}
                    >
                      {formatTimestamp(message.created_at)}
                    </p>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t bg-card">
            {/* Pending Attachments Preview */}
            {pendingAttachments.length > 0 && (
              <ChatPendingAttachments
                attachments={pendingAttachments}
                onRemove={handleRemoveAttachment}
              />
            )}

            <div className="p-3 flex gap-2">
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
                className="shrink-0"
              >
                <Paperclip className="h-4 w-4" />
              </Button>

              <Input
                placeholder="Type a message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 text-sm"
                disabled={isSending || !adminId}
              />
              <Button
                size="icon"
                onClick={handleSendMessage}
                disabled={(!newMessage.trim() && pendingAttachments.length === 0) || isSending || !adminId}
              >
                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
