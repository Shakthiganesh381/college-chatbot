import { useState, useEffect, useRef } from 'react'
import { getBotResponse } from '../services/chatbotService'
import './ChatPage.css'

const SUGGESTIONS = [
  { label: "🍽️ Today's Lunch", query: "What is today's lunch?" },
  { label: "🥐 Tomorrow's Breakfast", query: "What is for breakfast tomorrow?" },
  { label: "📚 Library Hours", query: "What are the library hours on Monday?" },
  { label: "💻 CSE Department Timings", query: "What time does CSE department open on Monday?" },
  { label: "🏛️ Where is Seminar Hall A?", query: "Where is Seminar Hall A located?" },
  { label: "🔬 Where is CSE Lab 1?", query: "Where is CSE Lab 1?" }
]

// Formatter component to convert markdown-like syntax (**bold**, _italic_, • bullet points, `code`) to styled JSX
function FormattedMessage({ text }) {
  if (!text) return null

  // Split into lines
  const lines = text.split('\n')

  return (
    <div className="formatted-message">
      {lines.map((line, lineIdx) => {
        const trimmed = line.trim()
        if (!trimmed) {
          return <div key={lineIdx} className="line-break" />
        }

        // Check if line is a bullet point (starts with • or - or *)
        const isBullet = /^[•\-*]\s+/.test(trimmed)
        const content = isBullet ? trimmed.replace(/^[•\-*]\s+/, '') : line

        // Helper to parse bold, italic, and code inside text
        const renderInline = (str) => {
          const parts = []
          let remaining = str
          let key = 0

          while (remaining.length > 0) {
            const boldMatch = remaining.match(/^(.*?)\*\*(.*?)\*\*(.*)$/)
            const italicMatch = remaining.match(/^(.*?)_(.*?)_(.*)$/)
            const codeMatch = remaining.match(/^(.*?)`(.*?)`(.*)$/)

            let earliest = null
            if (boldMatch) earliest = { type: 'bold', match: boldMatch, index: boldMatch[1].length }
            if (italicMatch && (!earliest || italicMatch[1].length < earliest.index)) {
              earliest = { type: 'italic', match: italicMatch, index: italicMatch[1].length }
            }
            if (codeMatch && (!earliest || codeMatch[1].length < earliest.index)) {
              earliest = { type: 'code', match: codeMatch, index: codeMatch[1].length }
            }

            if (!earliest) {
              parts.push(<span key={key++}>{remaining}</span>)
              break
            }

            const prefix = earliest.match[1]
            const inner = earliest.match[2]
            const suffix = earliest.match[3]

            if (prefix) {
              parts.push(<span key={key++}>{prefix}</span>)
            }

            if (earliest.type === 'bold') {
              parts.push(<strong key={key++} className="msg-bold">{inner}</strong>)
            } else if (earliest.type === 'italic') {
              parts.push(<em key={key++} className="msg-italic">{inner}</em>)
            } else if (earliest.type === 'code') {
              parts.push(<code key={key++} className="msg-code">{inner}</code>)
            }

            remaining = suffix
          }

          return parts
        }

        if (isBullet) {
          return (
            <div key={lineIdx} className="bullet-line">
              <span className="bullet-icon">•</span>
              <span className="bullet-text">{renderInline(content)}</span>
            </div>
          )
        }

        return (
          <p key={lineIdx} className="message-paragraph">
            {renderInline(content)}
          </p>
        )
      })}
    </div>
  )
}

function ChatPage() {
  const initialBotMessage = {
    id: 1,
    text: "Hello! 👋 I am your **College Assistant**.\n\nYou can ask me about:\n• **Exam Hall Finder** (e.g. 'Where is my exam hall for 7376251CS101?')\n• **Food Menus** (e.g. 'What is today's lunch?')\n• **Operating Hours** (e.g. 'What time does the library open on Monday?')\n• **Venues & Classrooms** (e.g. 'Where is Seminar Hall A?')\n\nHow can I help you today?",
    sender: 'bot',
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const [messages, setMessages] = useState([initialBotMessage])
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isTyping])

  const submitQuery = async (queryText) => {
    if (!queryText || !queryText.trim() || isTyping) return

    const trimmed = queryText.trim()

    const userMessage = {
      id: Date.now(),
      text: trimmed,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    setMessages((prev) => [...prev, userMessage])
    setInputValue('')
    setIsTyping(true)

    try {
      const botResponseText = await getBotResponse(trimmed)

      const botReply = {
        id: Date.now() + 1,
        text: botResponseText,
        sender: 'bot',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
      setMessages((prev) => [...prev, botReply])
    } catch (error) {
      console.error('Chat error:', error)
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          text: 'Sorry, an unexpected error occurred while communicating with the server.',
          sender: 'bot',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ])
    } finally {
      setIsTyping(false)
      inputRef.current?.focus()
    }
  }

  const handleSend = (e) => {
    e.preventDefault()
    submitQuery(inputValue)
  }

  const handleClearChat = () => {
    setMessages([
      {
        ...initialBotMessage,
        id: Date.now(),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ])
  }

  return (
    <div className="chat-container">
      <header className="chat-header">
        <div className="header-left">
          <div className="header-status"></div>
          <div className="header-title-group">
            <h1>College Assistant</h1>
            <span className="header-subtitle">Online • Real-time Campus Info</span>
          </div>
        </div>
        <button
          className="clear-chat-btn"
          onClick={handleClearChat}
          title="Restart Conversation"
          type="button"
        >
          🗑️ Clear
        </button>
      </header>

      <div className="messages-list">
        {messages.map((msg) => (
          <div key={msg.id} className={`message-wrapper ${msg.sender}`}>
            <div className="message-bubble">
              <FormattedMessage text={msg.text} />
              <span className="message-time">{msg.timestamp}</span>
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="message-wrapper bot">
            <div className="message-bubble typing">
              <span className="dot"></span>
              <span className="dot"></span>
              <span className="dot"></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggestion Chips */}
      <div className="suggestions-container">
        <div className="suggestions-scroll">
          {SUGGESTIONS.map((item, idx) => (
            <button
              key={idx}
              type="button"
              className="suggestion-chip"
              disabled={isTyping}
              onClick={() => submitQuery(item.query)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Input bar */}
      <form onSubmit={handleSend} className="chat-input-form">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Ask about food menus, hours, venues, or exam halls..."
          className="chat-input"
          maxLength={500}
          disabled={isTyping}
        />
        <button type="submit" className="send-button" disabled={!inputValue.trim() || isTyping}>
          <span>Send</span>
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </form>
    </div>
  )
}

export default ChatPage
