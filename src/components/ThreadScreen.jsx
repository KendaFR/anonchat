import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export default function ThreadScreen({ thread, profile, onBack }) {
  const [replies, setReplies]   = useState([])
  const [text, setText]         = useState('')
  const [sending, setSending]   = useState(false)
  const [profiles, setProfiles] = useState({})
  const bottomRef               = useRef(null)
  const inputRef                = useRef(null)

  useEffect(() => {
    loadReplies()
    const sub = subscribeReplies()
    return () => supabase.removeChannel(sub)
  }, [thread.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [replies])

  async function loadReplies() {
    const { data } = await supabase
      .from('replies')
      .select('*, profiles(*)')
      .eq('thread_id', thread.id)
      .order('created_at', { ascending: true })

    if (!data) return
    const cache = {}
    data.forEach(r => { if (r.profiles) cache[r.profile_id] = r.profiles })
    setProfiles(cache)
    setReplies(data)
  }

  function subscribeReplies() {
    return supabase
      .channel(`thread-${thread.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'replies',
          filter: `thread_id=eq.${thread.id}` },
        async (payload) => {
          const reply = payload.new
          if (!profiles[reply.profile_id]) {
            const { data } = await supabase
              .from('profiles').select('*').eq('id', reply.profile_id).single()
            if (data) {
              setProfiles(prev => ({ ...prev, [data.id]: data }))
              reply.profiles = data
            }
          } else {
            reply.profiles = profiles[reply.profile_id]
          }
          setReplies(prev => [...prev, reply])
        }
      )
      .subscribe()
  }

  async function sendReply() {
    const content = text.trim()
    if (!content || sending) return
    setSending(true); setText('')
    const { error } = await supabase
      .from('replies')
      .insert({ thread_id: thread.id, profile_id: profile.id, content })
    if (error) { console.error(error); setText(content) }
    setSending(false)
    inputRef.current?.focus()
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() }
  }

  const threadAuthor = thread.profiles

  return (
    <div className="screen thread-screen">
      {/* Header */}
      <div className="header">
        <button className="btn-icon" onClick={onBack}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div>
          <h2>Thread</h2>
          <p className="subtitle">{replies.length} réponse{replies.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className="thread-body">
        {/* Post principal mis en avant */}
        <div className="thread-original">
          <div className="thread-original-author">
            <div className="avatar-sm" style={{ background: threadAuthor?.color }}>
              {threadAuthor?.emoji}
            </div>
            <div>
              <div className="thread-author-name">
                {threadAuthor?.emoji} · {threadAuthor?.age} ans
                {thread.profile_id === profile.id && <span className="badge-me">moi</span>}
              </div>
              <div className="thread-time">
                {new Date(thread.created_at).toLocaleString('fr-FR', {
                  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                })}
              </div>
            </div>
          </div>
          <p className="thread-original-content">{thread.content}</p>
        </div>

        {/* Séparateur */}
        <div className="replies-divider">
          {replies.length > 0
            ? `${replies.length} réponse${replies.length !== 1 ? 's' : ''}`
            : 'Sois le premier à répondre'}
        </div>

        {/* Replies */}
        <div className="replies-list">
          {replies.map(reply => {
            const sender = reply.profiles || profiles[reply.profile_id]
            const isMe   = reply.profile_id === profile.id
            if (!sender) return null
            return (
              <div key={reply.id} className={`reply ${isMe ? 'mine' : ''}`}>
                <div className="avatar-sm" style={{ background: sender.color }}>
                  {sender.emoji}
                </div>
                <div className="reply-wrap">
                  {!isMe && (
                    <div className="sender-name">{sender.emoji} · {sender.age} ans</div>
                  )}
                  <div className="bubble">{reply.content}</div>
                  <div className="msg-time">
                    {new Date(reply.created_at).toLocaleTimeString('fr-FR', {
                      hour: '2-digit', minute: '2-digit'
                    })}
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="msg-input-area">
        <div className="avatar-sm" style={{ background: profile.color, flexShrink: 0 }}>
          {profile.emoji}
        </div>
        <textarea
          ref={inputRef}
          className="msg-input"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ta réponse…"
          rows={1}
          maxLength={500}
          style={{ flex: 1 }}
        />
        <button className="send-btn" onClick={sendReply} disabled={!text.trim() || sending}>
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