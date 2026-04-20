import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const SESSION_KEY    = 'anonchat_profile_id'
const POLL_INTERVAL  = 30_000   // vérifie le statut toutes les 30s

export function useSession() {
  const [profile, setProfile]   = useState(null)
  const [loading, setLoading]   = useState(true)
  const channelRef  = useRef(null)
  const pollTimer   = useRef(null)
  const profileIdRef = useRef(null) // garde l'id accessible dans les closures

  useEffect(() => {
    restoreSession()
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
      clearInterval(pollTimer.current)
    }
  }, [])

  // Dès qu'on a un profil, démarre le Realtime + le polling
  useEffect(() => {
    if (!profile?.id) return
    profileIdRef.current = profile.id
    subscribeProfile()
    startPolling()
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
      clearInterval(pollTimer.current)
    }
  }, [profile?.id])

  // ─── Restore session ──────────────────────────────────────────────────
  async function restoreSession() {
    const savedId = localStorage.getItem(SESSION_KEY)
    if (!savedId) { setLoading(false); return }
    const { data, error } = await supabase
      .from('profiles').select('*').eq('id', savedId).single()
    if (error || !data) {
      localStorage.removeItem(SESSION_KEY)
    } else {
      setProfile(data)
    }
    setLoading(false)
  }

  // ─── Realtime : écoute TOUS les updates de profiles, filtre côté client ──
  // Le filtre `id=eq.X` de Supabase Realtime est peu fiable sans replica identity FULL.
  // On écoute tout et on ignore ce qui ne nous concerne pas.
  function subscribeProfile() {
    if (channelRef.current) supabase.removeChannel(channelRef.current)

    channelRef.current = supabase
      .channel('profile-status-watch')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        ({ new: updated }) => {
          if (updated.id !== profileIdRef.current) return
          setProfile(updated)
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'profiles' },
        ({ old }) => {
          if (old.id !== profileIdRef.current) return
          localStorage.removeItem(SESSION_KEY)
          setProfile(null)
        }
      )
      .subscribe()
  }

  // ─── Polling de sécurité : si le Realtime rate l'event ───────────────────
  function startPolling() {
    clearInterval(pollTimer.current)
    pollTimer.current = setInterval(async () => {
      const id = profileIdRef.current
      if (!id) return
      const { data, error } = await supabase
        .from('profiles').select('*').eq('id', id).single()
      if (error || !data) {
        // Compte supprimé
        localStorage.removeItem(SESSION_KEY)
        setProfile(null)
        clearInterval(pollTimer.current)
        return
      }
      // Met à jour uniquement si status/role/suspended_until ont changé
      setProfile(prev => {
        if (!prev) return data
        if (
          prev.status          !== data.status          ||
          prev.role            !== data.role            ||
          prev.suspended_until !== data.suspended_until ||
          prev.suspension_reason !== data.suspension_reason
        ) {
          return data  // déclenche un re-render avec le nouveau profil
        }
        return prev  // aucun changement, pas de re-render
      })
    }, POLL_INTERVAL)
  }

  // ─── API ─────────────────────────────────────────────────────────────────
  function saveProfile(profileData) {
    localStorage.setItem(SESSION_KEY, profileData.id)
    profileIdRef.current = profileData.id
    setProfile(profileData)
  }

  function clearProfile() {
    localStorage.removeItem(SESSION_KEY)
    profileIdRef.current = null
    clearInterval(pollTimer.current)
    setProfile(null)
  }

  return { profile, setProfile, saveProfile, clearProfile, loading }
}