import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { PASSIONS } from './OnboardingScreen'

const EMOJIS = ['😺','🦊','🐼','🦋','🌊','🌙','⚡','🎸','🎨','🍕','🚀','🌸']
const COLORS = ['#EEEDFE','#E1F5EE','#FAECE7','#E6F1FB','#EAF3DE','#FAEEDA','#FBEAF0','#FCF0E8']

export default function EditProfileScreen({ profile, onSave, onBack }) {
  const [emoji, setEmoji]       = useState(profile.emoji)
  const [age, setAge]           = useState(profile.age)
  const [passions, setPassions] = useState(profile.passions)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState(null)

  const hasChanges =
    emoji !== profile.emoji ||
    age !== profile.age ||
    JSON.stringify(passions.sort()) !== JSON.stringify([...profile.passions].sort())

  function togglePassion(id) {
    setPassions(prev =>
      prev.includes(id)
        ? prev.filter(p => p !== id)
        : prev.length < 4 ? [...prev, id] : prev
    )
  }

  async function handleSave() {
    if (!hasChanges || saving) return
    setSaving(true)
    setError(null)

    const color = COLORS[EMOJIS.indexOf(emoji) % COLORS.length]

    const { data, error: err } = await supabase
      .from('profiles')
      .update({ emoji, age, passions, color })
      .eq('id', profile.id)
      .select()
      .single()

    if (err) {
      setError('Erreur lors de la sauvegarde.')
      console.error(err)
      setSaving(false)
      return
    }

    onSave(data) // remonte le profil mis à jour vers App.jsx
  }

  return (
    <div className="screen onboard-screen">
      <div className="header" style={{ flexShrink: 0 }}>
        <button className="btn-icon" onClick={onBack}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div>
          <h2>Modifier mon profil</h2>
          <p className="subtitle">Les changements sont visibles immédiatement</p>
        </div>
      </div>

      <div className="onboard-inner" style={{ paddingTop: 16 }}>
        <section>
          <label>Avatar</label>
          <div className="emoji-grid">
            {EMOJIS.map(e => (
              <button
                key={e}
                className={`emoji-opt ${emoji === e ? 'sel' : ''}`}
                onClick={() => setEmoji(e)}
              >{e}</button>
            ))}
          </div>
        </section>

        <section>
          <label>Âge — <strong>{age} ans</strong></label>
          <input
            type="range" min="13" max="80" value={age}
            onChange={e => setAge(parseInt(e.target.value))}
          />
        </section>

        <section>
          <label>Passions <span className="hint">(jusqu'à 4)</span></label>
          <div className="passion-grid">
            {PASSIONS.map(p => (
              <button
                key={p.id}
                className={`passion-opt ${passions.includes(p.id) ? 'sel' : ''}`}
                onClick={() => togglePassion(p.id)}
              >
                <span>{p.icon}</span> {p.label}
              </button>
            ))}
          </div>
        </section>

        {error && <p className="error-msg">{error}</p>}

        <button
          className="btn-primary"
          disabled={!hasChanges || saving || passions.length === 0}
          onClick={handleSave}
        >
          {saving ? 'Sauvegarde…' : hasChanges ? 'Enregistrer les modifications' : 'Aucun changement'}
        </button>
      </div>
    </div>
  )
}