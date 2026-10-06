import styles from './DecoDivider.module.css'

type Props = {
  /** The close divider carries a single outlined diamond; the title divider carries three. */
  variant?: 'full' | 'single'
}

/** Hairline → diamonds → hairline. Diamonds are 45deg-rotated squares in printed gold. */
export default function DecoDivider({ variant = 'full' }: Props) {
  return (
    <div className={styles.divider}>
      <div className={`${styles.rule} ${styles.ruleLeft}`} />
      {variant === 'full' && <div className={styles.filled} />}
      <div className={variant === 'full' ? styles.outlined : styles.outlinedLone} />
      {variant === 'full' && <div className={styles.filled} />}
      <div className={`${styles.rule} ${styles.ruleRight}`} />
    </div>
  )
}
