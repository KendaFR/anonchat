import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const ACTION_LABELS = {
  delete_reply:   '🗑️ Réponse supprimée',
  delete_thread:  '🗑️ Thread supprimé',
  suspend_temp:   '⏸️ Suspendu temporairement',
  suspend_perm:   '🚫 Suspendu définitivement',
  unsuspend:      '✅ Suspension levée',
  delete_account: '❌ Compte supprimé',
  send_warning:   '⚠️ Avertissement envoyé',
  dismiss_report: '✔️ Signalement ignoré',
}

export default function AdminPanel({ profile, onClose }) {
  const [tab, setTab]               = useState('reports')
  const [reports, setReports]       = useState([])
  const [profiles, setProfiles]     = useState([])
  const [searchId, setSearchId]     = useState('')
  const [targetProfile, setTarget]  = useState(null)
  const [actionModal, setActionModal] = useState(null) // { type, target }
  const [reason, setReason]         = useState('')
  const [duration, setDuration]     = useState(7)
  const [broadcastMsg, setBroadcast]= useState('')
  const [working, setWorking]       = useState(false)
  const [log, setLog]               = useState([])

  const isAdmin = profile.role === 'admin'

  useEffect(() => {
    loadReports()
    loadRecentProfiles()
    loadLog()
  }, [])

  async function loadReports() {
    const { data } = await supabase
      .from('reports')
      .select('*, profiles!reporter_id(emoji, color), threads(content), replies(content)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) setReports(data)
  }

  async function loadRecentProfiles() {
    const { data } = await supabase
      .from('profiles')
      .select('id, emoji, color, role, status, suspended_until, created_at')
      .order('created_at', { ascending: false })
      .limit(30)
    if (data) setProfiles(data)
  }

  async function loadLog() {
    const { data } = await supabase
      .from('moderation_actions')
      .select('*, profiles!moderator_id(emoji)')
      .order('created_at', { ascending: false })
      .limit(20)
    if (data) setLog(data)
  }

  async function searchProfile() {
    if (!searchId.trim()) return
    const { data } = await supabase
      .from('profiles').select('*').eq('id', searchId.trim()).single()
    setTarget(data || null)
  }

  // ─── Actions de modération ────────────────────────────────────────────
  async function runAction(action, target, extra = {}) {
    setWorking(true)
    const modAction = {
      moderator_id: profile.id,
      target_id:    target?.id,
      action,
      reason:       extra.reason || null,
      duration_days: extra.duration || null,
      thread_id:    extra.threadId || null,
      reply_id:     extra.replyId || null,
    }

    // Exécution de l'action
    if (action === 'delete_reply' && extra.replyId) {
      await supabase.from('replies').delete().eq('id', extra.replyId)
    } else if (action === 'delete_thread' && extra.threadId) {
      await supabase.from('threads').delete().eq('id', extra.threadId)
    } else if (action === 'suspend_temp') {
      const until = new Date(Date.now() + extra.duration * 86400000).toISOString()
      await supabase.from('profiles').update({
        status: 'suspended_temp', suspended_until: until
      }).eq('id', target.id)
    } else if (action === 'suspend_perm') {
      await supabase.from('profiles').update({
        status: 'suspended_perm', suspended_until: null
      }).eq('id', target.id)
    } else if (action === 'unsuspend') {
      await supabase.from('profiles').update({
        status: 'active', suspended_until: null
      }).eq('id', target.id)
    } else if (action === 'delete_account' && isAdmin) {
      await supabase.from('profiles').delete().eq('id', target.id)
    } else if (action === 'send_warning') {
      await supabase.from('notifications').insert({
        recipient_id: target.id, type: 'warning', message: extra.reason,
      })
    }

    // Enregistre dans le journal
    await supabase.from('moderation_actions').insert(modAction)

    // Si action depuis un signalement, marque comme reviewed
    if (extra.reportId) {
      await supabase.from('reports').update({
        status: 'reviewed', reviewed_by: profile.id
      }).eq('id', extra.reportId)
    }

    await Promise.all([loadReports(), loadRecentProfiles(), loadLog()])
    setActionModal(null); setReason(''); setTarget(null)
    setWorking(false)
  }

  async function dismissReport(reportId) {
    await supabase.from('reports').update({
      status: 'dismissed', reviewed_by: profile.id
    }).eq('id', reportId)
    await supabase.from('moderation_actions').insert({
      moderator_id: profile.id, action: 'dismiss_report',
    })
    loadReports()
  }

  async function sendBroadcast() {
    if (!broadcastMsg.trim() || !isAdmin) return
    setWorking(true)
    // Récupère tous les profils actifs
    const { data: allProfiles } = await supabase
      .from('profiles').select('id').eq('status', 'active')
    if (allProfiles) {
      const notifs = allProfiles
        .filter(p => p.id !== profile.id)
        .map(p => ({ recipient_id: p.id, type: 'system', message: broadcastMsg.trim() }))
      // Insert par batch de 100
      for (let i = 0; i < notifs.length; i += 100) {
        await supabase.from('notifications').insert(notifs.slice(i, i + 100))
      }
    }
    await supabase.from('moderation_actions').insert({
      moderator_id: profile.id, action: 'send_warning', reason: broadcastMsg.trim()
    })
    setBroadcast(''); setWorking(false)
    alert(`Message envoyé à ${allProfiles?.length - 1 || 0} utilisateurs.`)
  }

  function statusBadge(p) {
    if (p.status === 'suspended_perm') return <span className="status-badge suspended">🚫 Suspendu</span>
    if (p.status === 'suspended_temp') {
      const until = p.suspended_until ? new Date(p.suspended_until).toLocaleDateString('fr-FR') : '?'
      return <span className="status-badge suspended-temp">⏸️ Jusqu'au {until}</span>
    }
    return <span className="status-badge active">✅ Actif</span>
  }

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="admin-panel">
        {/* Header */}
        <div className="admin-header">
          <div>
            <h2>{isAdmin ? '⚡ Administration' : '🛡️ Modération'}</h2>
            <p className="subtitle">Connecté en tant que {profile.emoji} {profile.role}</p>
          </div>
          <button className="btn-icon" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="admin-tabs">
          {[
            { id: 'reports',  label: `Signalements${reports.length ? ` (${reports.length})` : ''}` },
            { id: 'users',    label: 'Utilisateurs' },
            ...(isAdmin ? [{ id: 'broadcast', label: '📢 Broadcast' }] : []),
            { id: 'log',      label: 'Journal' },
          ].map(t => (
            <button key={t.id}
              className={`admin-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>

        <div className="admin-body">

          {/* ── Signalements ── */}
          {tab === 'reports' && (
            <div className="admin-section">
              {reports.length === 0 && (
                <div className="admin-empty">✅ Aucun signalement en attente</div>
              )}
              {reports.map(r => (
                <div key={r.id} className="report-card">
                  <div className="report-card-header">
                    <div className="avatar-sm" style={{ background: r.profiles?.color }}>
                      {r.profiles?.emoji}
                    </div>
                    <div>
                      <div className="report-type">
                        {r.reply_id ? '💬 Réponse signalée' : '📌 Thread signalé'}
                        <span className="report-reason-tag">{r.reason}</span>
                      </div>
                      <div className="report-content">
                        "{(r.replies?.content || r.threads?.content || '').slice(0, 80)}…"
                      </div>
                    </div>
                  </div>
                  {r.details && <p className="report-details-text">"{r.details}"</p>}
                  <div className="report-actions">
                    <button className="btn-danger-sm"
                      onClick={() => runAction(
                        r.reply_id ? 'delete_reply' : 'delete_thread',
                        null,
                        { replyId: r.reply_id, threadId: r.thread_id, reportId: r.id, reason: r.reason }
                      )}>
                      🗑️ Supprimer
                    </button>
                    <button className="btn-ghost-sm" onClick={() => dismissReport(r.id)}>
                      Ignorer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Utilisateurs ── */}
          {tab === 'users' && (
            <div className="admin-section">
              {/* Recherche par ID */}
              <div className="admin-search">
                <input className="admin-input" value={searchId}
                  onChange={e => setSearchId(e.target.value)}
                  placeholder="UUID du profil…" />
                <button className="btn-primary-sm" onClick={searchProfile}>Chercher</button>
              </div>

              {targetProfile && (
                <div className="user-card">
                  <div className="user-card-header">
                    <div className="avatar-sm" style={{ background: targetProfile.color }}>
                      {targetProfile.emoji}
                    </div>
                    <div>
                      <div style={{ fontWeight: 500 }}>{targetProfile.emoji} Anonyme</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{targetProfile.id.slice(0, 16)}…</div>
                    </div>
                    {statusBadge(targetProfile)}
                  </div>
                  <div className="user-actions">
                    <button className="btn-warning-sm"
                      onClick={() => setActionModal({ type: 'warning', target: targetProfile })}>
                      ⚠️ Avertir
                    </button>
                    <button className="btn-warning-sm"
                      onClick={() => setActionModal({ type: 'suspend_temp', target: targetProfile })}>
                      ⏸️ Suspendre
                    </button>
                    <button className="btn-danger-sm"
                      onClick={() => runAction('suspend_perm', targetProfile, { reason: 'Modération' })}>
                      🚫 Indéfini
                    </button>
                    {targetProfile.status !== 'active' && (
                      <button className="btn-ghost-sm"
                        onClick={() => runAction('unsuspend', targetProfile)}>
                        ✅ Lever
                      </button>
                    )}
                    {isAdmin && (
                      <button className="btn-danger-solid"
                        onClick={() => setActionModal({ type: 'delete_account', target: targetProfile })}>
                        ❌ Supprimer le compte
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Liste des profils récents */}
              <div className="section-label" style={{ marginTop: 12 }}>Profils récents</div>
              {profiles.map(p => (
                <div key={p.id} className="user-list-item"
                  onClick={() => { setTarget(p); setSearchId(p.id) }}>
                  <div className="avatar-sm" style={{ background: p.color }}>{p.emoji}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{p.emoji} ·
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}> {p.id.slice(0, 12)}…</span>
                    </div>
                  </div>
                  {statusBadge(p)}
                </div>
              ))}
            </div>
          )}

          {/* ── Broadcast (admin only) ── */}
          {tab === 'broadcast' && isAdmin && (
            <div className="admin-section">
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                Envoie un message système à <strong>tous les utilisateurs actifs</strong>.
                Il apparaîtra dans leur panneau de notifications.
              </p>
              <textarea className="admin-textarea"
                value={broadcastMsg}
                onChange={e => setBroadcast(e.target.value)}
                placeholder="Message à diffuser à tous…"
                maxLength={500} rows={5} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>
                  {broadcastMsg.length}/500
                </span>
                <button className="btn-primary"
                  style={{ width: 'auto', padding: '10px 20px' }}
                  disabled={!broadcastMsg.trim() || working}
                  onClick={sendBroadcast}>
                  {working ? 'Envoi…' : '📢 Envoyer à tous'}
                </button>
              </div>
            </div>
          )}

          {/* ── Journal ── */}
          {tab === 'log' && (
            <div className="admin-section">
              {log.length === 0 && <div className="admin-empty">Aucune action enregistrée</div>}
              {log.map(a => (
                <div key={a.id} className="log-item">
                  <div className="log-item-left">
                    <span>{a.profiles?.emoji || '?'}</span>
                    <div>
                      <div className="log-action">{ACTION_LABELS[a.action] || a.action}</div>
                      {a.reason && <div className="log-reason">"{a.reason.slice(0, 60)}"</div>}
                    </div>
                  </div>
                  <div className="log-time">
                    {new Date(a.created_at).toLocaleString('fr-FR', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Modal d'action (warning / suspend_temp / delete_account) ── */}
        {actionModal && (
          <>
            <div className="modal-backdrop" style={{ zIndex: 60 }}
              onClick={() => setActionModal(null)} />
            <div className="modal" style={{ zIndex: 70 }}>
              <div className="modal-header">
                <h3>
                  {actionModal.type === 'warning'        && '⚠️ Envoyer un avertissement'}
                  {actionModal.type === 'suspend_temp'   && '⏸️ Suspension temporaire'}
                  {actionModal.type === 'delete_account' && '❌ Supprimer le compte'}
                </h3>
                <button className="btn-icon" onClick={() => setActionModal(null)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {actionModal.type === 'suspend_temp' && (
                  <div>
                    <label className="section-label">Durée (jours)</label>
                    <input type="number" className="admin-input" min={1} max={365}
                      value={duration} onChange={e => setDuration(parseInt(e.target.value))} />
                  </div>
                )}
                <div>
                  <label className="section-label">
                    {actionModal.type === 'warning' ? 'Message' : 'Raison'}
                  </label>
                  <textarea className="admin-textarea" value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder={actionModal.type === 'warning'
                      ? 'Message à envoyer à l\'utilisateur…'
                      : 'Raison de l\'action (visible dans le journal)…'}
                    rows={3} maxLength={300} />
                </div>
                {actionModal.type === 'delete_account' && (
                  <p style={{ fontSize: 13, color: 'var(--red)', background: 'var(--red-light)',
                    padding: '10px 12px', borderRadius: 8 }}>
                    ⚠️ Cette action est irréversible. Tous les threads et réponses seront supprimés.
                  </p>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn-ghost" onClick={() => setActionModal(null)}>Annuler</button>
                <button
                  className={actionModal.type === 'delete_account' ? 'btn-danger-solid' : 'btn-primary-sm'}
                  style={actionModal.type !== 'delete_account' ? { padding: '10px 20px' } : {}}
                  disabled={!reason.trim() || working}
                  onClick={() => runAction(actionModal.type, actionModal.target, {
                    reason, duration
                  })}>
                  {working ? '…' : 'Confirmer'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}