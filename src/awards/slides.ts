import type { CategoryResult, Results, Standing } from '../lib/results'

export type Slide =
  | { kind: 'opening'; ballots: number }
  | { kind: 'nominees'; category: CategoryResult; nominees: Standing[] }
  | { kind: 'envelope'; category: CategoryResult; winners: Standing[]; opened: boolean }
  | { kind: 'empty'; category: CategoryResult }
  | { kind: 'finale'; winners: { category: CategoryResult; winners: Standing[] }[] }

/** Show at most this many nominees, plus anyone tied with the last one, up to the hard cap. */
const NOMINEES = 5
const NOMINEES_CAP = 8

/**
 * The running order: an opening card, then per category the nominees, the
 * sealed envelope and the opened one, then a curtain call of every winner.
 *
 * Nominees are listed alphabetically so their order gives nothing away.
 */
export function buildSlides(results: Results): Slide[] {
  const slides: Slide[] = [{ kind: 'opening', ballots: results.totalBallots }]
  const finale: { category: CategoryResult; winners: Standing[] }[] = []

  for (const category of results.categories) {
    if (category.entries.length === 0) {
      slides.push({ kind: 'empty', category })
      continue
    }
    const cutoff = category.entries[Math.min(NOMINEES, category.entries.length) - 1].rank
    const nominees = category.entries
      .filter((e) => e.rank <= cutoff)
      .slice(0, NOMINEES_CAP)
      .sort((a, b) => a.name.localeCompare(b.name))
    const winners = category.entries.filter((e) => e.rank === 1)
    slides.push({ kind: 'nominees', category, nominees })
    slides.push({ kind: 'envelope', category, winners, opened: false })
    slides.push({ kind: 'envelope', category, winners, opened: true })
    finale.push({ category, winners })
  }

  slides.push({ kind: 'finale', winners: finale })
  return slides
}
