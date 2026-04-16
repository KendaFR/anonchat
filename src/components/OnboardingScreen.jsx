import { useState } from 'react'
import { supabase } from '../lib/supabase'

const EMOJIS = ['😺','🦊','🐼','🦋','🌊','🌙','⚡','🎸','🎨','🍕','🚀','🌸']
const COLORS = ['#EEEDFE','#E1F5EE','#FAECE7','#E6F1FB','#EAF3DE','#FAEEDA','#FBEAF0','#FCF0E8']

export const PASSIONS = [
  { id: 'music',   label: 'Musique',     icon: '🎵' },
  { id: 'gaming',  label: 'Gaming',      icon: '🎮' },
  { id: 'art',     label: 'Art & dessin',icon: '🎨' },
  { id: 'sport',   label: 'Sport',       icon: '⚽' },
  { id: 'cinema',  label: 'Cinéma',      icon: '🎬' },
  { id: 'cuisine', label: 'Cuisine',     icon: '🍳' },
  { id: 'voyages', label: 'Voyages',     icon: '✈️' },
  { id: 'tech',    label: 'Tech / Dev',  icon: '💻' },
  { id: 'lecture', label: 'Lecture',     icon: '📚' },
  { id: 'nature',  label: 'Nature',      icon: '🌿' },
  { id: 'photo',   label: 'Photo',       icon: '📷' },
  { id: 'animaux', label: 'Animaux',     icon: '🐾' },
]

export default function OnboardingScreen({ onJoin }) {
  const [emoji, setEmoji]       = useState(null)
  const [age, setAge]           = useState(25)
  const [passions, setPassions] = useState([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)

  function togglePassion(id) {
    setPassions(prev =>
      prev.includes(id)
        ? prev.filter(p => p !== id)
        : prev.length < 4 ? [...prev, id] : prev
    )
  }

  async function handleJoin() {
    if (!emoji || passions.length === 0) return
    setLoading(true)
    setError(null)

    const color = COLORS[EMOJIS.indexOf(emoji) % COLORS.length]

    try {
      const { data, error: err } = await supabase
        .from('profiles')
        .insert({ emoji, age, passions, color })
        .select()
        .single()

      if (err) throw err
      onJoin(data)
    } catch (e) {
      setError('Erreur de connexion. Vérifie ta connexion internet.')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const canJoin = emoji && passions.length > 0

  return (
    <div className="screen onboard-screen">
      <div className="onboard-inner">
        <h1>Chat anonyme</h1>
        <p className="subtitle">Crée ton profil anonyme pour rejoindre la salle.</p>

        <section>
          <label>Choisis ton avatar</label>
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
          <label>
            Ton âge — <strong>{age} ans</strong>
          </label>
          <input
            type="range" min="13" max="80" value={age}
            onChange={e => setAge(parseInt(e.target.value))}
          />
        </section>

        <section>
          <label>Tes passions <span className="hint">(jusqu'à 4)</span></label>
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
          disabled={!canJoin || loading}
          onClick={handleJoin}
        >
          {loading ? 'Connexion…' : 'Rejoindre le chat'}
        </button>
      </div>
    </div>
  )
}