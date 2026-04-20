import { useState, useEffect } from 'react'
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

  const [screen, setScreen]                 = useState('feed')
  const [activeThread, setActiveThread]     = useState(null)
  const [showNotifPanel, setShowNotifPanel] = useState(false)
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [warningPopup, setWarningPopup]     = useState(null) // { message } | null

  // Détecte les nouvelles notifs warning/system non lues pour popup
  useEffect(() => {
    if (!notifs.notifications.length) return
    const latest = notifs.notifications[0]
    if (!latest.is_read && (latest.type === 'warning' || latest.type === 'system')) {
      setWarningPopup({ message: latest.message, type: latest.type, id: latest.id })
    }
  }, [notifs.notifications])

  function dismissWarning() {
    if (warningPopup?.id) notifs.markRead(warningPopup.id)
    setWarningPopup(null)
  }

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

  if (!profile) {
    return <div className="app-container"><OnboardingScreen onJoin={saveProfile} /></div>
  }

  // Les comptes suspendus peuvent accéder à l'app en lecture seule
  // La restriction d'envoi est gérée dans FeedScreen et ThreadScreen

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
          onOpenThread={(threadId) => {
            setShowAdminPanel(false)
            setActiveThread({ id: threadId, _needsLoad: true })
            setScreen('thread')
          }}
        />
      )}

      {/* Popup warning/système — apparaît automatiquement à la réception */}
      {warningPopup && (
        <>
          <div className="modal-backdrop" onClick={dismissWarning} />
          <div className="modal warning-popup">
            <div className="warning-popup-icon">
              {warningPopup.type === 'warning' ? '⚠️' : '📢'}
            </div>
            <div className="warning-popup-title">
              {warningPopup.type === 'warning' ? 'Avertissement de modération' : 'Message de l\'équipe'}
            </div>
            <div className="warning-popup-message">
              {warningPopup.message || 'Merci de respecter les règles de la communauté.'}
            </div>
            <button className="btn-primary" onClick={dismissWarning}>
              J'ai compris
            </button>
          </div>
        </>
      )}
    </div>
  )
}