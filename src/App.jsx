import { useState } from 'react'
import { useSession }       from './hooks/useSession'
import { useNotifications } from './hooks/useNotifications'
import OnboardingScreen     from './components/OnboardingScreen'
import FeedScreen           from './components/FeedScreen'
import ThreadScreen         from './components/ThreadScreen'
import ProfileScreen        from './components/ProfileScreen'
import EditProfileScreen    from './components/EditProfileScreen'
import NotificationPanel    from './components/NotificationPanel'
import './App.css'

export default function App() {
  const { profile, setProfile, saveProfile, clearProfile, loading } = useSession()
  const notifs = useNotifications(profile?.id)

  const [screen, setScreen]           = useState('feed')
  const [activeThread, setActiveThread] = useState(null)
  const [showNotifPanel, setShowNotifPanel] = useState(false)

  if (loading) {
    return (
      <div className="app-container">
        <div className="splash"><div className="splash-emoji">💬</div><div className="splash-text">Chargement…</div></div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="app-container">
        <OnboardingScreen onJoin={saveProfile} />
      </div>
    )
  }

  function openThread(thread) {
    setActiveThread(thread)
    setScreen('thread')
  }

  // Ouvre un thread depuis une notification
  function openThreadFromNotif(threadId) {
    setShowNotifPanel(false)
    // On a besoin de l'objet thread complet — on le cherche dans le cache feed
    // ou on navigue et ThreadScreen le chargera
    setActiveThread({ id: threadId, _needsLoad: true })
    setScreen('thread')
  }

  return (
    <div className="app-container">
      {screen === 'feed' && (
        <FeedScreen
          profile={profile}
          onOpenThread={openThread}
          onOpenProfile={() => setScreen('profile')}
          unreadCount={notifs.unreadCount}
          onOpenNotifs={() => setShowNotifPanel(true)}
        />
      )}
      {screen === 'thread' && (
        <ThreadScreen
          threadProp={activeThread}
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
          onSave={(updated) => { setProfile(updated); setScreen('profile') }}
          onBack={() => setScreen('profile')}
        />
      )}

      {/* Panneau notifications (overlay) */}
      {showNotifPanel && (
        <NotificationPanel
          {...notifs}
          profile={profile}
          onClose={() => setShowNotifPanel(false)}
          onOpenThread={openThreadFromNotif}
        />
      )}
    </div>
  )
}