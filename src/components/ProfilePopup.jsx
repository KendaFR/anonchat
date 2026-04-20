import { useState } from 'react'
import { PASSIONS } from './OnboardingScreen'
import RoleBadge from './RoleBadge'

// Hiérarchie des rôles — plus le chiffre est élevé, plus le rôle est puissant
export const ROLE_POWER = {
  user:      0,
  moderator: 1,
  admin:     2,
}

export function canViewId(viewerRole) {
  return (ROLE_POWER[viewerRole] ?? 0) >= ROLE_POWER.moderator
}

export default function ProfilePopup({ profile, viewer, onClose }) {
  const [copied, setCopied] = useState(false)

  if (!profile) return null

  const showId = canViewId(viewer?.role)

  function copyId() {
    navigator.clipboard.writeText(profile.id)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal profile-popup">
        <div className="modal-header">
          <h3>Profil anonyme</h3>
          <button className="btn-icon" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="profile-popup-body">
          <div className="profile-popup-hero">
            <div className="avatar-xl" style={{ background: profile.color }}>
              {profile.emoji}
            </div>
            <div className="profile-popup-info">
              <div className="profile-popup-name">
                {profile.emoji} Anonyme
                <RoleBadge role={profile.role} size="md" />
              </div>
              <div className="profile-popup-age">{profile.age} ans</div>
              <div className="profile-popup-joined">
                Membre depuis {new Date(profile.created_at).toLocaleDateString('fr-FR', {
                  month: 'long', year: 'numeric'
                })}
              </div>
            </div>
          </div>

          {/* ID visible uniquement pour les modérateurs et admins */}
          {showId && (
            <div className="profile-popup-id-block">
              <div className="profile-popup-id-label">
                <span className="role-power-badge">
                  {viewer.role === 'admin' ? '⚡' : '🛡️'} Accès modération
                </span>
                ID du compte
              </div>
              <div className="profile-popup-id-row">
                <code className="profile-popup-id">{profile.id}</code>
                <button className="btn-copy-id" onClick={copyId} title="Copier l'ID">
                  {copied ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <rect x="9" y="9" width="13" height="13" rx="2"/>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>
          )}

          {profile.passions && profile.passions.length > 0 && (
            <div className="profile-popup-passions">
              <div className="section-label">Passions</div>
              <div className="passion-tags">
                {profile.passions.map(pid => {
                  const p = PASSIONS.find(x => x.id === pid)
                  return p ? (
                    <span key={pid} className="ptag">{p.icon} {p.label}</span>
                  ) : null
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}