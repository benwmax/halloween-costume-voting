import PaperCard from './PaperCard'
import DecoDivider from './DecoDivider'
import { CATEGORIES } from '../lib/categories'
import type { Entries } from '../lib/ballot'
import paper from './PaperCard.module.css'
import styles from './Ballot.module.css'

type Props = {
  voter: string
  cast: Partial<Entries> | null
  sealed: boolean
  onChange: () => void
}

/** After casting, and once the box is sealed: what this phone voted for. */
export default function BallotCast({ voter, cast, sealed, onChange }: Props) {
  const firstName = voter.trim().split(/\s+/)[0]

  return (
    <PaperCard variant="stub">
      <div className={`${paper.cell} ${styles.castHead}`} role="status">
        <div className={styles.kicker}>{sealed ? 'THE BALLOT BOX IS SEALED' : 'YOUR BALLOT IS CAST'}</div>
        <h2 className={styles.castTitle}>
          {sealed
            ? 'Voting has closed.'
            : firstName
              ? `Thank you, ${firstName}.`
              : 'Thank you.'}
        </h2>
        <p className={styles.castBody}>
          {sealed
            ? 'The envelopes are being sealed. Stay close — the winners are announced shortly.'
            : 'The winners are announced later tonight.'}
        </p>
      </div>

      {cast && (
        <div className={`${paper.cell} ${styles.block}`}>
          <div className={styles.label}>{sealed ? 'YOUR FINAL BALLOT' : 'YOUR VOTES'}</div>
          <dl className={styles.castList}>
            {CATEGORIES.map((category) => {
              const entry = cast[category.id]
              return (
                <div key={category.id} className={styles.castRow}>
                  <dt className={styles.castCategory}>{category.title}</dt>
                  <dd className={styles.castNominee}>
                    {entry ? (
                      <>
                        {entry.nominee}
                        {entry.costume && <span className={styles.castCostume}> as {entry.costume}</span>}
                      </>
                    ) : (
                      <span className={styles.castSkipped}>No vote</span>
                    )}
                  </dd>
                </div>
              )
            })}
          </dl>
        </div>
      )}

      <div className={`${paper.cell} ${paper.cellLast} ${styles.actions}`}>
        {sealed ? (
          <DecoDivider variant="single" />
        ) : (
          <>
            <p className={styles.hint}>Changed your mind? You can re-vote until the ballot box closes.</p>
            <button type="button" className={styles.secondary} onClick={onChange}>
              CHANGE MY VOTES
            </button>
          </>
        )}
      </div>
    </PaperCard>
  )
}
