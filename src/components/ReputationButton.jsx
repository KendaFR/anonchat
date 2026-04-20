import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ROLE_POWER } from './ProfilePopup'

const COOLDOWN_MS          = 24 * 60 * 60 * 1000
const MIN_AGE_DAYS         = 7
const MAX_GIVEN_PER_DAY    = 5
const MAX_RECEIVED_PER_DAY = 10

export default function ReputationButton({ viewer, targetId, targetScore, onVoted }) {
  const [state, setState]   = useState({ canVote: false, hasVoted: false, loading: true, reason: null })
  const [sending, setSending] = useState(false)

  useEffect(() => { checkEligibility() }, [viewer?.id, targetId])

  async function checkEligibility() {
    setState(s => ({ ...s, loading: true }))
    if (!viewer || viewer.id === targetId) {
      setState({ canVote: false, hasVoted: false, loading: false, reason: 'self' }); return
    }

    const now      = new Date()
    const since24h = new Date(now - COOLDOWN_MS).toISOString()

    // 1. Déjà voté cette cible dans les 24h ?
    const { data: existingVote } = await supabase
      .from('reputation_votes').select('created_at')
      .eq('voter_id', viewer.id).eq('target_id', targetId)
      .gte('created_at', since24h).single()

    if (existingVote) {
      const remainingH = Math.ceil((COOLDOWN_MS - (now - new Date(existingVote.created_at))) / 3_600_000)
      setState({ canVote: false, hasVoted: true, loading: false, reason: `cooldown:${remainingH}` }); return
    }

    // 2. Limite de 5 points donnés dans les 24h
    const { count: givenCount } = await supabase
      .from('reputation_votes').select('id', { count: 'exact', head: true })
      .eq('voter_id', viewer.id).gte('created_at', since24h)

    if ((givenCount ?? 0) >= MAX_GIVEN_PER_DAY) {
      setState({ canVote: false, hasVoted: false, loading: false, reason: `given_limit:${MAX_GIVEN_PER_DAY}` }); return
    }

    // 3. Limite de 10 points reçus par la cible dans les 24h
    const { count: receivedCount } = await supabase
      .from('reputation_votes').select('id', { count: 'exact', head: true })
      .eq('target_id', targetId).gte('created_at', since24h)

    if ((receivedCount ?? 0) >= MAX_RECEIVED_PER_DAY) {
      setState({ canVote: false, hasVoted: false, loading: false, reason: `received_limit:${MAX_RECEIVED_PER_DAY}` }); return
    }

    // 4. Activité minimale du votant (sauf modo/admin)
    if ((ROLE_POWER[viewer.role] ?? 0) < ROLE_POWER.moderator) {
      const ageDays = (now - new Date(viewer.created_at)) / 86_400_000
      if (ageDays < MIN_AGE_DAYS) {
        const daysLeft = Math.ceil(MIN_AGE_DAYS - ageDays)
        setState({ canVote: false, hasVoted: false, loading: false, reason: `age:${daysLeft}` }); return
      }
    }

    setState({ canVote: true, hasVoted: false, loading: false, reason: null })
  }

  async function vote() {
    if (!state.canVote || sending) return
    setSending(true)

    const { error } = await supabase.from('reputation_votes').insert({
      voter_id: viewer.id, target_id: targetId,
    })

    if (!error) {
      await supabase.from('profiles')
        .update({ reputation_score: (targetScore || 0) + 1 }).eq('id', targetId)

      await supabase.from('notifications').insert({
        recipient_id: targetId, type: 'reputation',
        message: "⭐ Quelqu'un t'a donné un point de réputation !",
      })

      setState(s => ({ ...s, canVote: false, hasVoted: true, reason: 'cooldown:24' }))
      onVoted?.()
    }
    setSending(false)
  }

  function tooltip() {
    const { reason } = state
    if (!reason)                          return 'Recommander ce profil'
    if (reason === 'self')                return 'Tu ne peux pas te recommander toi-même'
    if (reason.startsWith('cooldown:'))   return `Déjà recommandé — prochain vote dans ${reason.split(':')[1]}h`
    if (reason.startsWith('given_limit:'))    return `Limite atteinte — tu as déjà donné ${reason.split(':')[1]} points aujourd'hui`
    if (reason.startsWith('received_limit:')) return `Ce profil a reçu le maximum de points pour aujourd'hui`
    if (reason.startsWith('age:'))        return `Compte trop récent — encore ${reason.split(':')[1]} jour(s) requis`
    return ''
  }

  if (state.loading) return null

  return (
    <button
      className={`rep-btn ${state.canVote ? 'can-vote' : ''} ${state.hasVoted ? 'voted' : ''}`}
      onClick={vote}
      disabled={!state.canVote || sending}
      title={tooltip()}
    >
      <svg width="14" height="14" viewBox="0 0 24 24"
        fill={state.hasVoted ? 'currentColor' : 'none'}
        stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
      {sending ? '…' : state.hasVoted ? 'Recommandé ✓' : 'Recommander'}
    </button>
  )
}