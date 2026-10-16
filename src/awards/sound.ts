/**
 * The show's sound effects, synthesised with the Web Audio API: no audio
 * files to license or download. A snare roll that builds while the envelope is
 * sealed, a bass-drum hit and crash cymbal as it opens, and brass fanfares.
 *
 * Everything is built against a BaseAudioContext, so the same voices can be
 * rendered offline to check levels without anyone listening.
 */

type Voices = {
  ctx: BaseAudioContext
  /** Dry bus: everything ends here, through the master compressor. */
  out: AudioNode
  /** Send to the hall reverb. */
  hall: AudioNode
  noise: AudioBuffer
}

export function createVoices(ctx: BaseAudioContext, volume = 0.85): Voices {
  const master = ctx.createGain()
  master.gain.value = volume
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -10
  limiter.knee.value = 6
  limiter.ratio.value = 12
  limiter.attack.value = 0.003
  limiter.release.value = 0.25
  master.connect(limiter).connect(ctx.destination)

  const reverb = ctx.createConvolver()
  reverb.buffer = hallImpulse(ctx, 2.4)
  const wet = ctx.createGain()
  wet.gain.value = 0.32
  reverb.connect(wet).connect(master)

  return { ctx, out: master, hall: reverb, noise: whiteNoise(ctx, 2) }
}

function whiteNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

/** A dark, decaying stereo tail: a movie palace rather than a bathroom. */
function hallImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel)
    let smooth = 0
    for (let i = 0; i < length; i++) {
      // One-pole lowpass on the noise takes the hiss off the tail.
      smooth = smooth * 0.6 + (Math.random() * 2 - 1) * 0.4
      data[i] = smooth * Math.pow(1 - i / length, 3.2)
    }
  }
  return buffer
}

/** Route a voice to the dry bus and, a little, the hall. */
function send(v: Voices, node: AudioNode, reverb = 0.5) {
  node.connect(v.out)
  if (reverb > 0) {
    const s = v.ctx.createGain()
    s.gain.value = reverb
    node.connect(s).connect(v.hall)
  }
}

// --- Drums ------------------------------------------------------------------

/** One snare stroke: filtered noise for the wires, a short tone for the head. */
export function snare(v: Voices, when: number, velocity: number) {
  const { ctx } = v
  const src = ctx.createBufferSource()
  src.buffer = v.noise
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = 3200 + Math.random() * 600
  band.Q.value = 0.7
  const amp = ctx.createGain()
  amp.gain.setValueAtTime(0.0001, when)
  amp.gain.exponentialRampToValueAtTime(velocity, when + 0.002)
  amp.gain.exponentialRampToValueAtTime(0.0001, when + 0.11)
  src.connect(band).connect(amp)
  send(v, amp, 0.35)
  src.start(when, Math.random() * 1.5, 0.15)

  const head = ctx.createOscillator()
  head.type = 'triangle'
  head.frequency.setValueAtTime(240, when)
  head.frequency.exponentialRampToValueAtTime(170, when + 0.05)
  const headAmp = ctx.createGain()
  headAmp.gain.setValueAtTime(0.0001, when)
  headAmp.gain.exponentialRampToValueAtTime(velocity * 0.5, when + 0.002)
  headAmp.gain.exponentialRampToValueAtTime(0.0001, when + 0.07)
  head.connect(headAmp)
  send(v, headAmp, 0.2)
  head.start(when)
  head.stop(when + 0.1)
}

/** A big low hit: the bass drum that ends the roll. */
export function bassDrum(v: Voices, when: number, velocity = 1) {
  const { ctx } = v
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(110, when)
  osc.frequency.exponentialRampToValueAtTime(48, when + 0.35)
  const amp = ctx.createGain()
  amp.gain.setValueAtTime(0.0001, when)
  amp.gain.exponentialRampToValueAtTime(velocity, when + 0.005)
  amp.gain.exponentialRampToValueAtTime(0.0001, when + 1.1)
  osc.connect(amp)
  send(v, amp, 0.45)
  osc.start(when)
  osc.stop(when + 1.2)
}

/** Crash cymbal: inharmonic square partials and bright noise, long decay. */
export function crash(v: Voices, when: number, velocity = 0.7) {
  const { ctx } = v
  const high = ctx.createBiquadFilter()
  high.type = 'highpass'
  high.frequency.value = 5200
  const amp = ctx.createGain()
  amp.gain.setValueAtTime(0.0001, when)
  amp.gain.exponentialRampToValueAtTime(velocity, when + 0.004)
  amp.gain.exponentialRampToValueAtTime(velocity * 0.3, when + 0.4)
  amp.gain.exponentialRampToValueAtTime(0.0001, when + 3)
  high.connect(amp)
  send(v, amp, 0.6)

  // The classic drum-machine cymbal: six detuned squares a metal can't tune.
  for (const ratio of [2, 3, 4.16, 5.43, 6.79, 8.21]) {
    const osc = ctx.createOscillator()
    osc.type = 'square'
    osc.frequency.value = 40 * ratio * 10
    const g = ctx.createGain()
    g.gain.value = 0.06
    osc.connect(g).connect(high)
    osc.start(when)
    osc.stop(when + 3)
  }
  const src = ctx.createBufferSource()
  src.buffer = v.noise
  const ng = ctx.createGain()
  ng.gain.value = 0.7
  src.connect(ng).connect(high)
  src.start(when, 0, 2)
}

/**
 * Schedules the strokes of a snare roll between two times. The roll swells
 * from a hush to full over `build` seconds after `rollStart`, then holds.
 */
export function rollStrokes(v: Voices, from: number, to: number, rollStart: number, build = 4.5) {
  const stroke = 0.042
  let t = rollStart + Math.ceil(Math.max(0, from - rollStart) / stroke) * stroke
  for (; t < to; t += stroke) {
    const progress = Math.min(1, (t - rollStart) / build)
    const swell = 0.08 + 0.5 * progress * progress
    // Hands are never perfectly even; neither is a good roll.
    const jitter = (Math.random() - 0.5) * 0.008
    const accent = 0.85 + Math.random() * 0.3
    snare(v, Math.max(from, t + jitter), swell * accent)
  }
}

// --- Brass ------------------------------------------------------------------

const midi = (note: number) => 440 * Math.pow(2, (note - 69) / 12)

/** One brass note: stacked detuned saws through a filter that blooms open. */
export function brass(v: Voices, note: number, when: number, length: number, level = 0.18) {
  const { ctx } = v
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = 1.2
  filter.frequency.setValueAtTime(350, when)
  filter.frequency.exponentialRampToValueAtTime(2600, when + 0.07)
  filter.frequency.exponentialRampToValueAtTime(1500, when + 0.3)
  const amp = ctx.createGain()
  const release = 0.22
  amp.gain.setValueAtTime(0.0001, when)
  amp.gain.exponentialRampToValueAtTime(level, when + 0.04)
  amp.gain.setTargetAtTime(level * 0.75, when + 0.06, 0.15)
  amp.gain.setValueAtTime(level * 0.75, when + length)
  amp.gain.exponentialRampToValueAtTime(0.0001, when + length + release)
  filter.connect(amp)
  send(v, amp, 0.55)

  // A slow vibrato that only arrives on held notes, as a player's would.
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 5.4
  const depth = ctx.createGain()
  depth.gain.setValueAtTime(0, when)
  depth.gain.linearRampToValueAtTime(length > 0.5 ? 6 : 0, when + Math.min(length, 0.5))
  lfo.connect(depth)
  lfo.start(when)
  lfo.stop(when + length + release)

  for (const detune of [-7, 0, 7]) {
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = midi(note)
    osc.detune.value = detune
    depth.connect(osc.detune)
    osc.connect(filter)
    osc.start(when)
    osc.stop(when + length + release + 0.05)
  }
}

function chord(v: Voices, notes: number[], when: number, length: number, level = 0.13) {
  notes.forEach((n) => brass(v, n, when, length, level))
}

// MIDI note numbers in C major: C4 = 60.
const C4 = 60
const E4 = 64
const G4 = 67
const C5 = 72
const G3 = 55
const E5 = 76

/** The winner: ta-ta-ta-TAAA. */
export function winnerFanfare(v: Voices, when: number) {
  ;[0, 0.14, 0.28].forEach((dt) => brass(v, G4, when + dt, 0.1, 0.2))
  chord(v, [C4, E4, G4, C5], when + 0.44, 1.9)
  bassDrum(v, when + 0.44, 0.8)
}

/** Curtain up, and curtain call: a longer call to attention. */
export function titleFanfare(v: Voices, when: number, grand = false) {
  const steps: [number, number, number][] = [
    [G3, 0, 0.2],
    [C4, 0.22, 0.2],
    [E4, 0.44, 0.2],
    [G4, 0.66, 0.42],
    [E4, 1.1, 0.16],
    [G4, 1.28, 0.16],
  ]
  steps.forEach(([n, dt, len]) => brass(v, n, when + dt, len, 0.2))
  const hold = when + 1.48
  chord(v, grand ? [C4, E4, G4, C5, E5] : [C4, E4, G4, C5], hold, grand ? 2.6 : 2)
  bassDrum(v, hold, 0.9)
  if (grand) crash(v, hold, 0.55)
}

// --- The live engine --------------------------------------------------------

const LOOKAHEAD = 0.2
const TICK_MS = 50

/**
 * Drives the voices in real time. The roll is scheduled a little ahead of the
 * clock on a timer, so it can run for as long as the host keeps everyone
 * waiting and still stop on the instant.
 */
export class ShowAudio {
  private ctx: AudioContext | null = null
  private voices: Voices | null = null
  private rollBus: GainNode | null = null
  private rollTimer: number | null = null
  private rollStart = 0
  private scheduledTo = 0
  muted = false

  /** Must run inside a click or key press: browsers only allow audio after one. */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      this.ctx = new Ctor()
      this.voices = createVoices(this.ctx)
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {})
  }

  private ready(): Voices | null {
    if (this.muted || !this.ctx || !this.voices) return null
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {})
    return this.voices
  }

  startRoll() {
    const v = this.ready()
    if (!v || this.rollTimer !== null) return
    const ctx = v.ctx as AudioContext
    // The roll gets its own bus so stopping it can cut every queued stroke at once.
    const bus = ctx.createGain()
    bus.connect(v.out)
    const rollVoices: Voices = { ...v, out: bus }
    this.rollBus = bus
    this.rollStart = ctx.currentTime + 0.05
    this.scheduledTo = this.rollStart
    const tick = () => {
      const until = ctx.currentTime + LOOKAHEAD
      if (until > this.scheduledTo) {
        rollStrokes(rollVoices, this.scheduledTo, until, this.rollStart)
        this.scheduledTo = until
      }
    }
    tick()
    this.rollTimer = window.setInterval(tick, TICK_MS)
  }

  stopRoll(fade = 0.05) {
    if (this.rollTimer !== null) window.clearInterval(this.rollTimer)
    this.rollTimer = null
    const bus = this.rollBus
    this.rollBus = null
    if (!bus || !this.ctx) return
    const now = this.ctx.currentTime
    bus.gain.setValueAtTime(bus.gain.value, now)
    bus.gain.linearRampToValueAtTime(0, now + fade)
    window.setTimeout(() => bus.disconnect(), (fade + LOOKAHEAD + 0.3) * 1000)
  }

  /** The envelope opens: the roll cuts, the drums hit, the brass answers. */
  reveal() {
    this.stopRoll(0.03)
    const v = this.ready()
    if (!v) return
    const now = v.ctx.currentTime + 0.02
    bassDrum(v, now, 1)
    snare(v, now, 0.7)
    crash(v, now, 0.7)
    winnerFanfare(v, now + 0.25)
  }

  title(grand = false) {
    const v = this.ready()
    if (v) titleFanfare(v, v.ctx.currentTime + 0.05, grand)
  }

  /** Backstage check: a short roll and a reveal, to set the TV volume by. */
  test() {
    this.unlock()
    this.startRoll()
    window.setTimeout(() => this.reveal(), 2600)
  }

  setMuted(muted: boolean) {
    this.muted = muted
    if (muted) this.stopRoll()
  }

  stopAll() {
    this.stopRoll()
  }
}
