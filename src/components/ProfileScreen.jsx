import { PASSIONS } from './OnboardingScreen'

export default function ProfileScreen({ profile, onBack, onReset }) {
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

        <button className="btn-danger" onClick={onReset}>
          Changer de profil
        </button>
      </div>
    </div>
  )
}