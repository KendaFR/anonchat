import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import Message from './Message'

export default function ChatScreen({ profile, onOpenProfile }) {
  const [messages, setMessages] = useState([])
  const [profiles, setProfiles] = useState({}) // cache id -> profile
  const [text, setText]         = useState('')
  const [sending, setSending]   = useState(false)
  const [onlineCount, setOnlineCount] = useState(1)
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  // Charge les 50 derniers messages au montage
  useEffect(() => {
    loadMessages()
    const channel = subscribeRealtime()
    trackPresence()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // Scroll vers le bas à chaque nouveau message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadMessages() {
    const { data, error } = await supabase
      .from('messages')
      .select('*, profiles(*)')
      .order('created_at', { ascending: true })
      .limit(50)

    if (error) { console.error(error); return }

    // Construit le cache des profils
    const cache = {}
    data.forEach(m => { if (m.profiles) cache[m.profile_id] = m.profiles })
    setProfiles(cache)
    setMessages(data)
  }

  function subscribeRealtime() {
    return supabase
      .channel('messages-channel')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload) => {
          const newMsg = payload.new
          // Charge le profil si pas en cache
          if (!profiles[newMsg.profile_id]) {
            const { data } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', newMsg.profile_id)
              .single()
            if (data) {
              setProfiles(prev => ({ ...prev, [data.id]: data }))
              newMsg.profiles = data
            }
          } else {
            newMsg.profiles = profiles[newMsg.profile_id]
          }
          setMessages(prev => [...prev, newMsg])
        }
      )
      .subscribe()
  }

  function trackPresence() {
    // Simulation compteur online — en prod, utilise Supabase Presence
    setOnlineCount(Math.floor(Math.random() * 8) + 2)
  }

  async function sendMessage() {
    const content = text.trim()
    if (!content || sending) return
    setSending(true)
    setText('')

    const { error } = await supabase
      .from('messages')
      .insert({ profile_id: profile.id, content })

    if (error) {
      console.error(error)
      setText(content) // Restore si erreur
    }
    setSending(false)
    inputRef.current?.focus()
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function handleInput(e) {
    setText(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 80) + 'px'
  }

  return (
    <div className="screen chat-screen">
      {/* Header */}
      <div className="chat-header">
        <div className="header-left">
          <div className="avatar-sm" style={{ background: profile.color }}>
            {profile.emoji}
          </div>
          <div>
            <div className="room-name">Salle générale</div>
            <div className="online-info">
              <span className="dot-green" />
              {onlineCount} connectés
            </div>
          </div>
        </div>
        <button className="btn-icon" onClick={onOpenProfile} title="Mon profil">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4"/>
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="messages-list">
        {messages.length === 0 && (
          <div className="system-msg">Sois le premier à dire bonjour 👋</div>
        )}
        {messages.map(msg => (
          <Message
            key={msg.id}
            message={msg}
            sender={msg.profiles || profiles[msg.profile_id]}
            isMe={msg.profile_id === profile.id}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="msg-input-area">
        <textarea
          ref={inputRef}
          className="msg-input"
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ton message…"
          rows={1}
          maxLength={500}
        />
        <button
          className="send-btn"
          onClick={sendMessage}
          disabled={!text.trim() || sending}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    </div>
  )
}