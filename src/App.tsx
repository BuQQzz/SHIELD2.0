'use client'

import { useState } from 'react'
import { ChatLayout } from './components/chat/ChatLayout'
import { Sidebar } from './components/chat/Sidebar'
import { ChatHeader } from './components/chat/ChatHeader'
import { ChatPlaceholder } from './components/chat/ChatPlaceholder'
import { MessageList } from './components/chat/MessageList'
import { ChatInput } from './components/chat/ChatInput'
import './App.css'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isGenerating, setIsGenerating] = useState(false)

  const handleSendMessage = (content: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setIsGenerating(true)

    // Simulate AI response (replace with actual llama.cpp integration later)
    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'This is a placeholder response. Integration with llama.cpp coming soon!',
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, assistantMessage])
      setIsGenerating(false)
    }, 1000)
  }

  const handleStopGenerating = () => {
    setIsGenerating(false)
  }

  return (
    <ChatLayout sidebar={<Sidebar />}>
      <div className="flex h-full flex-col">
        <ChatHeader />
        {messages.length === 0 ? (
          <ChatPlaceholder />
        ) : (
          <MessageList messages={messages} />
        )}
        <ChatInput
          onSend={handleSendMessage}
          isGenerating={isGenerating}
          onStop={handleStopGenerating}
        />
      </div>
    </ChatLayout>
  )
}

export default App
