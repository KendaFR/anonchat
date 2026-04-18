import RoleBadge from './RoleBadge'

export default function ThreadCard({ thread, stats, isMe, myVote, onVote, onClick, onReport }) {
  const author = thread.profiles
  const score  = Number(stats.vote_score ?? 0)
  const time   = new Date(thread.created_at).toLocaleString('fr-FR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  })

  function handleVoteClick(e, val) { e.stopPropagation(); onVote(val) }
  function handleReport(e)         { e.stopPropagation(); onReport?.() }

  const scoreColor = score > 0 ? 'var(--green)' : score < 0 ? 'var(--red)' : 'var(--text-muted)'

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
            <RoleBadge role={author?.role} />
          </span>
          <span className="thread-time">{time}</span>
        </div>
        {!isMe && (
          <button className="report-btn" onClick={handleReport} title="Signaler ce thread">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
              <line x1="4" y1="22" x2="4" y2="15"/>
            </svg>
          </button>
        )}
      </div>

      <p className="thread-content">{thread.content}</p>

      <div className="thread-footer">
        <div className="vote-group" onClick={e => e.stopPropagation()}>
          <button className={`vote-btn up ${myVote === 1 ? 'active' : ''}`}
            onClick={e => handleVoteClick(e, 1)} title="Upvote">
            <svg width="13" height="13" viewBox="0 0 24 24"
              fill={myVote === 1 ? 'currentColor' : 'none'}
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="18 15 12 9 6 15"/>
            </svg>
          </button>
          <span className="vote-score" style={{ color: scoreColor }}>
            {score > 0 ? `+${score}` : score}
          </span>
          <button className={`vote-btn down ${myVote === -1 ? 'active' : ''}`}
            onClick={e => handleVoteClick(e, -1)} title="Downvote">
            <svg width="13" height="13" viewBox="0 0 24 24"
              fill={myVote === -1 ? 'currentColor' : 'none'}
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        </div>

        <span className="thread-stat">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          {stats.reply_count}
        </span>
        <span className="thread-stat">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
          </svg>
          {stats.participant_count}
        </span>
        <span className="thread-reply-cta">Voir →</span>
      </div>
    </div>
  )
}