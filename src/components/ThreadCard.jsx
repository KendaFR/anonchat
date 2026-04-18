export default function ThreadCard({ thread, stats, isMe, onClick }) {
  const author = thread.profiles
  const time = new Date(thread.created_at).toLocaleString('fr-FR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  })

  return (
    <div className={`thread-card ${isMe ? 'mine' : ''}`} onClick={onClick}>
      <div className="thread-card-header">
        <div className="avatar-sm" style={{ background: author?.color || '#eee' }}>
          {author?.emoji || '?'}
        </div>
        <div className="thread-author-info">
          <span className="thread-author-name">
            {author?.emoji} · {author?.age} ans
            {isMe && <span className="badge-me">moi</span>}
          </span>
          <span className="thread-time">{time}</span>
        </div>
      </div>

      <p className="thread-content">{thread.content}</p>

      <div className="thread-footer">
        <span className="thread-stat">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          {stats.reply_count} réponse{stats.reply_count !== 1 ? 's' : ''}
        </span>
        <span className="thread-stat">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          {stats.participant_count} participant{stats.participant_count !== 1 ? 's' : ''}
        </span>
        <span className="thread-reply-cta">Répondre →</span>
      </div>
    </div>
  )
}