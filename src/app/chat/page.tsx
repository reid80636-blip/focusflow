'use client'

import { useState, useEffect, useRef } from 'react'
import { Button, Card } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'
import { generateAIResponse } from '@/lib/ai-client'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface SavedChat {
  id: string
  title: string
  messages: Message[]
  created_at: string
  updated_at: string
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [chatHistory, setChatHistory] = useState<SavedChat[]>([])
  const [currentChatId, setCurrentChatId] = useState<string | null>(null)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showHistory, setShowHistory] = useState(true)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const supabase = createClient()

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Fetch chat history
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) {
          setHistoryLoading(false)
          return
        }

        const { data } = await supabase
          .from('study_sessions')
          .select('*')
          .eq('feature_type', 'chat')
          .order('updated_at', { ascending: false })
          .limit(50)

        if (data) {
          setChatHistory(data.map(item => {
            try {
              const parsed = JSON.parse(item.output_text)
              return {
                id: item.id,
                title: item.input_text?.substring(0, 50) || 'New Chat',
                messages: parsed.messages || [],
                created_at: item.created_at,
                updated_at: item.updated_at || item.created_at,
              }
            } catch {
              return null
            }
          }).filter((item): item is SavedChat => item !== null))
        }
      } catch {
        // Silently fail
      } finally {
        setHistoryLoading(false)
      }
    }

    fetchHistory()
  }, [supabase])

  // Save chat to history
  const saveChat = async (chatMessages: Message[]) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user || chatMessages.length === 0) return

      const firstUserMessage = chatMessages.find(m => m.role === 'user')?.content || 'New Chat'
      const chatData = { messages: chatMessages }

      if (currentChatId) {
        // Update existing chat
        await supabase
          .from('study_sessions')
          .update({
            output_text: JSON.stringify(chatData),
            updated_at: new Date().toISOString(),
          })
          .eq('id', currentChatId)

        setChatHistory(prev => prev.map(chat =>
          chat.id === currentChatId
            ? { ...chat, messages: chatMessages, updated_at: new Date().toISOString() }
            : chat
        ))
      } else {
        // Create new chat
        const { data: inserted } = await supabase
          .from('study_sessions')
          .insert({
            user_id: session.user.id,
            feature_type: 'chat',
            input_text: firstUserMessage.substring(0, 100),
            output_text: JSON.stringify(chatData),
          })
          .select()
          .single()

        if (inserted) {
          setCurrentChatId(inserted.id)
          setChatHistory(prev => [{
            id: inserted.id,
            title: firstUserMessage.substring(0, 50),
            messages: chatMessages,
            created_at: inserted.created_at,
            updated_at: inserted.created_at,
          }, ...prev])
        }
      }
    } catch {
      // Silently fail
    }
  }

  // Send message
  const handleSend = async () => {
    if (!input.trim() || loading) return

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    // Focus input after sending
    setTimeout(() => inputRef.current?.focus(), 0)

    try {
      // Build context from recent messages for conversation continuity
      const contextMessages = newMessages.slice(-10).map(m =>
        `${m.role === 'user' ? 'Student' : 'Assistant'}: ${m.content}`
      ).join('\n\n')

      const response = await generateAIResponse({
        feature: 'chat',
        input: contextMessages,
      })

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      }

      const updatedMessages = [...newMessages, assistantMessage]
      setMessages(updatedMessages)
      await saveChat(updatedMessages)
    } catch (error) {
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      }
      setMessages([...newMessages, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  // Load chat from history
  const loadChat = (chat: SavedChat) => {
    setMessages(chat.messages)
    setCurrentChatId(chat.id)
  }

  // Start new chat
  const startNewChat = () => {
    setMessages([])
    setCurrentChatId(null)
    setInput('')
    inputRef.current?.focus()
  }

  // Delete chat from history
  const deleteChat = async (chatId: string) => {
    try {
      await supabase.from('study_sessions').delete().eq('id', chatId)
      setChatHistory(prev => prev.filter(chat => chat.id !== chatId))
      if (currentChatId === chatId) {
        startNewChat()
      }
    } catch {
      // Silently fail
    }
  }

  // Handle key press
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Format timestamp
  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }

  // Format date for history
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  // Filter history
  const filteredHistory = chatHistory.filter(chat => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return chat.title.toLowerCase().includes(query) ||
      chat.messages.some(m => m.content.toLowerCase().includes(query))
  })

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Chat History Sidebar */}
      {showHistory && (
        <Card className="w-80 flex-shrink-0 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-border-default">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-text-primary flex items-center gap-2">
                <svg className="w-5 h-5 text-accent-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Chat History
              </h2>
              <Button size="sm" onClick={startNewChat}>
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New
              </Button>
            </div>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search chats..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-bg-secondary border border-border-default rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-purple/50"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {historyLoading ? (
              <div className="space-y-2 p-2">
                {[1, 2, 3].map(i => <div key={i} className="h-14 bg-bg-secondary rounded-lg animate-pulse" />)}
              </div>
            ) : filteredHistory.length === 0 ? (
              <p className="text-center text-text-muted py-8 text-sm">
                {searchQuery ? 'No matching chats' : 'No chat history yet'}
              </p>
            ) : (
              filteredHistory.map(chat => (
                <div
                  key={chat.id}
                  onClick={() => loadChat(chat)}
                  className={`group p-3 rounded-lg cursor-pointer transition-all ${
                    currentChatId === chat.id
                      ? 'bg-accent-purple/20 border border-accent-purple/30'
                      : 'hover:bg-bg-elevated border border-transparent'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-text-primary truncate">{chat.title}</p>
                      <p className="text-xs text-text-muted mt-0.5">{formatDate(chat.updated_at)}</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteChat(chat.id); }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-error/20 text-text-muted hover:text-error transition-all"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <Card className="mb-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="lg:hidden p-2 rounded-lg hover:bg-bg-elevated text-text-muted"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-purple to-accent-blue flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-semibold text-text-primary">AI Study Assistant</h1>
                <p className="text-sm text-text-muted">Ask me anything about your studies</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={startNewChat}>
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Chat
              </Button>
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="hidden lg:flex p-2 rounded-lg hover:bg-bg-elevated text-text-muted"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showHistory ? "M11 19l-7-7 7-7m8 14l-7-7 7-7" : "M13 5l7 7-7 7M5 5l7 7-7 7"} />
                </svg>
              </button>
            </div>
          </div>
        </Card>

        {/* Messages Area */}
        <Card className="flex-1 flex flex-col overflow-hidden mb-4">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-accent-purple/20 to-accent-blue/20 flex items-center justify-center mb-4">
                  <svg className="w-10 h-10 text-accent-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-text-primary mb-2">Start a Conversation</h2>
                <p className="text-text-muted max-w-md mb-6">
                  Ask me anything! I can help you understand concepts, solve problems, explain topics, or answer questions about any subject.
                </p>
                <div className="grid grid-cols-2 gap-2 max-w-md">
                  {[
                    'Explain photosynthesis',
                    'Help me solve x^2 - 5x + 6 = 0',
                    'What caused World War I?',
                    'How do I write a thesis statement?',
                  ].map((suggestion, i) => (
                    <button
                      key={i}
                      onClick={() => { setInput(suggestion); inputRef.current?.focus(); }}
                      className="p-3 text-left text-sm bg-bg-secondary hover:bg-bg-elevated rounded-lg text-text-secondary hover:text-text-primary transition-colors border border-border-default hover:border-accent-purple/30"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                        message.role === 'user'
                          ? 'bg-accent-purple text-white rounded-br-md'
                          : 'bg-bg-secondary text-text-primary rounded-bl-md'
                      }`}
                    >
                      {message.role === 'assistant' && (
                        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border-default/50">
                          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-accent-purple to-accent-blue flex items-center justify-center">
                            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <span className="text-xs font-medium text-text-muted">AI Assistant</span>
                        </div>
                      )}
                      <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                      <p className={`text-xs mt-2 ${message.role === 'user' ? 'text-white/70' : 'text-text-muted'}`}>
                        {formatTime(message.timestamp)}
                      </p>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-bg-secondary rounded-2xl rounded-bl-md px-4 py-3">
                      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border-default/50">
                        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-accent-purple to-accent-blue flex items-center justify-center">
                          <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <span className="text-xs font-medium text-text-muted">AI Assistant</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-accent-purple rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-accent-purple rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-accent-purple rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>
        </Card>

        {/* Input Area */}
        <Card className="flex-shrink-0">
          <div className="flex items-end gap-3">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask me anything..."
                rows={1}
                className="w-full px-4 py-3 bg-bg-secondary border border-border-default rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-purple/50 resize-none min-h-[48px] max-h-[120px]"
                style={{ height: 'auto' }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement
                  target.style.height = 'auto'
                  target.style.height = `${Math.min(target.scrollHeight, 120)}px`
                }}
              />
            </div>
            <Button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="h-12 px-6 bg-gradient-to-r from-accent-purple to-accent-blue hover:opacity-90"
            >
              {loading ? (
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </Button>
          </div>
          <p className="text-xs text-text-muted mt-2 text-center">
            Press Enter to send, Shift+Enter for new line
          </p>
        </Card>
      </div>
    </div>
  )
}
