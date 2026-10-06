import type { CSSProperties } from 'react'
import styles from './StageBackdrop.module.css'

type Mote = {
  left: string
  top: string
  size: string
  dx: string
  dy: string
  peak: number
  duration: string
  delay: string
}

/*
 * Hand-placed rather than random so the drift is the same every load and the
 * motes stay clear of the 600px centre column where the paper sits.
 */
const MOTES: Mote[] = [
  { left: '12%', top: '18%', size: '2px', dx: '26px', dy: '-120px', peak: 0.5, duration: '19s', delay: '0s' },
  { left: '19%', top: '62%', size: '1.5px', dx: '-18px', dy: '-150px', peak: 0.35, duration: '24s', delay: '3s' },
  { left: '26%', top: '38%', size: '2.5px', dx: '14px', dy: '-90px', peak: 0.4, duration: '16s', delay: '7s' },
  { left: '31%', top: '81%', size: '1.5px', dx: '22px', dy: '-130px', peak: 0.3, duration: '27s', delay: '1.5s' },
  { left: '36%', top: '12%', size: '2px', dx: '-24px', dy: '-70px', peak: 0.45, duration: '21s', delay: '9s' },
  { left: '44%', top: '55%', size: '1.5px', dx: '16px', dy: '-110px', peak: 0.28, duration: '25s', delay: '5s' },
  { left: '56%', top: '28%', size: '2px', dx: '-20px', dy: '-140px', peak: 0.42, duration: '18s', delay: '12s' },
  { left: '63%', top: '72%', size: '2.5px', dx: '18px', dy: '-95px', peak: 0.32, duration: '23s', delay: '2s' },
  { left: '69%', top: '44%', size: '1.5px', dx: '-14px', dy: '-125px', peak: 0.5, duration: '20s', delay: '15s' },
  { left: '74%', top: '15%', size: '2px', dx: '24px', dy: '-80px', peak: 0.38, duration: '26s', delay: '6s' },
  { left: '81%', top: '66%', size: '1.5px', dx: '-22px', dy: '-145px', peak: 0.3, duration: '22s', delay: '10s' },
  { left: '88%', top: '34%', size: '2px', dx: '12px', dy: '-100px', peak: 0.44, duration: '17s', delay: '4s' },
]

/**
 * The room the invitation is sitting in — a dimmed movie palace, drawn entirely
 * in CSS. Purely decorative, so it is hidden from assistive tech.
 */
export default function StageBackdrop() {
  return (
    <div className={styles.backdrop} aria-hidden="true">
      <div className={styles.rays} />
      <div className={styles.houseLight} />
      <div className={`${styles.curtain} ${styles.curtainLeft}`} />
      <div className={`${styles.curtain} ${styles.curtainRight}`} />
      <div className={styles.footlights} />
      {MOTES.map((mote, index) => (
        <span
          key={index}
          className={styles.mote}
          style={
            {
              left: mote.left,
              top: mote.top,
              '--mote-size': mote.size,
              '--mote-dx': mote.dx,
              '--mote-dy': mote.dy,
              '--mote-peak': mote.peak,
              '--mote-duration': mote.duration,
              '--mote-delay': mote.delay,
            } as CSSProperties
          }
        />
      ))}
      <div className={styles.grain} />
    </div>
  )
}
