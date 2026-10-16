import type { CategoryId } from './categories'

export type Standing = { rank: number; name: string; costume: string; votes: number }

export type CategoryResult = {
  id: CategoryId
  title: string
  totalVotes: number
  /** Ranked; ties share a rank, so several entries can hold rank 1. */
  entries: Standing[]
}

export type Results = { open: boolean; totalBallots: number; categories: CategoryResult[] }

const ENDPOINT = import.meta.env.VITE_VOTE_ENDPOINT as string | undefined
const TIMEOUT_MS = 20000

export class ResultsError extends Error {
  /** The ballot box rejected the host key, as opposed to being unreachable. */
  badKey: boolean
  constructor(message: string, badKey = false) {
    super(message)
    this.badKey = badKey
  }
}

/** True when there is no ballot box to ask, so the show runs on sample results. */
export const DEMO = !ENDPOINT && import.meta.env.DEV

/** A rehearsal show for dev, with a co-win in Best Dressed. */
const DEMO_RESULTS: Results = {
  open: false,
  totalBallots: 47,
  categories: [
    {
      id: 'best-dressed',
      title: 'Best Dressed',
      totalVotes: 41,
      entries: [
        { rank: 1, name: 'Sarah Williams', costume: 'Vampire queen', votes: 12 },
        { rank: 1, name: 'Priya Shah', costume: 'Norma Desmond', votes: 12 },
        { rank: 3, name: 'Marcus Lee', costume: 'The Phantom of the Opera', votes: 9 },
        { rank: 4, name: 'Dana Ortiz', costume: 'Cruella de Vil', votes: 5 },
        { rank: 5, name: 'Chris Novak', costume: 'Gatsby', votes: 3 },
      ],
    },
    {
      id: 'couples',
      title: 'Best Couples Costume',
      totalVotes: 38,
      entries: [
        { rank: 1, name: 'Jo & Sam', costume: 'Bonnie and Clyde', votes: 17 },
        { rank: 2, name: 'Alex & Riley', costume: 'Morticia and Gomez', votes: 11 },
        { rank: 3, name: 'Kim & Pat', costume: 'The Shining twins', votes: 10 },
      ],
    },
    {
      id: 'scariest',
      title: 'Scariest Costume',
      totalVotes: 44,
      entries: [
        { rank: 1, name: 'Tom Becker', costume: 'Frankenstein’s monster', votes: 19 },
        { rank: 2, name: 'Lena Fischer', costume: 'Pennywise', votes: 14 },
        { rank: 3, name: 'Omar Haddad', costume: 'Nosferatu', votes: 8 },
        { rank: 4, name: 'Beth Carroll', costume: 'Samara from The Ring', votes: 3 },
      ],
    },
  ],
}

export async function fetchResults(key: string): Promise<Results> {
  if (!ENDPOINT) {
    if (DEMO) return structuredClone(DEMO_RESULTS)
    throw new ResultsError('This site was built without the ballot box address.')
  }
  let body: unknown
  try {
    const response = await fetch(`${ENDPOINT}?action=results&key=${encodeURIComponent(key)}`, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    body = await response.json()
  } catch {
    throw new ResultsError('Could not reach the ballot box. Check the connection and try again.')
  }
  const data = body as Partial<Results> & { ok?: boolean; error?: string }
  if (!data || data.ok !== true || !Array.isArray(data.categories)) {
    throw new ResultsError('That host key was not accepted. Check it against the Settings tab.', true)
  }
  return { open: data.open !== false, totalBallots: data.totalBallots ?? 0, categories: data.categories }
}
