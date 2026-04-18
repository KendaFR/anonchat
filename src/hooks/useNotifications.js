import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export function useNotifications(profileId) {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading]             = useState(true)
  const channelRef = useRef(null)

  useEffect(() => {
    if (!profileId) return
    loadNotifications()
    channelRef.current = subscribeNotifications()
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current) }
  }, [profileId])

  async function loadNotifications() {
    const { data } = await supabase
      .from('notifications')
      .select('*, threads(content), replies(content, profiles(emoji, color))')
      .eq('recipient_id', profileId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) setNotifications(data)
    setLoading(false)
  }

  function subscribeNotifications() {
    return supabase.channel(`notifs-${profileId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications',
          filter: `recipient_id=eq.${profileId}` },
        async ({ new: n }) => {
          // Charge les relations
          const { data } = await supabase
            .from('notifications')
            .select('*, threads(content), replies(content, profiles(emoji, color))')
            .eq('id', n.id).single()
          if (data) setNotifications(prev => [data, ...prev])
        })
      .subscribe()
  }

  const unreadCount = notifications.filter(n => !n.is_read).length

  async function markRead(id) {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
  }

  async function markAllRead() {
    await supabase.from('notifications')
      .update({ is_read: true })
      .eq('recipient_id', profileId).eq('is_read', false)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  async function deleteNotif(id) {
    await supabase.from('notifications').delete().eq('id', id)
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  return { notifications, unreadCount, loading, markRead, markAllRead, deleteNotif }
}