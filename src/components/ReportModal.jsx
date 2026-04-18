import { useState } from 'react'
import { supabase } from '../lib/supabase'

const REASONS = [
  { id: 'spam',          label: '🔁 Spam',              desc: 'Contenu répétitif ou publicitaire' },
  { id: 'harassment',    label: '🚫 Harcèlement',       desc: 'Attaque personnelle ou intimidation' },
  { id: 'inappropriate', label: '⚠️ Contenu inapproprié', desc: 'Contenu offensant ou choquant' },
  { id: 'misinformation',label: '❌ Désinformation',    desc: 'Information fausse ou trompeuse' },
  { id: 'other',         label: '💬 Autre',              desc: 'Autre raison non listée' },
]

export default function ReportModal({ threadId, replyId, reporterId, onClose, onSuccess }) {
  const [reason, setReason]   = useState(null)
  const [details, setDetails] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone]       = useState(false)

  async function handleSubmit() {
    if (!reason || sending) return
    setSending(true)
    const { error } = await supabase.from('reports').insert({
      reporter_id: reporterId,
      thread_id:   threadId || null,
      reply_id:    replyId  || null,
      reason,
      details: details.trim() || null,
    })
    if (!error) { setDone(true); setTimeout(onSuccess, 1500) }
    setSending(false)
  }

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal">
        {done ? (
          <div className="modal-done">
            <div style={{ fontSize: 40 }}>✅</div>
            <strong>Signalement envoyé</strong>
            <p>Notre équipe de modération va examiner ce contenu.</p>
          </div>
        ) : (
          <>
            <div className="modal-header">
              <h3>Signaler ce contenu</h3>
              <button className="btn-icon" onClick={onClose}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="section-label">Raison du signalement</div>
              <div className="report-reasons">
                {REASONS.map(r => (
                  <button
                    key={r.id}
                    className={`report-reason-btn ${reason === r.id ? 'sel' : ''}`}
                    onClick={() => setReason(r.id)}
                  >
                    <span className="report-reason-label">{r.label}</span>
                    <span className="report-reason-desc">{r.desc}</span>
                  </button>
                ))}
              </div>
              {reason === 'other' && (
                <textarea
                  className="report-details"
                  value={details}
                  onChange={e => setDetails(e.target.value)}
                  placeholder="Décris le problème…"
                  maxLength={300} rows={3}
                />
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={onClose}>Annuler</button>
              <button className="btn-danger-solid" disabled={!reason || sending} onClick={handleSubmit}>
                {sending ? 'Envoi…' : 'Signaler'}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}