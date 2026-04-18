import { useState } from 'react'
import { useSession }       from './hooks/useSession'
import { useNotifications } from './hooks/useNotifications'
import OnboardingScreen     from './components/OnboardingScreen'
import FeedScreen           from './components/FeedScreen'
import ThreadScreen         from './components/ThreadScreen'
import ProfileScreen        from './components/ProfileScreen'
import EditProfileScreen    from './components/EditProfileScreen'
import NotificationPanel    from './components/NotificationPanel'
import AdminPanel           from './components/AdminPanel'
import './App.css'

export default function App() {
  const { profile, setProfile, saveProfile, clearProfile, loading } = useSession()
  const notifs = useNotifications(profile?.id)

  const [screen, setScreen]               = useState('feed')
  const [activeThread, setActiveThread]   = useState(null)
  const [showNotifPanel, setShowNotifPanel] = useState(false)
  const [showAdminPanel, setShowAdminPanel] = useState(false)

  if (loading) {
    return (
      <div className="app-container">
        <div className="splash"><div className="splash-emoji">💬</div><div className="splash-text">Chargement…</div></div>
      </div>
    )
  }

  if (!profile) {
    return <div className="app-container"><OnboardingScreen onJoin={saveProfile} /></div>
  }

  // Vérifie si le compte est suspendu
  if (profile.status === 'suspended_perm') {
    return (
      <div className="app-container">
        <div className="suspended-screen">
          <div style={{ fontSize: 48 }}>🚫</div>
          <h2>Compte suspendu</h2>
          <p>Ton compte a été suspendu définitivement suite à une violation des règles.</p>
          <button className="btn-danger" onClick={clearProfile}>Effacer mes données locales</button>
        </div>
      </div>
    )
  }

  if (profile.status === 'suspended_temp') {
    const until = profile.suspended_until
      ? new Date(profile.suspended_until).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' })
      : '...'
    return (
      <div className="app-container">
        <div className="suspended-screen">
          <div style={{ fontSize: 48 }}>⏸️</div>
          <h2>Compte suspendu temporairement</h2>
          <p>Ton compte est suspendu jusqu'au <strong>{until}</strong>.</p>
        </div>
      </div>
    )
  }

  function openThread(thread) { setActiveThread(thread); setScreen('thread') }
  function openThreadFromNotif(threadId) {
    setShowNotifPanel(false)
    setActiveThread({ id: threadId, _needsLoad: true })
    setScreen('thread')
  }

  const canAdmin = profile.role === 'admin' || profile.role === 'moderator'

  return (
    <div className="app-container">
      {screen === 'feed' && (
        <FeedScreen
          profile={profile}
          onOpenThread={openThread}
          onOpenProfile={() => setScreen('profile')}
          unreadCount={notifs.unreadCount}
          onOpenNotifs={() => setShowNotifPanel(true)}
          onOpenAdmin={canAdmin ? () => setShowAdminPanel(true) : null}
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

      {showNotifPanel && (
        <NotificationPanel
          {...notifs}
          profile={profile}
          onClose={() => setShowNotifPanel(false)}
          onOpenThread={openThreadFromNotif}
        />
      )}

      {showAdminPanel && canAdmin && (
        <AdminPanel
          profile={profile}
          onClose={() => setShowAdminPanel(false)}
        />
      )}
    </div>
  )
}