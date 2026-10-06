import { CATEGORIES, type CategoryId } from './categories'

export type Entry = { nominee: string; costume: string }
export type Entries = Record<CategoryId, Entry>

export type Saved = {
  voter: string
  /** What the guest is filling in now. */
  draft: Entries
  /** What the ballot box last accepted from this phone, if anything. */
  cast: Partial<Entries> | null
}

const KEY = 'hh-vote-ballot'

export function emptyEntries(): Entries {
  return Object.fromEntries(CATEGORIES.map((c) => [c.id, { nominee: '', costume: '' }])) as Entries
}

/** The ballot survives a reload or a locked phone, so nobody re-types. */
export function loadBallot(): Saved {
  const blank: Saved = { voter: '', draft: emptyEntries(), cast: null }
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return blank
    const parsed = JSON.parse(raw) as Partial<Saved>
    return {
      voter: typeof parsed.voter === 'string' ? parsed.voter : '',
      draft: { ...blank.draft, ...(parsed.draft || {}) },
      cast: parsed.cast && typeof parsed.cast === 'object' ? parsed.cast : null,
    }
  } catch {
    return blank
  }
}

export function saveBallot(saved: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved))
  } catch {
    // Storage blocked: the ballot just will not survive a reload.
  }
}
