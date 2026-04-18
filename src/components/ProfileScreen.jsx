import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { PASSIONS } from './OnboardingScreen'

export default function ProfileScreen({ profile, onBack, onEdit, onDelete }) {
  const [deleting, setDeleting]   = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    // La cascade ON DELETE supprime aussi tous les messages du profil
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', profile.id)

    if (error) {
      console.error(error)
      setDeleting(false)
      return
    }

    onDelete() // nettoie localStorage + remonte à onboarding
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
        <div>
          <h2>Mon profil</h2>
          <p className="subtitle">Visible par tous dans le chat</p>
        </div>
        <button className="btn-edit-header" onClick={onEdit}>
          Modifier
        </button>
      </div>

      <div className="profile-body">
        <div className="profile-hero">
          <div className="avatar-lg" style={{ background: profile.color }}>
            {profile.emoji}
          </div>
          <div className="profile-info">
            <div className="profile-name">{profile.emoji} Anonyme</div>
            <div className="profile-age">{profile.age} ans</div>
          </div>
        </div>

        <div className="passions-section">
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

        <div className="danger-zone">
          <div className="section-label">Zone dangereuse</div>
          {!showConfirm ? (
            <button className="btn-danger" onClick={() => setShowConfirm(true)}>
              Supprimer mon compte
            </button>
          ) : (
            <div className="confirm-box">
              <p>Supprimer ton profil et tous tes messages ? Cette action est irréversible.</p>
              <div className="confirm-actions">
                <button className="btn-ghost" onClick={() => setShowConfirm(false)}>
                  Annuler
                </button>
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