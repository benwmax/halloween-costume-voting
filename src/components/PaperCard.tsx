import type { ReactNode } from 'react'
import styles from './PaperCard.module.css'

type Props = {
  /** 'ticket' carries the full texture stack; 'stub' is the lighter companion card. */
  variant: 'ticket' | 'stub'
  children: ReactNode
  ornaments?: ReactNode
}

/**
 * Aged paper stock with the die-cut scalloped edge, the texture layers, and the
 * 1px keyline box. Everything printed on the card goes inside the keyline.
 */
export default function PaperCard({ variant, children, ornaments }: Props) {
  const isTicket = variant === 'ticket'

  return (
    <div className={`${styles.card} ${isTicket ? styles.ticket : styles.stub}`}>
      <div className={`${styles.texture} ${isTicket ? styles.lighting : styles.lightingSoft}`} />
      {isTicket && <div className={`${styles.texture} ${styles.fibers}`} />}
      <div className={`${styles.texture} ${isTicket ? styles.speckle : styles.speckleSoft}`} />
      {isTicket && <div className={`${styles.texture} ${styles.blotches}`} />}
      {ornaments}
      <div className={styles.keyline}>{children}</div>
    </div>
  )
}
