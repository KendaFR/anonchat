import { useState } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { useSession } from './hooks/useSession'

import OnboardingScreen from './components/OnboardingScreen'
import FeedScreen from './components/FeedScreen'
import ThreadScreen from './components/ThreadScreen'
import ProfileScreen from './components/ProfileScreen'
import EditProfileScreen from './components/EditProfileScreen'

import './App.css'

export default function App() {
  const { profile, setProfile, saveProfile, clearProfile, loading } = useSession()

  const [screen, setScreen] = useState('feed') // feed | thread | profile | edit
  const [activeThread, setActiveThread] = useState(null)

  // 🔹 Loading
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

  // 🔹 Onboarding (pas de profil)
  if (!profile) {
    return (
      <div className="app-container">
        <OnboardingScreen onJoin={saveProfile} />
        <Analytics />
      </div>
    )
  }

  // 🔹 Navigation thread
  function openThread(thread) {
    setActiveThread(thread)
    setScreen('thread')
  }

  // 🔹 App principale
  return (
    <div className="app-container">
      {screen === 'feed' && (
        <FeedScreen
          profile={profile}
          onOpenThread={openThread}
          onOpenProfile={() => setScreen('profile')}
        />
      )}

      {screen === 'thread' && (
        <ThreadScreen
          thread={activeThread}
          profile={profile}
          onBack={() => setScreen('feed')}
        />
      )}

      {screen === 'profile' && (
        <ProfileScreen
          profile={profile}
          onBack={() => setScreen('feed')}
          onEdit={() => setScreen('edit')}
          onDelete={clearProfile}
        />
      )}

      {screen === 'edit' && (
        <EditProfileScreen
          profile={profile}
          onSave={(updated) => {
            setProfile(updated)
            setScreen('profile')
          }}
          onBack={() => setScreen('profile')}
        />
      )}

      <Analytics />
    </div>
  )
}