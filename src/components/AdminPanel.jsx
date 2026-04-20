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

// Catégories de raisons de suspension
const SUSPENSION_REASONS = [
  { id: 'spam',        label: '🔁 Spam',              desc: 'Envoi massif de messages répétitifs' },
  { id: 'harassment',  label: '🚫 Harcèlement',       desc: 'Comportement hostile ou intimidant' },
  { id: 'offensive',   label: '⚠️ Contenu offensant', desc: 'Propos inappropriés ou choquants' },
  { id: 'hate',        label: '💢 Discours haineux',  desc: 'Incitation à la haine ou discrimination' },
  { id: 'ban_evasion', label: '🔄 Contournement',     desc: 'Création de compte après suspension' },
  { id: 'other',       label: '💬 Autre',              desc: 'Autre raison (préciser ci-dessous)' },
]

// Catégories de l'onglet signalements
const REPORT_CATEGORIES = ['Tous', 'spam', 'harassment', 'inappropriate', 'misinformation', 'other']

export default function AdminPanel({ profile, onClose, onOpenThread }) {
  const [tab, setTab]               = useState('reports')
  const [reports, setReports]       = useState([])
  const [reportFilter, setReportFilter] = useState('Tous')
  const [profiles, setProfiles]     = useState([])
  const [searchId, setSearchId]     = useState('')
  const [targetProfile, setTarget]  = useState(null)
  const [userThreads, setUserThreads] = useState([])  // threads du profil sélectionné
  const [actionModal, setActionModal] = useState(null)
  const [suspendReason, setSuspendReason] = useState(null)  // id de la catégorie choisie
  const [reasonDetail, setReasonDetail]   = useState('')    // texte libre si 'other'
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

  // ─── Chargements ──────────────────────────────────────────────────────────
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
      .select('id, emoji, color, role, status, suspended_until, suspension_reason, created_at')
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
    if (data) loadUserThreads(data.id)
  }

  async function loadUserThreads(profileId) {
    const { data } = await supabase
      .from('threads').select('id, content, created_at')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
      .limit(10)
    setUserThreads(data || [])
  }

  // ─── Action principale ────────────────────────────────────────────────────
  async function runAction(action, target, extra = {}) {
    setWorking(true)

    // Calcule le motif final (catégorie + détail)
    const fullReason = extra.reason || reasonDetail

    if (action === 'delete_reply' && extra.replyId) {
      await supabase.from('replies').delete().eq('id', extra.replyId)

    } else if (action === 'delete_thread' && extra.threadId) {
      await supabase.from('threads').delete().eq('id', extra.threadId)

    } else if (action === 'suspend_temp') {
      const until = new Date(Date.now() + extra.duration * 86_400_000).toISOString()
      await supabase.from('profiles').update({
        status:            'suspended_temp',
        suspended_until:   until,
        suspension_reason: fullReason || null,
      }).eq('id', target.id)

    } else if (action === 'suspend_perm') {
      await supabase.from('profiles').update({
        status:            'suspended_perm',
        suspended_until:   null,
        suspension_reason: fullReason || null,
      }).eq('id', target.id)

    } else if (action === 'unsuspend') {
      await supabase.from('profiles').update({
        status:            'active',
        suspended_until:   null,
        suspension_reason: null,
      }).eq('id', target.id)

    } else if (action === 'delete_account' && isAdmin) {
      // Journal AVANT le DELETE — sinon la FK target_id → profiles échoue
      await supabase.from('moderation_actions').insert({
        moderator_id: profile.id,
        target_id:    null,    // null car le profil va disparaître
        action:       'delete_account',
        reason:       fullReason || null,
      })
      await supabase.from('profiles').delete().eq('id', target.id)
      // Nettoyage et retour immédiat (pas besoin de recharger les signalements)
      setActionModal(null); setSuspendReason(null); setReasonDetail(''); setTarget(null)
      await Promise.all([loadRecentProfiles(), loadLog()])
      setWorking(false)
      return

    } else if (action === 'send_warning') {
      await supabase.from('notifications').insert({
        recipient_id: target.id,
        type:         'warning',
        message:      fullReason,
      })
    }

    // Journal (toutes les autres actions sauf delete_account)
    await supabase.from('moderation_actions').insert({
      moderator_id:  profile.id,
      target_id:     target?.id || null,
      action,
      reason:        fullReason || null,
      duration_days: extra.duration || null,
      thread_id:     extra.threadId || null,
      reply_id:      extra.replyId  || null,
    })

    // Marque le signalement comme traité
    if (extra.reportId) {
      await supabase.from('reports').update({
        status: 'reviewed', reviewed_by: profile.id
      }).eq('id', extra.reportId)
    }

    await Promise.all([loadReports(), loadRecentProfiles(), loadLog()])
    setActionModal(null)
    setSuspendReason(null)
    setReasonDetail('')
    // Garde le profil sélectionné si on vient de supprimer un de ses threads
    if (action === 'delete_thread' && target === null && targetProfile) {
      loadUserThreads(targetProfile.id)
    } else {
      setTarget(null)
      setUserThreads([])
    }
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
    const { data: allProfiles } = await supabase
      .from('profiles').select('id').eq('status', 'active')
    if (allProfiles) {
      const notifs = allProfiles
        .filter(p => p.id !== profile.id)
        .map(p => ({ recipient_id: p.id, type: 'system', message: broadcastMsg.trim() }))
      for (let i = 0; i < notifs.length; i += 100) {
        await supabase.from('notifications').insert(notifs.slice(i, i + 100))
      }
    }
    await supabase.from('moderation_actions').insert({
      moderator_id: profile.id, action: 'send_warning', reason: broadcastMsg.trim()
    })
    setBroadcast(''); setWorking(false)
    alert(`Message envoyé à ${(allProfiles?.length ?? 1) - 1} utilisateurs.`)
  }

  function statusBadge(p) {
    if (p.status === 'suspended_perm')
      return <span className="status-badge suspended">🚫 Suspendu définitivement</span>
    if (p.status === 'suspended_temp') {
      const until = p.suspended_until
        ? new Date(p.suspended_until).toLocaleDateString('fr-FR') : '?'
      return <span className="status-badge suspended-temp">⏸️ Jusqu'au {until}</span>
    }
    return <span className="status-badge active">✅ Actif</span>
  }

  // Raison finale pour les actions de suspension
  function getFinalReason() {
    if (!suspendReason) return ''
    const cat = SUSPENSION_REASONS.find(r => r.id === suspendReason)
    const label = cat?.label || suspendReason
    return suspendReason === 'other' && reasonDetail.trim()
      ? `${label} — ${reasonDetail.trim()}`
      : label
  }

  const filteredReports = reportFilter === 'Tous'
    ? reports
    : reports.filter(r => r.reason === reportFilter)

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="admin-panel">

        {/* ── Header ── */}
        <div className="admin-header">
          <div>
            <h2>{isAdmin ? '⚡ Administration' : '🛡️ Modération'}</h2>
            <p className="subtitle">Connecté en tant que {profile.emoji} {profile.role}</p>
          </div>
          <button className="btn-icon" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* ── Onglets ── */}
        <div className="admin-tabs">
          {[
            { id: 'reports',   label: `Signalements${reports.length ? ` (${reports.length})` : ''}` },
            { id: 'users',     label: 'Utilisateurs' },
            ...(isAdmin ? [{ id: 'broadcast', label: '📢 Broadcast' }] : []),
            { id: 'log',       label: 'Journal' },
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
              {/* Catégories de filtre */}
              <div className="report-category-bar">
                {REPORT_CATEGORIES.map(cat => (
                  <button key={cat}
                    className={`report-cat-btn ${reportFilter === cat ? 'active' : ''}`}
                    onClick={() => setReportFilter(cat)}>
                    {cat === 'Tous' ? 'Tous' : cat}
                    {cat !== 'Tous' && (
                      <span className="report-cat-count">
                        {reports.filter(r => r.reason === cat).length}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {filteredReports.length === 0 && (
                <div className="admin-empty">✅ Aucun signalement dans cette catégorie</div>
              )}

              {filteredReports.map(r => (
                <div key={r.id} className="report-card">
                  <div className="report-card-header">
                    <div className="avatar-sm" style={{ background: r.profiles?.color }}>
                      {r.profiles?.emoji}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="report-type">
                        {r.reply_id ? '💬 Réponse' : '📌 Thread'}
                        <span className="report-reason-tag">{r.reason}</span>
                        <span className="report-time">
                          {new Date(r.created_at).toLocaleDateString('fr-FR')}
                        </span>
                      </div>
                      <div className="report-content">
                        "{(r.replies?.content || r.threads?.content || '').slice(0, 100)}"
                      </div>
                    </div>
                  </div>
                  {r.details && (
                    <p className="report-details-text">Détails : "{r.details}"</p>
                  )}
                  <div className="report-actions">
                    {/* Ouvrir le thread concerné */}
                    {r.thread_id && onOpenThread && (
                      <button className="btn-ghost-sm"
                        onClick={() => { onClose(); onOpenThread(r.thread_id) }}>
                        👁️ Voir le thread
                      </button>
                    )}
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
              <div className="admin-search">
                <input className="admin-input" value={searchId}
                  onChange={e => setSearchId(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchProfile()}
                  placeholder="UUID du profil…" />
                <button className="btn-primary-sm" onClick={searchProfile}>Chercher</button>
              </div>

              {targetProfile && (
                <div className="user-card">
                  <div className="user-card-header">
                    <div className="avatar-sm" style={{ background: targetProfile.color }}>
                      {targetProfile.emoji}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500 }}>{targetProfile.emoji} Anonyme</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {targetProfile.id.slice(0, 16)}…
                      </div>
                      {/* Raison de suspension visible dans le panel admin */}
                      {targetProfile.suspension_reason && (
                        <div className="admin-suspension-reason">
                          Motif : {targetProfile.suspension_reason}
                        </div>
                      )}
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
                      ⏸️ Suspendre temp.
                    </button>
                    <button className="btn-danger-sm"
                      onClick={() => setActionModal({ type: 'suspend_perm', target: targetProfile })}>
                      🚫 Suspendre déf.
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
                        ❌ Supprimer
                      </button>
                    )}
                  </div>

                  {/* Threads du profil sélectionné */}
                  {userThreads.length > 0 && (
                    <div className="user-threads-section">
                      <div className="section-label" style={{ marginBottom: 6 }}>
                        Threads ({userThreads.length})
                      </div>
                      {userThreads.map(t => (
                        <div key={t.id} className="user-thread-item">
                          <p className="user-thread-content">
                            {t.content.slice(0, 80)}{t.content.length > 80 ? '…' : ''}
                          </p>
                          <div className="user-thread-actions">
                            {onOpenThread && (
                              <button className="btn-ghost-sm"
                                onClick={() => { onClose(); onOpenThread(t.id) }}>
                                👁️ Voir
                              </button>
                            )}
                            <button className="btn-danger-sm"
                              onClick={() => runAction('delete_thread', null, {
                                threadId: t.id,
                                reason: `Supprimé par modération depuis le profil ${targetProfile.id.slice(0,8)}`
                              })}>
                              🗑️ Supprimer
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="section-label" style={{ marginTop: 12 }}>Profils récents</div>
              {profiles.map(p => (
                <div key={p.id} className="user-list-item"
                  onClick={() => { setTarget(p); setSearchId(p.id); loadUserThreads(p.id) }}>
                  <div className="avatar-sm" style={{ background: p.color }}>{p.emoji}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>
                      {p.emoji}
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                        {' '}{p.id.slice(0, 12)}…
                      </span>
                    </div>
                    {p.suspension_reason && (
                      <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 1 }}>
                        {p.suspension_reason}
                      </div>
                    )}
                  </div>
                  {statusBadge(p)}
                </div>
              ))}
            </div>
          )}

          {/* ── Broadcast ── */}
          {tab === 'broadcast' && isAdmin && (
            <div className="admin-section">
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
                Envoie un message système à <strong>tous les utilisateurs actifs</strong>.
                Il apparaîtra dans leur panneau de notifications et en popup.
              </p>
              <textarea className="admin-textarea" value={broadcastMsg}
                onChange={e => setBroadcast(e.target.value)}
                placeholder="Message à diffuser à tous…"
                maxLength={500} rows={5} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>
                  {broadcastMsg.length}/500
                </span>
                <button className="btn-primary" style={{ width: 'auto', padding: '10px 20px' }}
                  disabled={!broadcastMsg.trim() || working} onClick={sendBroadcast}>
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
                    <span style={{ fontSize: 18 }}>{a.profiles?.emoji || '?'}</span>
                    <div>
                      <div className="log-action">{ACTION_LABELS[a.action] || a.action}</div>
                      {a.reason && (
                        <div className="log-reason">"{a.reason.slice(0, 80)}"</div>
                      )}
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

        {/* ── Modal d'action ── */}
        {actionModal && (
          <>
            <div className="modal-backdrop" style={{ zIndex: 60 }}
              onClick={() => { setActionModal(null); setSuspendReason(null); setReasonDetail('') }} />
            <div className="modal" style={{ zIndex: 70 }}>
              <div className="modal-header">
                <h3>
                  {actionModal.type === 'warning'        && '⚠️ Envoyer un avertissement'}
                  {actionModal.type === 'suspend_temp'   && '⏸️ Suspension temporaire'}
                  {actionModal.type === 'suspend_perm'   && '🚫 Suspension définitive'}
                  {actionModal.type === 'delete_account' && '❌ Supprimer le compte'}
                </h3>
                <button className="btn-icon"
                  onClick={() => { setActionModal(null); setSuspendReason(null); setReasonDetail('') }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>

              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* Durée pour suspension temporaire */}
                {actionModal.type === 'suspend_temp' && (
                  <div>
                    <label className="section-label">Durée (jours)</label>
                    <input type="number" className="admin-input" min={1} max={365}
                      value={duration} onChange={e => setDuration(parseInt(e.target.value))} />
                  </div>
                )}

                {/* Catégories de raison pour les suspensions */}
                {(actionModal.type === 'suspend_temp' || actionModal.type === 'suspend_perm') && (
                  <div>
                    <label className="section-label">Catégorie de la sanction</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                      {SUSPENSION_REASONS.map(r => (
                        <button key={r.id}
                          className={`report-reason-btn ${suspendReason === r.id ? 'sel' : ''}`}
                          onClick={() => setSuspendReason(r.id)}>
                          <span className="report-reason-label">{r.label}</span>
                          <span className="report-reason-desc">{r.desc}</span>
                        </button>
                      ))}
                    </div>
                    {suspendReason === 'other' && (
                      <textarea className="admin-textarea" style={{ marginTop: 8 }}
                        value={reasonDetail}
                        onChange={e => setReasonDetail(e.target.value)}
                        placeholder="Précise la raison…" rows={2} maxLength={200} />
                    )}
                  </div>
                )}

                {/* Message libre pour avertissement */}
                {actionModal.type === 'warning' && (
                  <div>
                    <label className="section-label">Message à envoyer à l'utilisateur</label>
                    <textarea className="admin-textarea" style={{ marginTop: 6 }}
                      value={reasonDetail}
                      onChange={e => setReasonDetail(e.target.value)}
                      placeholder="Ce message sera affiché en popup à l'utilisateur…"
                      rows={4} maxLength={300} />
                  </div>
                )}

                {actionModal.type === 'delete_account' && (
                  <>
                    <div>
                      <label className="section-label">Raison (optionnelle, pour le journal)</label>
                      <textarea className="admin-textarea" style={{ marginTop: 6 }}
                        value={reasonDetail}
                        onChange={e => setReasonDetail(e.target.value)}
                        placeholder="Raison de la suppression…" rows={2} maxLength={200} />
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--red)', background: 'var(--red-light)',
                      padding: '10px 12px', borderRadius: 8 }}>
                      ⚠️ Action irréversible. Tous les threads, réponses et données seront supprimés.
                    </p>
                  </>
                )}
              </div>

              <div className="modal-footer">
                <button className="btn-ghost"
                  onClick={() => { setActionModal(null); setSuspendReason(null); setReasonDetail('') }}>
                  Annuler
                </button>
                <button
                  className={actionModal.type === 'delete_account' ? 'btn-danger-solid' : 'btn-primary-sm'}
                  style={actionModal.type !== 'delete_account' ? { padding: '10px 20px' } : {}}
                  disabled={
                    working ||
                    (actionModal.type === 'warning' && !reasonDetail.trim()) ||
                    ((actionModal.type === 'suspend_temp' || actionModal.type === 'suspend_perm') && !suspendReason)
                  }
                  onClick={() => runAction(actionModal.type, actionModal.target, {
                    reason:   actionModal.type === 'warning'
                                ? reasonDetail.trim()
                                : getFinalReason(),
                    duration,
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