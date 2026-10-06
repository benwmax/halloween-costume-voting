const STORAGE_KEY = 'hh-vote-device'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7

/**
 * A random ID minted the first time this browser opens the ballot. The ballot
 * box keys every vote on it, so voting again from the same phone replaces the
 * earlier vote instead of adding a second one.
 *
 * Kept in localStorage and mirrored to a cookie, so clearing one does not mint
 * a fresh identity. A private tab still starts clean; the ballot box covers
 * that by also matching on the voter's name.
 */
export function deviceId(): string {
  const existing = readStorage() || readCookie()
  const id = existing && /^[A-Za-z0-9][A-Za-z0-9-]{15,63}$/.test(existing) ? existing : mint()
  writeStorage(id)
  writeCookie(id)
  return id
}

function mint(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function readStorage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStorage(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // Storage blocked: the cookie still holds it.
  }
}

function readCookie(): string | null {
  const match = document.cookie.match(new RegExp('(?:^|; )' + STORAGE_KEY + '=([^;]*)'))
  return match ? decodeURIComponent(match[1]) : null
}

function writeCookie(id: string) {
  const path = import.meta.env.BASE_URL
  document.cookie = `${STORAGE_KEY}=${encodeURIComponent(id)}; max-age=${COOKIE_MAX_AGE}; path=${path}; SameSite=Lax; Secure`
}
