import PaperCard from './PaperCard'
import DecoDivider from './DecoDivider'
import paper from './PaperCard.module.css'
import styles from './Marquee.module.css'

/** The ticket header: who is throwing it, and what this page is for. */
export default function Marquee() {
  return (
    <PaperCard variant="ticket">
      <div className={`${paper.cell} ${styles.presents}`}>Ben &amp; Andi&apos;s 5th Annual</div>
      <div className={`${paper.cell} ${paper.cellLast} ${styles.title}`}>
        <div className={styles.show}>Haunted Hollywood</div>
        <h1 className={styles.awards}>The Costume Awards</h1>
        <DecoDivider />
        <p className={styles.lede}>
          Cast your ballot for tonight&apos;s finest. Skip any category you like.
        </p>
      </div>
    </PaperCard>
  )
}
