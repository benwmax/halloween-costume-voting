import { useEffect, useId, useState, type FormEvent, type RefObject } from 'react'
import PaperCard from './PaperCard'
import NomineeInput from './NomineeInput'
import { CATEGORIES } from '../lib/categories'
import type { Entries } from '../lib/ballot'
import type { Nominee } from '../lib/match'
import type { FieldErrors } from '../App'
import paper from './PaperCard.module.css'
import styles from './Ballot.module.css'

type Props = {
  voter: string
  draft: Entries
  nominees: Nominee[]
  errors: FieldErrors
  sending: boolean
  submitError: string | null
  honeypotRef: RefObject<HTMLInputElement | null>
  onVoterChange: (value: string) => void
  onDraftChange: (draft: Entries) => void
  onNomineeFocus: () => void
  onSubmit: () => void
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI']

/** The ballot stub: the voter, then one ruled block per category. */
export default function BallotForm({
  voter,
  draft,
  nominees,
  errors,
  sending,
  submitError,
  honeypotRef,
  onVoterChange,
  onDraftChange,
  onNomineeFocus,
  onSubmit,
}: Props) {
  const baseId = useId()

  // Apps Script cold starts can run several seconds. Past a few of them, say so
  // rather than leaving the guest wondering whether the tap registered.
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!sending) {
      setSlow(false)
      return
    }
    const timer = window.setTimeout(() => setSlow(true), 6000)
    return () => window.clearTimeout(timer)
  }, [sending])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit()
  }

  return (
    <PaperCard variant="stub">
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <div className={`${paper.cell} ${styles.block}`}>
          <label className={styles.label} htmlFor={`${baseId}-voter`}>
            YOUR NAME
          </label>
          <input
            id={`${baseId}-voter`}
            className={styles.input}
            type="text"
            autoComplete="name"
            autoCapitalize="words"
            enterKeyHint="next"
            maxLength={80}
            placeholder="First & last"
            aria-invalid={errors.voter ? true : undefined}
            aria-describedby={errors.voter ? `${baseId}-voter-error` : undefined}
            value={voter}
            onChange={(event) => onVoterChange(event.target.value)}
          />
          {errors.voter && (
            <p id={`${baseId}-voter-error`} className={styles.fieldError}>
              {errors.voter}
            </p>
          )}
        </div>

        {CATEGORIES.map((category, index) => {
          const entry = draft[category.id]
          const id = `${baseId}-${category.id}`
          const error = errors[category.id]
          const filled = entry.nominee !== '' || entry.costume !== ''
          const update = (patch: Partial<typeof entry>) =>
            onDraftChange({ ...draft, [category.id]: { ...entry, ...patch } })

          return (
            <fieldset
              key={category.id}
              className={`${paper.cell} ${styles.block} ${styles.category}`}
              aria-describedby={error ? `${id}-error` : undefined}
              onFocus={onNomineeFocus}
            >
              <legend className={styles.categoryHead}>
                <span className={styles.number}>No. {ROMAN[index]}</span>
                <span className={styles.categoryTitle}>{category.title}</span>
              </legend>
              <p className={styles.tagline}>{category.tagline}</p>

              <label className={styles.label} htmlFor={`${id}-nominee`}>
                {category.nomineeLabel}
              </label>
              <NomineeInput
                id={`${id}-nominee`}
                kind={category.kind}
                value={entry.nominee}
                placeholder={category.nomineePlaceholder}
                nominees={nominees}
                invalid={Boolean(error)}
                onChange={(nominee) => update({ nominee })}
                onPick={(nominee) =>
                  update({ nominee: nominee.name, costume: entry.costume.trim() ? entry.costume : nominee.costume })
                }
              />

              <label className={`${styles.label} ${styles.labelSpaced}`} htmlFor={`${id}-costume`}>
                THEIR COSTUME <span className={styles.optional}>optional</span>
              </label>
              <input
                id={`${id}-costume`}
                className={styles.input}
                type="text"
                autoComplete="off"
                enterKeyHint="next"
                maxLength={120}
                placeholder="What they came as"
                value={entry.costume}
                onChange={(event) => update({ costume: event.target.value })}
              />

              {error && (
                <p id={`${id}-error`} className={styles.fieldError}>
                  {error}
                </p>
              )}
              {filled && (
                <button
                  type="button"
                  className={styles.skip}
                  onClick={() => update({ nominee: '', costume: '' })}
                >
                  Clear — skip this category
                </button>
              )}
            </fieldset>
          )
        })}

        {/*
          Honeypot: off-screen, unlabelled, skipped by keyboard and hidden
          from assistive tech, so no real guest ever fills it.
        */}
        <input
          ref={honeypotRef}
          type="text"
          name="website"
          className={styles.honeypot}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          defaultValue=""
        />

        <div className={`${paper.cell} ${paper.cellLast} ${styles.actions}`}>
          {errors.ballot && (
            <p className={styles.error} role="alert">
              {errors.ballot}
            </p>
          )}
          <button type="submit" className={styles.submit} disabled={sending} aria-busy={sending}>
            {sending ? (
              <span className={styles.sendingLabel}>
                CASTING
                <span className={styles.chase} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </span>
            ) : (
              'CAST MY BALLOT'
            )}
          </button>
          {sending && slow && (
            <p className={styles.hint} role="status">
              Still sending — the ballot box is waking up.
            </p>
          )}
          {submitError && (
            <p className={styles.error} role="alert">
              {submitError}
            </p>
          )}
        </div>
      </form>
    </PaperCard>
  )
}
