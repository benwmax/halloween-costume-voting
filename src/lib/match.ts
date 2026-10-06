import type { NomineeKind } from './categories'

export type Nominee = {
  name: string
  costume: string
  kind: NomineeKind
}

/** Loose cousin of normalizeName in Code.gs: enough to match what a guest is typing. */
export function fold(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9& ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Names others have already entered, filtered to what is being typed. Matches
 * on the costume too: at a party you often remember the werewolf, not the name.
 * Every typed word must start some word in the name or costume.
 */
export function suggest(nominees: Nominee[], kind: NomineeKind, query: string, limit = 5): Nominee[] {
  const words = fold(query).split(' ').filter(Boolean)
  if (words.length === 0) return []
  const exact = fold(query)
  return nominees
    .filter((n) => n.kind === kind)
    .filter((n) => fold(n.name) !== exact)
    .map((n) => {
      const nameWords = fold(n.name).split(' ')
      const costumeWords = fold(n.costume).split(' ')
      const inName = words.every((w) => nameWords.some((t) => t.startsWith(w)))
      const inCostume = words.every((w) => costumeWords.some((t) => t.startsWith(w)))
      return { n, score: inName ? 2 : inCostume ? 1 : 0 }
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || a.n.name.localeCompare(b.n.name))
    .slice(0, limit)
    .map((m) => m.n)
}
