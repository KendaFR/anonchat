import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import ReportModal from './ReportModal'
import ProfilePopup from './ProfilePopup'
import RoleBadge from './RoleBadge'

function HighlightedText({ text, participants }) {
  const parts = text.split(/(@\d+)/g)
  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(/^@(\d+)$/)
        if (match) {
          const num = parseInt(match[1])
          const p = participants[num]
          if (!p) return <span key={i}>{part}</span>
          return (
            <span key={i} className="mention" style={{ background: p.color }}>
              {p.emoji} @{num}
            </span>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

export default function ThreadScreen({ threadProp, profile, onBack }) {
  const [thread, setThread]             = useState(null)
  const [replies, setReplies]           = useState([])
  const [profileCache, setProfileCache] = useState({})
  const [participants, setParticipants] = useState({})
  const [myNumber, setMyNumber]         = useState(null)
  const [text, setText]                 = useState('')
  const [sending, setSending]           = useState(false)
  const [showMentions, setShowMentions] = useState(false)
  const [reportTarget, setReportTarget] = useState(null)
  const [viewProfile, setViewProfile]   = useState(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting]         = useState(false)
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  // Calcul live à partir du profil (mis à jour par useSession Realtime)
  const isSuspended = profile.status === 'suspended_temp' || profile.status === 'suspended_perm'

  useEffect(() => {
    initThread()
  }, [threadProp?.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [replies])

  async function initThread() {
    let t = threadProp
    if (threadProp?._needsLoad) {
      const { data } = await supabase
        .from('threads').select('*, profiles(*)').eq('id', threadProp.id).single()
      if (data) t = data
    }
    setThread(t)
    if (!t) return
    await Promise.all([loadReplies(t.id), loadParticipants(t.id)])

    const { data: me } = await supabase
      .from('thread_participants').select('participant_number')
      .eq('thread_id', t.id).eq('profile_id', profile.id).single()
    if (me) setMyNumber(me.participant_number)

    const sub  = subscribeReplies(t.id)
    const subP = subscribeParticipants(t.id)
    return () => { supabase.removeChannel(sub); supabase.removeChannel(subP) }
  }

  async function loadReplies(threadId) {
    const { data } = await supabase
      .from('replies').select('*, profiles(*)')
      .eq('thread_id', threadId).order('created_at', { ascending: true })
    if (!data) return
    const cache = {}
    data.forEach(r => { if (r.profiles) cache[r.profile_id] = r.profiles })
    setProfileCache(cache)
    setReplies(data)
  }

  async function loadParticipants(threadId) {
    const { data } = await supabase
      .from('thread_participants').select('*, profiles(*)')
      .eq('thread_id', threadId).order('participant_number', { ascending: true })
    if (!data) return
    const map = {}
    data.forEach(p => {
      map[p.participant_number] = {
        profile_id: p.profile_id,
        emoji: p.profiles?.emoji,
        color: p.profiles?.color,
      }
    })
    setParticipants(map)
    const mine = data.find(p => p.profile_id === profile.id)
    if (mine) setMyNumber(mine.participant_number)
  }

  function subscribeReplies(threadId) {
    return supabase.channel(`thread-replies-${threadId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'replies', filter: `thread_id=eq.${threadId}` },
        async ({ new: reply }) => {
          if (!profileCache[reply.profile_id]) {
            const { data } = await supabase.from('profiles').select('*').eq('id', reply.profile_id).single()
            if (data) { setProfileCache(p => ({ ...p, [data.id]: data })); reply.profiles = data }
          } else { reply.profiles = profileCache[reply.profile_id] }
          setReplies(prev => [...prev, reply])
        })
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'replies', filter: `thread_id=eq.${threadId}` },
        ({ old }) => setReplies(prev => prev.filter(r => r.id !== old.id)))
      .subscribe()
  }

  function subscribeParticipants(threadId) {
    return supabase.channel(`thread-parts-${threadId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'thread_participants', filter: `thread_id=eq.${threadId}` },
        async ({ new: p }) => {
          const { data: prof } = await supabase.from('profiles').select('*').eq('id', p.profile_id).single()
          setParticipants(prev => ({
            ...prev,
            [p.participant_number]: { profile_id: p.profile_id, emoji: prof?.emoji, color: prof?.color }
          }))
          if (p.profile_id === profile.id) setMyNumber(p.participant_number)
        })
      .subscribe()
  }

  // ─── Suppression du thread (propriétaire uniquement) ─────────────────────
  async function handleDeleteThread() {
    if (!thread || deleting) return
    setDeleting(true)
    await supabase.from('threads').delete().eq('id', thread.id)
    setDeleting(false)
    onBack() // retour au feed
  }

  // ─── Envoi ───────────────────────────────────────────────────────────────
  async function sendReply() {
    const content = text.trim()
    if (!content || sending || !thread || isSuspended) return
    setSending(true); setText(''); setShowMentions(false)

    let myNum = myNumber
    if (myNum === null) {
      const { data: maxData } = await supabase
        .from('thread_participants').select('participant_number')
        .eq('thread_id', thread.id)
        .order('participant_number', { ascending: false }).limit(1)
      const nextNum = maxData && maxData.length > 0 ? maxData[0].participant_number + 1 : 1
      const { error: partErr } = await supabase.from('thread_participants').insert({
        thread_id: thread.id, profile_id: profile.id, participant_number: nextNum
      })
      if (!partErr) { myNum = nextNum; setMyNumber(nextNum) }
    }

    const { data: reply, error } = await supabase
      .from('replies')
      .insert({ thread_id: thread.id, profile_id: profile.id, content })
      .select().single()
    if (error) { console.error(error); setText(content); setSending(false); return }

    await generateNotifications(reply, content)
    setSending(false)
    inputRef.current?.focus()
  }

  async function generateNotifications(reply, content) {
    const otherParticipants = Object.values(participants).filter(p => p.profile_id !== profile.id)
    const mentionedNums = [...content.matchAll(/@(\d+)/g)]
      .map(m => parseInt(m[1]))
      .filter(n => participants[n] && participants[n].profile_id !== profile.id)
    const mentionedIds = new Set(mentionedNums.map(n => participants[n].profile_id))
    const notifsToInsert = []

    mentionedIds.forEach(recipientId => {
      notifsToInsert.push({ recipient_id: recipientId, thread_id: thread.id, reply_id: reply.id, type: 'mention' })
    })

    for (const p of otherParticipants) {
      if (mentionedIds.has(p.profile_id)) continue
      const { data: pref } = await supabase
        .from('notification_prefs').select('all_replies')
        .eq('profile_id', p.profile_id).eq('thread_id', thread.id).single()
      if (pref ? pref.all_replies : true) {
        notifsToInsert.push({ recipient_id: p.profile_id, thread_id: thread.id, reply_id: reply.id, type: 'reply_in_thread' })
      }
    }

    if (notifsToInsert.length > 0) await supabase.from('notifications').insert(notifsToInsert)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() }
    if (e.key === 'Escape') setShowMentions(false)
  }

  function handleTextChange(e) {
    const val = e.target.value; setText(val)
    setShowMentions(/(@\d*)$/.test(val))
  }

  function insertMention(num) {
    setText(t => t.replace(/@\d*$/, `@${num} `))
    setShowMentions(false); inputRef.current?.focus()
  }

  async function openProfile(profileId) {
    const cached = profileCache[profileId]
    if (cached) { setViewProfile(cached); return }
    const { data } = await supabase.from('profiles').select('*').eq('id', profileId).single()
    if (data) setViewProfile(data)
  }

  const participantList = Object.entries(participants).sort(([a], [b]) => Number(a) - Number(b))
  const isOwner = thread?.profile_id === profile.id

  if (!thread) return (
    <div className="screen thread-screen">
      <div className="header">
        <button className="btn-icon" onClick={onBack}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div><h2>Chargement…</h2></div>
      </div>
    </div>
  )

  const threadAuthor = thread.profiles

  return (
    <div className="screen thread-screen">
      <div className="header">
        <button className="btn-icon" onClick={onBack}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div style={{ flex: 1 }}>
          <h2>Thread</h2>
          <p className="subtitle">
            {replies.length} réponse{replies.length !== 1 ? 's' : ''}
            {myNumber !== null && <span className="my-number-badge"> · Tu es @{myNumber}</span>}
          </p>
        </div>
        {/* Bouton supprimer — propriétaire uniquement */}
        {isOwner && !showDeleteConfirm && (
          <button
            className="btn-icon"
            onClick={() => setShowDeleteConfirm(true)}
            title="Supprimer ce thread"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4h6v2"/>
            </svg>
          </button>
        )}
      </div>

      {/* Confirmation suppression thread */}
      {showDeleteConfirm && (
        <div className="thread-delete-bar">
          <span>Supprimer ce thread et toutes ses réponses ?</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost-sm" onClick={() => setShowDeleteConfirm(false)}>Annuler</button>
            <button className="btn-danger-sm" onClick={handleDeleteThread} disabled={deleting}>
              {deleting ? '…' : 'Supprimer'}
            </button>
          </div>
        </div>
      )}

      <div className="thread-body">
        {/* Post original */}
        <div className="thread-original">
          <div className="thread-original-author">
            <button className="avatar-sm avatar-btn" style={{ background: threadAuthor?.color }}
              onClick={() => openProfile(thread.profile_id)} title="Voir le profil">
              {threadAuthor?.emoji}
            </button>
            <div>
              <div className="thread-author-name">
                {threadAuthor?.emoji} · {threadAuthor?.age} ans
                <span className="participant-num">@0</span>
                <RoleBadge role={threadAuthor?.role} />
                {isOwner && <span className="badge-me">moi</span>}
              </div>
              <div className="thread-time">
                {new Date(thread.created_at).toLocaleString('fr-FR', {
                  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                })}
              </div>
            </div>
          </div>
          <p className="thread-original-content">
            <HighlightedText text={thread.content} participants={participants} />
          </p>
        </div>

        {/* Barre participants */}
        {participantList.length > 1 && (
          <div className="participants-bar">
            <span className="participants-bar-label">Participants :</span>
            {participantList.map(([num, p]) => (
              <button key={num} className="participant-chip" style={{ background: p.color }}
                onClick={() => { if (!isSuspended) insertMention(Number(num)) }}
                title={isSuspended ? `@${num}` : `Mentionner @${num}`}>
                {p.emoji} <span>@{num}</span>
              </button>
            ))}
          </div>
        )}

        <div className="replies-divider">
          {replies.length > 0
            ? `${replies.length} réponse${replies.length !== 1 ? 's' : ''}`
            : 'Sois le premier à répondre'}
        </div>

        {isSuspended && (
          <div className="thread-suspended-notice">
            {profile.status === 'suspended_perm' ? '🚫' : '⏸️'}
            &nbsp;Compte suspendu — lecture seule.
          </div>
        )}

        <div className="replies-list">
          {replies.map(reply => {
            const sender = reply.profiles || profileCache[reply.profile_id]
            const isMe   = reply.profile_id === profile.id
            const entry  = participantList.find(([, p]) => p.profile_id === reply.profile_id)
            const senderNum = entry ? entry[0] : '?'
            if (!sender) return null
            return (
              <div key={reply.id} className={`reply ${isMe ? 'mine' : ''}`}>
                <button className="avatar-sm avatar-btn" style={{ background: sender.color }}
                  onClick={() => openProfile(reply.profile_id)} title="Voir le profil">
                  {sender.emoji}
                </button>
                <div className="reply-wrap">
                  {!isMe && (
                    <div className="sender-name">
                      {sender.emoji}
                      <span className="participant-num">@{senderNum}</span>
                      · {sender.age} ans
                      <RoleBadge role={sender.role} />
                    </div>
                  )}
                  <div className="bubble">
                    <HighlightedText text={reply.content} participants={participants} />
                  </div>
                  <div className="reply-meta">
                    <div className="msg-time">
                      {new Date(reply.created_at).toLocaleTimeString('fr-FR', {
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </div>
                    {!isMe && (
                      <button className="reply-report-btn"
                        onClick={() => setReportTarget({ replyId: reply.id })}
                        title="Signaler">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
                          <line x1="4" y1="22" x2="4" y2="15"/>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Suggestions @ */}
      {showMentions && !isSuspended && participantList.length > 0 && (
        <div className="mention-suggestions">
          {participantList.map(([num, p]) => (
            <button key={num} className="mention-suggestion-item"
              onClick={() => insertMention(Number(num))}>
              <span style={{ background: p.color }} className="mention-avatar">{p.emoji}</span>
              @{num}
            </button>
          ))}
        </div>
      )}

      {/* Zone de saisie */}
      <div className="msg-input-area">
        <div className="avatar-sm" style={{ background: profile.color, flexShrink: 0 }}>
          {profile.emoji}
        </div>
        {isSuspended ? (
          <div className="suspended-input-placeholder">
            {profile.status === 'suspended_perm'
              ? '🚫 Compte suspendu — envoi désactivé'
              : '⏸️ Suspendu temporairement — envoi désactivé'}
          </div>
        ) : (
          <>
            <textarea ref={inputRef} className="msg-input" value={text}
              onChange={handleTextChange} onKeyDown={handleKeyDown}
              placeholder={myNumber === null
                ? 'Ta 1ère réponse te donnera un @…'
                : `Répondre en tant que @${myNumber}…`}
              rows={1} maxLength={500} style={{ flex: 1 }} />
            <button className="send-btn" onClick={sendReply} disabled={!text.trim() || sending}>
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </>
        )}
      </div>

      {reportTarget && (
        <ReportModal
          replyId={reportTarget.replyId}
          reporterId={profile.id}
          onClose={() => setReportTarget(null)}
          onSuccess={() => setReportTarget(null)}
        />
      )}

      {viewProfile && (
        <ProfilePopup
          profile={viewProfile}
          viewer={profile}
          onClose={() => setViewProfile(null)}
        />
      )}
    </div>
  )
}