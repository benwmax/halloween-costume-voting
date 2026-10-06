import type { CategoryId } from './categories'
import type { Nominee } from './match'

export type Vote = { category: CategoryId; nominee: string; costume: string }

export type BallotPayload = {
  device: string
  voter: string
  votes: Vote[]
  /** Categories this phone voted in before and has now cleared. */
  withdraw: CategoryId[]
  /** Honeypot. Always '' from a real browser; bots fill it and get discarded. */
  website: string
}

export type Status = { open: boolean; nominees: Nominee[] }

/** Apps Script /exec URL. Unset in local dev unless you add a .env.local. */
const ENDPOINT = import.meta.env.VITE_VOTE_ENDPOINT as string | undefined

const TIMEOUT_MS = 20000

export class BallotError extends Error {
  closed: boolean
  constructor(message: string, closed = false) {
    super(message)
    this.closed = closed
  }
}

/** Sample names so autocomplete can be tried in dev without a spreadsheet. */
const DEV_NOMINEES: Nominee[] = [
  { name: 'Sarah Williams', costume: 'Vampire queen', kind: 'person' },
  { name: 'Tom Becker', costume: 'Frankenstein’s monster', kind: 'person' },
  { name: 'Priya Shah', costume: 'Norma Desmond', kind: 'person' },
  { name: 'Jo & Sam', costume: 'Bonnie and Clyde', kind: 'couple' },
]

export async function fetchStatus(): Promise<Status> {
  if (!ENDPOINT) {
    if (import.meta.env.PROD) throw new BallotError('The ballot box is not reachable right now.')
    return { open: true, nominees: DEV_NOMINEES }
  }
  const response = await fetch(`${ENDPOINT}?action=status`, {
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const body = await response.json()
  if (!body || body.ok !== true) throw new BallotError(body?.error || 'The ballot box could not be read.')
  return { open: body.open !== false, nominees: Array.isArray(body.nominees) ? body.nominees : [] }
}

/**
 * Casts (or re-casts) this phone's ballot.
 *
 * In dev, a missing endpoint resolves without sending so the page still demos
 * end to end. In a built site it throws instead: Vite inlines env vars at build
 * time, so a deploy without the variable would otherwise thank every guest and
 * record nothing.
 */
export async function castBallot(payload: BallotPayload): Promise<void> {
  if (!ENDPOINT) {
    if (import.meta.env.PROD) {
      throw new BallotError('The ballot box is not reachable right now. Please find Ben & Andi.')
    }
    console.warn('[vote] VITE_VOTE_ENDPOINT is not set — ballot was not recorded.', payload)
    await new Promise((resolve) => setTimeout(resolve, 600))
    return
  }

  let response: Response
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      /*
       * text/plain keeps this a "simple" request so the browser skips the CORS
       * preflight. Apps Script cannot answer an OPTIONS request, so sending
       * application/json here would fail before it ever left the browser.
       */
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new BallotError('We could not reach the ballot box. Check your connection and try again.')
  }

  if (!response.ok) {
    throw new BallotError('The ballot box turned us away. Please try again in a moment.')
  }

  const body = await response.json().catch(() => null)
  if (body && body.ok === false) {
    throw new BallotError(body.error || 'That ballot could not be recorded.', body.closed === true)
  }
}
