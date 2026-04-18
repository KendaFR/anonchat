import { useState } from 'react'
import { useSession } from './hooks/useSession'
import OnboardingScreen from './components/OnboardingScreen'
import ChatScreen from './components/ChatScreen'
import ProfileScreen from './components/ProfileScreen'
import EditProfileScreen from './components/EditProfileScreen'
import './App.css'

export default function App() {
  const { profile, setProfile, saveProfile, clearProfile, loading } = useSession()
  const [screen, setScreen] = useState('chat') // 'chat' | 'profile' | 'edit'

  // Écran de chargement pendant la vérification de session
  if (loading) {
    return (
      <div className="app-container">
        <div className="splash">
          <div className="splash-emoji">💬</div>
          <div className="splash-text">Chargement…</div>
        </div>
      </div>
    )
  }

  // Pas de profil → onboarding
  if (!profile) {
    return (
      <div className="app-container">
        <OnboardingScreen onJoin={saveProfile} />
      </div>
    )
  }

  return (
    <div className="app-container">
      {screen === 'chat' && (
        <ChatScreen
          profile={profile}
          onOpenProfile={() => setScreen('profile')}
        />
      )}
      {screen === 'profile' && (
        <ProfileScreen
          profile={profile}
          onBack={() => setScreen('chat')}
          onEdit={() => setScreen('edit')}
          onDelete={clearProfile}
        />
      )}
      {screen === 'edit' && (
        <EditProfileScreen
          profile={profile}
          onSave={(updated) => { setProfile(updated); setScreen('profile') }}
          onBack={() => setScreen('profile')}
        />
      )}
    </div>
  )
}