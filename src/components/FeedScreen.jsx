import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import ThreadCard from './ThreadCard'

export default function FeedScreen({ profile, onOpenThread, onOpenProfile }) {
  const [threads, setThreads]       = useState([])
  const [stats, setStats]           = useState({})   // { [thread_id]: { reply_count, participant_count } }
  const [onlineCount, setOnlineCount] = useState(1)
  const [newText, setNewText]       = useState('')
  const [posting, setPosting]       = useState(false)
  const [showCompose, setShowCompose] = useState(false)
  const presenceChannel             = useRef(null)

  useEffect(() => {
    loadThreads()
    const threadSub = subscribeThreads()
    const replySub  = subscribeReplies()
    setupPresence()

    return () => {
      supabase.removeChannel(threadSub)
      supabase.removeChannel(replySub)
      if (presenceChannel.current) supabase.removeChannel(presenceChannel.current)
    }
  }, [])

  // ─── Chargement initial ───────────────────────────────────────────────────
  async function loadThreads() {
    const { data: threadData } = await supabase
      .from('threads')
      .select('*, profiles(*)')
      .order('created_at', { ascending: false })
      .limit(50)

    if (!threadData) return
    setThreads(threadData)

    // Charge les stats pour tous les threads en une seule requête
    const ids = threadData.map(t => t.id)
    if (ids.length === 0) return
    const { data: statsData } = await supabase
      .from('thread_stats')
      .select('*')
      .in('thread_id', ids)

    if (statsData) {
      const map = {}
      statsData.forEach(s => { map[s.thread_id] = s })
      setStats(map)
    }
  }

  // ─── Realtime threads ─────────────────────────────────────────────────────
  function subscribeThreads() {
    return supabase.channel('feed-threads')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'threads' },
        async (payload) => {
          // Charge le profil auteur
          const { data: prof } = await supabase
            .from('profiles').select('*').eq('id', payload.new.profile_id).single()
          const thread = { ...payload.new, profiles: prof }
          setThreads(prev => [thread, ...prev])
          setStats(prev => ({ ...prev, [thread.id]: { reply_count: 0, participant_count: 0 } }))
        }
      )
      .subscribe()
  }

  // ─── Realtime replies (pour mettre à jour les stats en direct) ────────────
  function subscribeReplies() {
    return supabase.channel('feed-replies')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'replies' },
        async (payload) => {
          const tid = payload.new.thread_id
          // Recharge les stats de ce thread uniquement
          const { data } = await supabase
            .from('thread_stats').select('*').eq('thread_id', tid).single()
          if (data) setStats(prev => ({ ...prev, [tid]: data }))
        }
      )
      .subscribe()
  }

  // ─── Présence temps réel ──────────────────────────────────────────────────
  function setupPresence() {
    presenceChannel.current = supabase.channel('online-users', {
      config: { presence: { key: profile.id } }
    })
    .on('presence', { event: 'sync' }, () => {
      const state = presenceChannel.current.presenceState()
      // Compte seulement les profils avec show_presence: true
      let count = 0
      Object.values(state).forEach(presences => {
        presences.forEach(p => { if (p.show_presence !== false) count++ })
      })
      setOnlineCount(count)
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await presenceChannel.current.track({
          profile_id: profile.id,
          show_presence: profile.show_presence
        })
      }
    })
  }

  // ─── Poster un thread ─────────────────────────────────────────────────────
  async function handlePost() {
    const content = newText.trim()
    if (!content || posting) return
    setPosting(true)
    const { error } = await supabase
      .from('threads')
      .insert({ profile_id: profile.id, content })
    if (!error) { setNewText(''); setShowCompose(false) }
    setPosting(false)
  }

  return (
    <div className="screen feed-screen">
      {/* Header */}
      <div className="feed-header">
        <div>
          <div className="feed-title">Feed public</div>
          <div className="online-info">
            <span className="dot-green" />
            {onlineCount} connecté{onlineCount > 1 ? 's' : ''}
          </div>
        </div>
        <button className="btn-icon" onClick={onOpenProfile}>
          <div className="avatar-sm" style={{ background: profile.color }}>{profile.emoji}</div>
        </button>
      </div>

      {/* Compose box */}
      {showCompose ? (
        <div className="compose-box">
          <textarea
            className="compose-input"
            value={newText}
            onChange={e => setNewText(e.target.value)}
            placeholder="Quoi de neuf ? Lance un sujet…"
            maxLength={500}
            autoFocus
            rows={3}
          />
          <div className="compose-actions">
            <span className="char-count">{newText.length}/500</span>
            <button className="btn-ghost-sm" onClick={() => { setShowCompose(false); setNewText('') }}>
              Annuler
            </button>
            <button className="btn-primary-sm" disabled={!newText.trim() || posting} onClick={handlePost}>
              {posting ? '…' : 'Publier'}
            </button>
          </div>
        </div>
      ) : (
        <button className="compose-trigger" onClick={() => setShowCompose(true)}>
          <div className="avatar-sm" style={{ background: profile.color }}>{profile.emoji}</div>
          <span>Lance un sujet…</span>
        </button>
      )}

      {/* Thread list */}
      <div className="feed-list">
        {threads.length === 0 && (
          <div className="empty-feed">
            <div style={{ fontSize: 40 }}>🌱</div>
            <p>Personne n'a encore posté. Sois le premier !</p>
          </div>
        )}
        {threads.map(thread => (
          <ThreadCard
            key={thread.id}
            thread={thread}
            stats={stats[thread.id] || { reply_count: 0, participant_count: 0 }}
            isMe={thread.profile_id === profile.id}
            onClick={() => onOpenThread(thread)}
          />
        ))}
      </div>
    </div>
  )
}