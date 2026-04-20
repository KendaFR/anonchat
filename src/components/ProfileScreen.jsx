import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { PASSIONS } from './OnboardingScreen'
import RoleBadge from './RoleBadge'
import { canViewId } from './ProfilePopup'

export default function ProfileScreen({ profile, onBack, onEdit, onDelete }) {
  const [deleting, setDeleting]       = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    const { error } = await supabase.from('profiles').delete().eq('id', profile.id)
    if (error) { console.error(error); setDeleting(false); return }
    onDelete()
  }

  // Infos de suspension visibles uniquement par le titulaire
  const isSuspended = profile.status === 'suspended_temp' || profile.status === 'suspended_perm'

  function suspensionUntil() {
    if (!profile.suspended_until) return null
    return new Date(profile.suspended_until).toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'long', year: 'numeric'
    })
  }

  return (
    <div className="screen profile-screen">
      <div className="header">
        <button className="btn-icon" onClick={onBack}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div><h2>Mon profil</h2><p className="subtitle">Visible par tous</p></div>
        <button className="btn-edit-header" onClick={onEdit}>Modifier</button>
      </div>

      <div className="profile-body">

        {/* Bannière de suspension — visible uniquement par le titulaire */}
        {isSuspended && (
          <div className="suspension-banner">
            <div className="suspension-banner-icon">
              {profile.status === 'suspended_perm' ? '🚫' : '⏸️'}
            </div>
            <div className="suspension-banner-body">
              <strong>
                {profile.status === 'suspended_perm'
                  ? 'Compte suspendu définitivement'
                  : `Compte suspendu jusqu'au ${suspensionUntil()}`}
              </strong>
              <p>Tu peux lire les messages mais pas en envoyer.</p>
              {profile.suspension_reason && (
                <p className="suspension-reason">
                  Motif : <em>{profile.suspension_reason}</em>
                </p>
              )}
            </div>
          </div>
        )}

        <div className="profile-hero">
          <div className="avatar-lg" style={{ background: profile.color }}>{profile.emoji}</div>
          <div className="profile-info">
            <div className="profile-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {profile.emoji} Anonyme
              <RoleBadge role={profile.role} size="md" />
            </div>
            <div className="profile-age">{profile.age} ans</div>
          </div>
        </div>

        <div>
          <div className="section-label">Passions</div>
          <div className="passion-tags">
            {profile.passions.map(pid => {
              const p = PASSIONS.find(x => x.id === pid)
              return p ? <span key={pid} className="ptag">{p.icon} {p.label}</span> : null
            })}
          </div>
        </div>

        {/* ID visible si le titulaire est modérateur ou admin */}
        {canViewId(profile.role) && (
          <div className="profile-id-block">
            <div className="profile-popup-id-label">
              <span className="role-power-badge">
                {profile.role === 'admin' ? '⚡' : '🛡️'} Ton identifiant
              </span>
            </div>
            <div className="profile-popup-id-row">
              <code className="profile-popup-id">{profile.id}</code>
              <button className="btn-copy-id"
                onClick={() => navigator.clipboard.writeText(profile.id)}
                title="Copier l'ID">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <rect x="9" y="9" width="13" height="13" rx="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              </button>
            </div>
          </div>
        )}

        <div className="presence-info-box">
          <span>{profile.show_presence ? '🟢' : '⚫'}</span>
          <span>
            {profile.show_presence
              ? 'Ta connexion est visible dans le compteur en ligne.'
              : 'Tu apparais hors ligne pour les autres.'}
          </span>
          <button className="btn-link" onClick={onEdit}>Modifier</button>
        </div>

        <div className="danger-zone">
          <div className="section-label">Zone dangereuse</div>
          {!showConfirm ? (
            <button className="btn-danger" onClick={() => setShowConfirm(true)}>
              Supprimer mon compte
            </button>
          ) : (
            <div className="confirm-box">
              <p>Supprimer ton profil et tous tes threads/réponses ? Irréversible.</p>
              <div className="confirm-actions">
                <button className="btn-ghost" onClick={() => setShowConfirm(false)}>Annuler</button>
                <button className="btn-danger-solid" onClick={handleDelete} disabled={deleting}>
                  {deleting ? 'Suppression…' : 'Confirmer'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}