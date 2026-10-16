import type { Standing } from '../lib/results'
import styles from './AwardEnvelope.module.css'

type Props = {
  winners: Standing[]
  opened: boolean
}

/**
 * The invitation's kraft envelope, now holding the winner's card. Sealed, it
 * bobs under the spotlight. Opened, the flap swings back, the card rises out,
 * the envelope sinks away and the card comes forward to fill the screen.
 *
 * Mounted once per category and kept mounted across the sealed and opened
 * slides, so the opening plays as a transition rather than a cut.
 */
export default function AwardEnvelope({ winners, opened }: Props) {
  const tie = winners.length > 1

  return (
    <div className={`${styles.stage} ${opened ? styles.opened : styles.sealed}`}>
      <div className={styles.envelope} aria-hidden="true">
        <div className={styles.kraft} />
        <div className={styles.fibers} />
        <div className={styles.back} />
      </div>

      <div
        className={`${styles.cards} ${tie ? styles.cardsTie : ''}`}
        style={{ ['--count' as string]: winners.length }}
        aria-hidden={!opened}
      >
        {winners.map((winner, index) => (
          <div
            key={winner.name}
            className={styles.card}
            style={{ ['--i' as string]: index - (winners.length - 1) / 2 }}
          >
            <div className={styles.cardKeyline}>
              <div className={styles.cardKicker}>{tie ? 'CO-WINNER' : 'THE WINNER'}</div>
              <div className={styles.cardName}>{winner.name}</div>
              {winner.costume && <div className={styles.cardCostume}>as {winner.costume}</div>}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.envelopeFront} aria-hidden="true">
        <div className={styles.pocket} />
        <div className={`${styles.seam} ${styles.seamLeft}`} />
        <div className={`${styles.seam} ${styles.seamRight}`} />
        <div className={styles.flap} />
        <div className={styles.seal}>HH</div>
      </div>
    </div>
  )
}
