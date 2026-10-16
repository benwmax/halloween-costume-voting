import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import StageBackdrop from '../components/StageBackdrop'
import DecoDivider from '../components/DecoDivider'
import AwardEnvelope from './AwardEnvelope'
import { buildSlides, type Slide } from './slides'
import { ShowAudio } from './sound'
import { DEMO, fetchResults, ResultsError, type Results } from '../lib/results'
import styles from './Awards.module.css'

const KEY_STORAGE = 'hh-awards-key'
const POSITION_STORAGE = 'hh-awards-slide'
const SOUND_STORAGE = 'hh-awards-sound'

type Phase = 'backstage' | 'show'

export default function AwardsApp() {
  const [hostKey, setHostKey] = useState<string>(takeHostKey)
  const [results, setResults] = useState<Results | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('backstage')
  const [index, setIndex] = useState(0)
  const [sound, setSound] = useState(readSound)
  const audio = useRef<ShowAudio | null>(null)
  audio.current ??= new ShowAudio()

  const load = useCallback(async (key: string) => {
    setLoading(true)
    setError(null)
    try {
      setResults(await fetchResults(key))
    } catch (err) {
      if (err instanceof ResultsError && err.badKey) forgetKey(setHostKey)
      setError(err instanceof Error ? err.message : 'The results could not be read.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (hostKey || DEMO) load(hostKey)
  }, [hostKey, load])

  const slides = useMemo(() => (results ? buildSlides(results) : []), [results])
  const saved = readPosition()

  const toggleSound = (on: boolean) => {
    setSound(on)
    writeSound(on)
    audio.current!.setMuted(!on)
  }

  const start = (from: number) => {
    const to = Math.min(from, slides.length - 1)
    // This click is what lets the browser play sound for the rest of the show.
    audio.current!.unlock()
    audio.current!.setMuted(!sound)
    cue(audio.current!, slides, null, to)
    setIndex(to)
    setPhase('show')
    document.documentElement.requestFullscreen?.().catch(() => {})
  }

  if (phase === 'show' && results) {
    return (
      <Show
        slides={slides}
        index={index}
        setIndex={setIndex}
        audio={audio.current}
        sound={sound}
        onSoundChange={toggleSound}
        onExit={() => {
          audio.current!.stopAll()
          setPhase('backstage')
        }}
      />
    )
  }

  return (
    <>
      <StageBackdrop />
      <main className={styles.backstage}>
        <div className={styles.panel}>
          <div className={styles.panelKicker}>HAUNTED HOLLYWOOD · BACKSTAGE</div>
          <h1 className={styles.panelTitle}>The Costume Awards</h1>
          <DecoDivider />

          {!hostKey && !DEMO ? (
            <KeyForm onKey={(key) => saveKey(key, setHostKey)} error={error} />
          ) : (
            <>
              {DEMO && (
                <p className={styles.note}>Rehearsal mode: no ballot box is set, so these are sample results.</p>
              )}
              {loading && !results && <p className={styles.note}>Counting the ballots…</p>}
              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}
              {results && (
                <>
                  <div
                    className={`${styles.status} ${results.open ? styles.statusOpen : styles.statusClosed}`}
                    role="status"
                  >
                    {results.open ? (
                      <>
                        <strong>Voting is still open.</strong> Untick <em>Voting open</em> in the Settings tab
                        before the show, then refresh here, so a late ballot cannot change a winner.
                      </>
                    ) : (
                      <>
                        <strong>Voting is closed.</strong> These results are final.
                      </>
                    )}
                  </div>

                  {/* Counts only, never names: this screen may already be on the TV. */}
                  <dl className={styles.counts}>
                    <div>
                      <dt>Ballots</dt>
                      <dd>{results.totalBallots}</dd>
                    </div>
                    {results.categories.map((c) => (
                      <div key={c.id}>
                        <dt>{c.title}</dt>
                        <dd>
                          {c.totalVotes} {c.totalVotes === 1 ? 'vote' : 'votes'}
                          {c.entries.filter((e) => e.rank === 1).length > 1 && (
                            <span className={styles.tieNote}> · tie for first</span>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  <div className={styles.buttons}>
                    <button type="button" className={styles.primary} onClick={() => start(0)}>
                      START THE SHOW
                    </button>
                    {saved > 0 && saved < slides.length && (
                      <button type="button" className={styles.secondary} onClick={() => start(saved)}>
                        RESUME AT SLIDE {saved + 1} OF {slides.length}
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={() => load(hostKey)}
                      disabled={loading}
                    >
                      {loading ? 'REFRESHING…' : 'REFRESH RESULTS'}
                    </button>
                  </div>

                  <div className={styles.soundRow}>
                    <label className={styles.soundToggle}>
                      <input
                        type="checkbox"
                        checked={sound}
                        onChange={(event) => toggleSound(event.target.checked)}
                      />
                      Drum rolls &amp; fanfares
                    </label>
                    <button
                      type="button"
                      className={styles.testSound}
                      disabled={!sound}
                      onClick={() => audio.current!.test()}
                    >
                      ♪ Test sound
                    </button>
                  </div>
                </>
              )}

              <div className={styles.help}>
                <p>
                  <strong>Running the show:</strong> tap or click the right of the screen, or press → or Space,
                  to move on. Tap the left edge, or press ←, to go back. F toggles full screen; M mutes; Esc
                  (twice in full screen) returns here.
                </p>
                <p>
                  Fixed a spelling in the Merges tab? Refresh the results before you start; the show reads
                  them when it begins.
                </p>
              </div>
              {!DEMO && (
                <button type="button" className={styles.link} onClick={() => forgetKey(setHostKey)}>
                  Forget the host key on this device
                </button>
              )}
            </>
          )}
        </div>
      </main>
    </>
  )
}

/** The show itself: one slide at a time, full screen. */
function Show({
  slides,
  index,
  setIndex,
  audio,
  sound,
  onSoundChange,
  onExit,
}: {
  slides: Slide[]
  index: number
  setIndex: (index: number) => void
  audio: ShowAudio
  sound: boolean
  onSoundChange: (on: boolean) => void
  onExit: () => void
}) {
  const last = slides.length - 1
  const [toast, setToast] = useState<string | null>(null)

  const go = useCallback(
    (to: number) => {
      if (to < 0 || to > last || to === index) return
      cue(audio, slides, index, to)
      setIndex(to)
    },
    [audio, slides, index, last, setIndex],
  )
  const next = useCallback(() => go(index + 1), [go, index])
  const prev = useCallback(() => go(index - 1), [go, index])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 1600)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => writePosition(index), [index])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (['ArrowRight', 'ArrowDown', ' ', 'Enter', 'PageDown'].includes(event.key)) {
        event.preventDefault()
        next()
      } else if (['ArrowLeft', 'ArrowUp', 'Backspace', 'PageUp'].includes(event.key)) {
        event.preventDefault()
        prev()
      } else if (event.key === 'f' || event.key === 'F') {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
        else document.documentElement.requestFullscreen?.().catch(() => {})
      } else if (event.key === 'm' || event.key === 'M') {
        onSoundChange(!sound)
        setToast(sound ? 'Sound off' : 'Sound on')
      } else if (event.key === 'Escape' && !document.fullscreenElement) {
        // In full screen the browser takes the first Esc to leave it; the next one leaves the show.
        onExit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev, onExit, onSoundChange, sound])

  useWakeLock()

  const slide = slides[index]

  return (
    <main
      className={styles.show}
      onClick={(event) => (event.clientX < window.innerWidth * 0.2 ? prev() : next())}
    >
      <StageBackdrop />
      <div className={styles.frame}>
        <div className={styles.spotlight} aria-hidden="true" />
        <div key={slideKey(slide, index)} className={styles.slide} aria-live="polite">
          <SlideView slide={slide} />
        </div>
        {toast && (
          <div className={styles.toast} role="status">
            {toast}
          </div>
        )}
        <div className={styles.progress} aria-hidden="true">
          {slides.map((_, i) => (
            <span key={i} className={i <= index ? styles.progressOn : undefined} />
          ))}
        </div>
      </div>
    </main>
  )
}

/** Rows of up to three read better than a long row of four; seven or more need four. */
function columns(count: number) {
  if (count <= 3) return count
  if (count === 4) return 2
  return count <= 6 ? 3 : 4
}

/**
 * The sound for arriving at a slide. Stingers only play stepping forward (or
 * on starting the show), so backing up to fix a mis-tap never replays a
 * fanfare, while a sealed envelope always rolls, whichever way you reach it.
 */
function cue(audio: ShowAudio, slides: Slide[], from: number | null, to: number) {
  const slide = slides[to]
  const forward = from === null || to === from + 1
  if (slide.kind === 'envelope' && slide.opened) {
    if (forward) audio.reveal()
    else audio.stopRoll()
    return
  }
  audio.stopRoll()
  if (slide.kind === 'envelope') audio.startRoll()
  else if (slide.kind === 'opening' && forward) audio.title()
  else if (slide.kind === 'finale' && forward) audio.title(true)
}

/** Sealed and opened envelopes share a key so the opening animates in place. */
function slideKey(slide: Slide, index: number) {
  return slide.kind === 'envelope' ? `envelope-${slide.category.id}` : `${slide.kind}-${index}`
}

function SlideView({ slide }: { slide: Slide }) {
  switch (slide.kind) {
    case 'opening':
      return (
        <div className={styles.center}>
          <div className={styles.kicker}>BEN &amp; ANDI&apos;S 5TH ANNUAL HAUNTED HOLLYWOOD</div>
          <div className={styles.presents}>presents</div>
          <h1 className={styles.marquee}>The Costume Awards</h1>
          <div className={styles.dividerWide}>
            <DecoDivider />
          </div>
          <p className={styles.subline}>
            {slide.ballots} {slide.ballots === 1 ? 'ballot' : 'ballots'} cast. Three awards. One night only.
          </p>
        </div>
      )

    case 'nominees':
      return (
        <div className={styles.center}>
          <div className={styles.kicker}>THE NOMINEES FOR</div>
          <h2 className={styles.categoryTitle}>{slide.category.title}</h2>
          <ul className={styles.nominees} style={{ ['--cols' as string]: columns(slide.nominees.length) }}>
            {slide.nominees.map((n, i) => (
              <li key={n.name} className={styles.nominee} style={{ ['--d' as string]: `${300 + i * 260}ms` }}>
                <span className={styles.nomineeName}>{n.name}</span>
                {n.costume && <span className={styles.nomineeCostume}>{n.costume}</span>}
              </li>
            ))}
          </ul>
        </div>
      )

    case 'envelope':
      return (
        <div className={styles.envelopeSlide}>
          <div className={`${styles.envelopeHead} ${slide.opened ? styles.envelopeHeadOpened : ''}`}>
            <div className={styles.kicker}>AND THE AWARD FOR</div>
            <h2 className={styles.categoryTitleSmall}>{slide.category.title}</h2>
            <div className={styles.goesTo}>goes to…</div>
          </div>
          {slide.opened && (
            <div className={styles.winnerCaption} aria-hidden="true">
              {slide.category.title}
              {slide.winners.length > 1 && <span className={styles.tie}> · it&apos;s a tie!</span>}
            </div>
          )}
          <AwardEnvelope winners={slide.winners} opened={slide.opened} />
          {slide.opened && (
            <span className={styles.srOnly}>
              {slide.winners.map((w) => (w.costume ? `${w.name}, as ${w.costume}` : w.name)).join(' and ')}
            </span>
          )}
        </div>
      )

    case 'empty':
      return (
        <div className={styles.center}>
          <div className={styles.kicker}>THE AWARD FOR</div>
          <h2 className={styles.categoryTitle}>{slide.category.title}</h2>
          <p className={styles.subline}>…received no votes tonight. The envelope stays sealed.</p>
        </div>
      )

    case 'finale':
      return (
        <div className={styles.center}>
          <div className={styles.kicker}>TONIGHT&apos;S WINNERS</div>
          <h2 className={styles.marqueeSmall}>That&apos;s a Wrap</h2>
          <div className={styles.dividerWide}>
            <DecoDivider />
          </div>
          <div className={styles.finale}>
            {slide.winners.map(({ category, winners }, i) => (
              <div key={category.id} className={styles.finaleCard} style={{ ['--d' as string]: `${300 + i * 300}ms` }}>
                <div className={styles.finaleCategory}>{category.title}</div>
                {winners.map((w) => (
                  <div key={w.name} className={styles.finaleWinner}>
                    <span className={styles.finaleName}>{w.name}</span>
                    {w.costume && <span className={styles.finaleCostume}>as {w.costume}</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <p className={styles.subline}>Thank you for haunting Hollywood with us.</p>
        </div>
      )
  }
}

function KeyForm({ onKey, error }: { onKey: (key: string) => void; error: string | null }) {
  const [value, setValue] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (value.trim()) onKey(value.trim())
  }
  return (
    <form className={styles.keyForm} onSubmit={submit}>
      <label htmlFor="host-key" className={styles.keyLabel}>
        HOST KEY
      </label>
      <p className={styles.note}>
        It is in the Settings tab of the Costume Votes sheet. This device remembers it afterwards.
      </p>
      <input
        id="host-key"
        className={styles.keyInput}
        type="password"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button type="submit" className={styles.primary}>
        GO BACKSTAGE
      </button>
    </form>
  )
}

/**
 * The host key arrives once as ?key=… and is then kept on this device, and
 * taken out of the address bar so it is never on the TV.
 */
function takeHostKey(): string {
  const url = new URL(window.location.href)
  const fromUrl = url.searchParams.get('key')
  if (fromUrl) {
    url.searchParams.delete('key')
    window.history.replaceState(null, '', url.toString())
    try {
      localStorage.setItem(KEY_STORAGE, fromUrl)
    } catch {
      // Storage blocked: the key lasts for this visit only.
    }
    return fromUrl
  }
  try {
    return localStorage.getItem(KEY_STORAGE) || ''
  } catch {
    return ''
  }
}

function saveKey(key: string, set: (k: string) => void) {
  try {
    localStorage.setItem(KEY_STORAGE, key)
  } catch {
    // Storage blocked: the key lasts for this visit only.
  }
  set(key)
}

function forgetKey(set: (k: string) => void) {
  try {
    localStorage.removeItem(KEY_STORAGE)
  } catch {
    // Nothing stored.
  }
  set('')
}

/** Where the show was, so a reload mid-ceremony can pick up where it left off. */
function readPosition(): number {
  try {
    return Number(sessionStorage.getItem(POSITION_STORAGE) || 0)
  } catch {
    return 0
  }
}

function writePosition(index: number) {
  try {
    sessionStorage.setItem(POSITION_STORAGE, String(index))
  } catch {
    // Storage blocked: a reload starts from the top.
  }
}

function readSound(): boolean {
  try {
    return localStorage.getItem(SOUND_STORAGE) !== 'off'
  } catch {
    return true
  }
}

function writeSound(on: boolean) {
  try {
    localStorage.setItem(SOUND_STORAGE, on ? 'on' : 'off')
  } catch {
    // Storage blocked: the choice lasts for this visit only.
  }
}

/** Keep a phone or tablet from dimming and locking mid-show. */
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null
    const request = () => {
      if (document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return
      navigator.wakeLock
        .request('screen')
        .then((l) => (lock = l))
        .catch(() => {})
    }
    request()
    document.addEventListener('visibilitychange', request)
    return () => {
      document.removeEventListener('visibilitychange', request)
      lock?.release().catch(() => {})
    }
  }, [])
}
