import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import ThreadCard from './ThreadCard'

const TABS             = ['Récents', 'Discutés', 'Populaires']
const REFRESH_INTERVAL = 5 * 60 * 1000

export default function FeedScreen({ profile, onOpenThread, onOpenProfile, unreadCount, onOpenNotifs }) {
  const [threads, setThreads]             = useState([])
  const [stats, setStats]                 = useState({})
  const [myVotes, setMyVotes]             = useState({})
  const [onlineCount, setOnlineCount]     = useState(1)
  const [activeTab, setActiveTab]         = useState('Récents')
  const [newText, setNewText]             = useState('')
  const [posting, setPosting]             = useState(false)
  const [showCompose, setShowCompose]     = useState(false)
  const [lastRefresh, setLastRefresh]     = useState(new Date())
  const [refreshing, setRefreshing]       = useState(false)
  const [lowScoreAlert, setLowScoreAlert] = useState(null)
  const presenceChannel = useRef(null)
  const refreshTimer    = useRef(null)

  useEffect(() => {
    loadAll()
    const threadSub = subscribeThreads()
    const replySub  = subscribeReplies()
    const voteSub   = subscribeVotes()
    setupPresence()
    scheduleAutoRefresh()
    return () => {
      supabase.removeChannel(threadSub)
      supabase.removeChannel(replySub)
      supabase.removeChannel(voteSub)
      if (presenceChannel.current) supabase.removeChannel(presenceChannel.current)
      clearTimeout(refreshTimer.current)
    }
  }, [])

  useEffect(() => {
    const myThreads = threads.filter(t => t.profile_id === profile.id)
    for (const t of myThreads) {
      const s = stats[t.id]
      if (s && Number(s.vote_score) <= -10 && !lowScoreAlert) {
        setLowScoreAlert(t); break
      }
    }
  }, [stats, threads])

  async function loadAll() {
    setRefreshing(true)
    await Promise.all([loadThreads(), loadMyVotes()])
    setLastRefresh(new Date())
    setRefreshing(false)
  }

  async function loadThreads() {
    const { data } = await supabase
      .from('threads').select('*, profiles(*)')
      .order('created_at', { ascending: false }).limit(100)
    if (!data) return
    setThreads(data)
    const ids = data.map(t => t.id)
    if (!ids.length) return
    const { data: sd } = await supabase.from('thread_stats').select('*').in('thread_id', ids)
    if (sd) { const m = {}; sd.forEach(s => { m[s.thread_id] = s }); setStats(m) }
  }

  async function loadMyVotes() {
    const { data } = await supabase.from('votes').select('thread_id, value').eq('profile_id', profile.id)
    if (data) { const m = {}; data.forEach(v => { m[v.thread_id] = v.value }); setMyVotes(m) }
  }

  function scheduleAutoRefresh() {
    refreshTimer.current = setTimeout(() => { loadAll(); scheduleAutoRefresh() }, REFRESH_INTERVAL)
  }
  function handleManualRefresh() {
    clearTimeout(refreshTimer.current); loadAll(); scheduleAutoRefresh()
  }

  function subscribeThreads() {
    return supabase.channel('feed-threads')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'threads' },
        async ({ new: n }) => {
          const { data: prof } = await supabase.from('profiles').select('*').eq('id', n.profile_id).single()
          setThreads(prev => [{ ...n, profiles: prof }, ...prev])
          setStats(prev => ({ ...prev, [n.id]: { reply_count: 0, participant_count: 0, vote_score: 0, replies_24h: 0 } }))
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'threads' },
        ({ old }) => {
          setThreads(prev => prev.filter(t => t.id !== old.id))
          setStats(prev => { const c = { ...prev }; delete c[old.id]; return c })
        })
      .subscribe()
  }

  function subscribeReplies() {
    return supabase.channel('feed-replies')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'replies' },
        async ({ new: n }) => {
          const { data } = await supabase.from('thread_stats').select('*').eq('thread_id', n.thread_id).single()
          if (data) setStats(prev => ({ ...prev, [n.thread_id]: data }))
        })
      .subscribe()
  }

  function subscribeVotes() {
    return supabase.channel('feed-votes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' },
        async ({ new: n, old }) => {
          const tid = (n && n.thread_id) || (old && old.thread_id)
          if (!tid) return
          const { data } = await supabase.from('thread_stats').select('*').eq('thread_id', tid).single()
          if (data) setStats(prev => ({ ...prev, [tid]: data }))
        })
      .subscribe()
  }

  async function handleVote(threadId, value) {
    const current  = myVotes[threadId] || 0
    const isCancel = current === value
    const delta    = isCancel ? -value : (current !== 0 ? value - current : value)

    setStats(prev => ({
      ...prev,
      [threadId]: {
        ...(prev[threadId] || { reply_count: 0, participant_count: 0, replies_24h: 0, vote_score: 0 }),
        vote_score: Number(prev[threadId]?.vote_score || 0) + delta
      }
    }))
    setMyVotes(prev => {
      const c = { ...prev }
      if (isCancel) delete c[threadId]; else c[threadId] = value
      return c
    })

    if (isCancel) {
      await supabase.from('votes').delete().eq('thread_id', threadId).eq('profile_id', profile.id)
    } else {
      await supabase.from('votes').upsert(
        { thread_id: threadId, profile_id: profile.id, value },
        { onConflict: 'thread_id,profile_id' }
      )
    }
  }

  async function handlePost() {
    const content = newText.trim()
    if (!content || posting) return
    setPosting(true)
    const { data: thread } = await supabase
      .from('threads').insert({ profile_id: profile.id, content }).select().single()
    // L'auteur devient automatiquement @0 à la création du thread
    if (thread) {
      await supabase.from('thread_participants').insert({
        thread_id: thread.id, profile_id: profile.id, participant_number: 0
      })
    }
    setNewText(''); setShowCompose(false); setPosting(false)
  }

  async function handleDeleteFromAlert(thread) {
    await supabase.from('threads').delete().eq('id', thread.id)
    setLowScoreAlert(null)
  }

  const sortedThreads = useCallback(() => {
    return [...threads].sort((a, b) => {
      const sa = stats[a.id] || { reply_count: 0, vote_score: 0, replies_24h: 0 }
      const sb = stats[b.id] || { reply_count: 0, vote_score: 0, replies_24h: 0 }
      if (activeTab === 'Récents')    return new Date(b.created_at) - new Date(a.created_at)
      if (activeTab === 'Discutés')   return Number(sb.replies_24h || 0) - Number(sa.replies_24h || 0)
      if (activeTab === 'Populaires') return Number(sb.vote_score || 0) - Number(sa.vote_score || 0)
      return 0
    })
  }, [threads, stats, activeTab])

  function formatRefreshTime(date) {
    const diff = Math.floor((Date.now() - date.getTime()) / 1000)
    if (diff < 60) return 'À l\'instant'
    if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  }

  function setupPresence() {
    presenceChannel.current = supabase.channel('online-users', { config: { presence: { key: profile.id } } })
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.current.presenceState()
        let count = 0
        Object.values(state).forEach(ps => { ps.forEach(p => { if (p.show_presence !== false) count++ }) })
        setOnlineCount(count)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.current.track({ profile_id: profile.id, show_presence: profile.show_presence })
        }
      })
  }

  return (
    <div className="screen feed-screen">
      <div className="feed-header">
        {/* Gauche : cloche notifications */}
        <button className="notif-bell-btn" onClick={onOpenNotifs}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          {unreadCount > 0 && (
            <span className="notif-bell-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
          )}
        </button>

        {/* Centre : titre */}
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div className="feed-title">Feed public</div>
          <div className="online-info" style={{ justifyContent: 'center' }}>
            <span className="dot-green" />
            {onlineCount} connecté{onlineCount > 1 ? 's' : ''}
          </div>
        </div>

        {/* Droite : refresh + avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button className={`btn-refresh ${refreshing ? 'spinning' : ''}`}
            onClick={handleManualRefresh} disabled={refreshing}
            title={`Rafraîchi ${formatRefreshTime(lastRefresh)}`}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
          <button className="btn-icon" onClick={onOpenProfile}>
            <div className="avatar-sm" style={{ background: profile.color }}>{profile.emoji}</div>
          </button>
        </div>
      </div>

      {lowScoreAlert && (
        <div className="low-score-alert">
          <div className="low-score-icon">⚠️</div>
          <div className="low-score-body">
            <strong>Ton thread est très downvoté</strong>
            <p>Score : {stats[lowScoreAlert.id]?.vote_score ?? '−10'}. Tu peux le supprimer ou le laisser.</p>
            <div className="low-score-actions">
              <button className="btn-ghost-sm" onClick={() => setLowScoreAlert(null)}>Laisser</button>
              <button className="btn-danger-sm" onClick={() => handleDeleteFromAlert(lowScoreAlert)}>Supprimer</button>
            </div>
          </div>
        </div>
      )}

      {showCompose ? (
        <div className="compose-box">
          <textarea className="compose-input" value={newText}
            onChange={e => setNewText(e.target.value)}
            placeholder="Quoi de neuf ? Lance un sujet…" maxLength={500} autoFocus rows={3} />
          <div className="compose-actions">
            <span className="char-count">{newText.length}/500</span>
            <button className="btn-ghost-sm" onClick={() => { setShowCompose(false); setNewText('') }}>Annuler</button>
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

      <div className="feed-tabs">
        {TABS.map(tab => (
          <button key={tab} className={`feed-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}>{tab}</button>
        ))}
        <div className="refresh-hint">
          {refreshing ? 'Rafraîchissement…' : formatRefreshTime(lastRefresh)}
        </div>
      </div>

      <div className="feed-list">
        {threads.length === 0 && !refreshing && (
          <div className="empty-feed">
            <div style={{ fontSize: 40 }}>🌱</div>
            <p>Personne n'a encore posté. Sois le premier !</p>
          </div>
        )}
        {sortedThreads().map(thread => (
          <ThreadCard
            key={thread.id} thread={thread}
            stats={stats[thread.id] || { reply_count: 0, participant_count: 0, vote_score: 0 }}
            isMe={thread.profile_id === profile.id}
            myVote={myVotes[thread.id] || 0}
            onVote={val => handleVote(thread.id, val)}
            onClick={() => onOpenThread(thread)}
          />
        ))}
      </div>
    </div>
  )
}