import { useState } from 'react'
import OnboardingScreen from './components/OnboardingScreen'
import ChatScreen from './components/ChatScreen'
import ProfileScreen from './components/ProfileScreen'
import './App.css'

export default function App() {
  const [screen, setScreen] = useState('onboard') // 'onboard' | 'chat' | 'profile'
  const [profile, setProfile] = useState(null)

  function handleJoin(profileData) {
    setProfile(profileData)
    setScreen('chat')
  }

  function handleReset() {
    setProfile(null)
    setScreen('onboard')
  }

  return (
    <div className="app-container">
      {screen === 'onboard' && (
        <OnboardingScreen onJoin={handleJoin} />
      )}
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
          onReset={handleReset}
        />
      )}
    </div>
  )
}