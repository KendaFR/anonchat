import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const SESSION_KEY = 'anonchat_profile_id'

export function useSession() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
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
    restoreSession()
  }, [])

  function saveProfile(profileData) {
    localStorage.setItem(SESSION_KEY, profileData.id)
    setProfile(profileData)
  }

  function clearProfile() {
    localStorage.removeItem(SESSION_KEY)
    setProfile(null)
  }

  return { profile, setProfile, saveProfile, clearProfile, loading }
}