import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const TYPE_LABELS = {
  mention:         '💬 t\'a mentionné',
  reply_in_thread: '🗨️ nouvelle réponse',
  new_thread:      '🆕 nouveau thread',
  system:          '📢 Message système',
  warning:         '⚠️ Avertissement',
  reputation:      '⭐ Point de réputation reçu',
}

export default function NotificationPanel({
  notifications, unreadCount, loading,
  markRead, markAllRead, deleteNotif,
  profile, onClose, onOpenThread
}) {
  const [prefs, setPrefs] = useState({})
  const [activeFilter, setActiveFilter] = useState('all')

  useEffect(() => { loadPrefs() }, [profile.id])

  async function loadPrefs() {
    const { data } = await supabase
      .from('notification_prefs').select('*').eq('profile_id', profile.id)
    if (data) {
      const map = {}
      data.forEach(p => { map[p.thread_id] = { all_replies: p.all_replies } })
      setPrefs(map)
    }
  }

  async function toggleThreadPref(threadId) {
    const current = prefs[threadId]?.all_replies ?? true
    const newVal  = !current
    await supabase.from('notification_prefs').upsert(
      { profile_id: profile.id, thread_id: threadId, all_replies: newVal },
      { onConflict: 'profile_id,thread_id' }
    )
    setPrefs(prev => ({ ...prev, [threadId]: { all_replies: newVal } }))
  }

  const filtered = notifications.filter(n =>
    activeFilter === 'all' ? true : !n.is_read
  )

  // Grouper par thread (les notifs system/warning n'ont pas de thread_id)
  const grouped = filtered.reduce((acc, n) => {
    const key = n.thread_id || '__system__'
    if (!acc[key]) acc[key] = { threadContent: n.threads?.content || null, isSystem: !n.thread_id, items: [] }
    acc[key].items.push(n)
    return acc
  }, {})

  function handleNotifClick(notif) {
    markRead(notif.id)
    if (notif.thread_id) onOpenThread(notif.thread_id)
  }

  function truncate(str, len = 60) {
    if (!str) return ''
    return str.length > len ? str.slice(0, len) + '…' : str
  }

  return (
    <>
      <div className="notif-backdrop" onClick={onClose} />

      <div className="notif-panel">
        <div className="notif-header">
          <div>
            <h2>Notifications</h2>
            {unreadCount > 0 && (
              <span className="notif-count-badge">{unreadCount} non lue{unreadCount > 1 ? 's' : ''}</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {unreadCount > 0 && (
              <button className="btn-link" onClick={markAllRead}>Tout lire</button>
            )}
            <button className="btn-icon" onClick={onClose}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        <div className="notif-filters">
          <button className={`notif-filter-btn ${activeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setActiveFilter('all')}>Toutes</button>
          <button className={`notif-filter-btn ${activeFilter === 'unread' ? 'active' : ''}`}
            onClick={() => setActiveFilter('unread')}>Non lues</button>
        </div>

        <div className="notif-body">
          {loading && <div className="notif-empty">Chargement…</div>}

          {!loading && filtered.length === 0 && (
            <div className="notif-empty">
              <div style={{ fontSize: 36 }}>🔔</div>
              <p>{activeFilter === 'unread' ? 'Pas de notification non lue.' : 'Aucune notification.'}</p>
            </div>
          )}

          {Object.entries(grouped).map(([key, group]) => (
            <div key={key} className="notif-group">
              <div className="notif-group-header">
                <span className="notif-group-title">
                  {group.isSystem
                    ? group.items.some(n => n.type === 'reputation')
                        ? '⭐ Réputation & Système'
                        : '📢 Notifications système'
                    : `📌 ${truncate(group.threadContent, 45) || 'Thread supprimé'}`}
                </span>
                {!group.isSystem && (
                  <button
                    className={`notif-pref-toggle ${(prefs[key]?.all_replies ?? true) ? 'on' : 'off'}`}
                    onClick={() => toggleThreadPref(key)}
                    title={(prefs[key]?.all_replies ?? true)
                      ? 'Toutes les réponses — cliquer pour mentions seulement'
                      : 'Mentions seulement — cliquer pour tout recevoir'}
                  >
                    {(prefs[key]?.all_replies ?? true) ? '🔔' : '🔕'}
                  </button>
                )}
              </div>

              {group.items.map(notif => (
                <div
                  key={notif.id}
                  className={`notif-item ${notif.is_read ? 'read' : 'unread'}`}
                  onClick={() => handleNotifClick(notif)}
                >
                  <div className="notif-item-left">
                    {notif.replies?.profiles ? (
                      <div className="avatar-sm" style={{ background: notif.replies.profiles.color }}>
                        {notif.replies.profiles.emoji}
                      </div>
                    ) : (
                      <div className="avatar-sm" style={{ background: '#EEEDFE', fontSize: 16 }}>
                        {notif.type === 'warning' ? '⚠️' : notif.type === 'reputation' ? '⭐' : '📢'}
                      </div>
                    )}
                    <div className="notif-item-content">
                      <div className="notif-type-label">{TYPE_LABELS[notif.type] || notif.type}</div>
                      {notif.message && (
                        <div className="notif-preview">"{truncate(notif.message, 60)}"</div>
                      )}
                      {notif.replies?.content && (
                        <div className="notif-preview">"{truncate(notif.replies.content, 50)}"</div>
                      )}
                      <div className="notif-time">
                        {new Date(notif.created_at).toLocaleString('fr-FR', {
                          day: '2-digit', month: 'short',
                          hour: '2-digit', minute: '2-digit'
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="notif-item-actions" onClick={e => e.stopPropagation()}>
                    {!notif.is_read && (
                      <button className="notif-mark-btn" onClick={() => markRead(notif.id)}
                        title="Marquer comme lu">●</button>
                    )}
                    <button className="notif-delete-btn" onClick={() => deleteNotif(notif.id)}
                      title="Supprimer">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14H6L5 6"/>
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}