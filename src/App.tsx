import { useCallback, useEffect, useRef, useState } from 'react'
import StageBackdrop from './components/StageBackdrop'
import Marquee from './components/Marquee'
import BallotForm from './components/BallotForm'
import BallotCast from './components/BallotCast'
import { CATEGORIES, type CategoryId } from './lib/categories'
import { BallotError, castBallot, fetchStatus, type Vote } from './lib/api'
import { emptyEntries, loadBallot, saveBallot, type Entries, type Saved } from './lib/ballot'
import { deviceId } from './lib/device'
import type { Nominee } from './lib/match'
import styles from './App.module.css'

/** How stale the autocomplete list may get before a focus refreshes it. */
const REFRESH_AFTER_MS = 30_000

export type FieldErrors = Partial<Record<CategoryId | 'voter' | 'ballot', string>>

export default function App() {
  const [saved, setSaved] = useState<Saved>(loadBallot)
  const [open, setOpen] = useState<boolean | null>(null)
  const [nominees, setNominees] = useState<Nominee[]>([])
  const [editing, setEditing] = useState(() => loadBallot().cast === null)
  const [sending, setSending] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const honeypotRef = useRef<HTMLInputElement>(null)
  const lastFetch = useRef(0)

  useEffect(() => saveBallot(saved), [saved])

  const refresh = useCallback(async (force = false) => {
    if (!force && Date.now() - lastFetch.current < REFRESH_AFTER_MS) return
    lastFetch.current = Date.now()
    try {
      const status = await fetchStatus()
      setOpen(status.open)
      setNominees(status.nominees)
    } catch {
      // Unreachable: keep the ballot usable. Casting reports the real error.
      setOpen((current) => current ?? true)
    }
  }, [])

  useEffect(() => {
    refresh(true)
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh])

  const setVoter = (voter: string) => setSaved((s) => ({ ...s, voter }))
  const setDraft = (draft: Entries) => setSaved((s) => ({ ...s, draft }))

  const submit = async () => {
    const found: FieldErrors = {}
    const voter = saved.voter.trim()
    if (!voter) found.voter = 'Tell us who is voting.'
    const votes: Vote[] = []
    const withdraw: CategoryId[] = []
    for (const c of CATEGORIES) {
      const nominee = saved.draft[c.id].nominee.trim()
      const costume = saved.draft[c.id].costume.trim()
      if (nominee) votes.push({ category: c.id, nominee, costume })
      else if (costume) found[c.id] = 'Who wore it? Add a name, or leave this category blank.'
      else if (saved.cast?.[c.id]) withdraw.push(c.id)
    }
    if (votes.length === 0 && withdraw.length === 0 && !found.voter) {
      found.ballot = 'Vote in at least one category.'
    }
    setErrors(found)
    setSubmitError(null)
    if (Object.keys(found).length > 0) return

    setSending(true)
    try {
      await castBallot({
        device: deviceId(),
        voter,
        votes,
        withdraw,
        website: honeypotRef.current?.value ?? '',
      })
      // The ballot box now holds exactly this: cleared categories were withdrawn.
      const cast: Partial<Entries> = {}
      votes.forEach((v) => (cast[v.category] = { nominee: v.nominee, costume: v.costume }))
      setSaved((s) => ({ ...s, voter, cast: votes.length > 0 ? cast : null }))
      // Withdrawing everything leaves nothing to show; go back to a fresh ballot.
      setEditing(votes.length === 0)
      refresh(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      if (err instanceof BallotError && err.closed) setOpen(false)
      setSubmitError(err instanceof Error ? err.message : 'That ballot could not be recorded.')
    } finally {
      setSending(false)
    }
  }

  const changeVotes = () => {
    // Start from what was cast, so the guest edits rather than re-types.
    setSaved((s) => ({ ...s, draft: { ...emptyEntries(), ...(s.cast || {}) } }))
    setEditing(true)
    setErrors({})
    setSubmitError(null)
  }

  const sealed = open === false
  const showForm = !sealed && editing

  return (
    <>
      <StageBackdrop />
      <main className={styles.page}>
        <div className={styles.spacer} />
        <Marquee />
        <div className={styles.gap} />
        {open === null && !saved.cast ? (
          <p className={styles.loading} role="status">
            Opening the ballot box…
          </p>
        ) : showForm ? (
          <BallotForm
            voter={saved.voter}
            draft={saved.draft}
            nominees={nominees}
            errors={errors}
            sending={sending}
            submitError={submitError}
            honeypotRef={honeypotRef}
            onVoterChange={setVoter}
            onDraftChange={setDraft}
            onNomineeFocus={() => refresh()}
            onSubmit={submit}
          />
        ) : (
          <BallotCast voter={saved.voter} cast={saved.cast} sealed={sealed} onChange={changeVotes} />
        )}
        <p className={styles.footer}>One ballot per phone. You can change it until voting closes.</p>
      </main>
    </>
  )
}
