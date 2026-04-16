export default function Message({ message, sender, isMe }) {
  const time = new Date(message.created_at).toLocaleTimeString('fr-FR', {
    hour: '2-digit', minute: '2-digit'
  })

  if (!sender) return null

  return (
    <div className={`msg ${isMe ? 'mine' : ''}`}>
      <div className="avatar-sm" style={{ background: sender.color }}>
        {sender.emoji}
      </div>
      <div className="msg-wrap">
        {!isMe && (
          <div className="sender-name">
            {sender.emoji} · {sender.age} ans
          </div>
        )}
        <div className="bubble">{message.content}</div>
        <div className="msg-time">{time}</div>
      </div>
    </div>
  )
}