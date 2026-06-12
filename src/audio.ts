// ============================================================
// AZ Tamer — procedural audio: synthesized UI sounds, jingles
// and a soft ambient music pad. No audio files — everything is
// generated with WebAudio oscillators. M toggles sound.
// ============================================================

const MUTE_KEY = 'az-tamer-muted';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let ambientGain: GainNode | null = null;
let ambientTimer: number | null = null;
let muted = localStorage.getItem(MUTE_KEY) === '1';

function ensureCtx(): AudioContext | null {
  if (ctx) return ctx;
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
  } catch { return null; }
  return ctx;
}

/** Call once — resumes the context on the first user gesture (browser autoplay policy). */
export function initAudio(): void {
  const kick = () => {
    const c = ensureCtx();
    if (c && c.state === 'suspended') c.resume();
    startAmbient();
    window.removeEventListener('pointerdown', kick);
    window.removeEventListener('keydown', kick);
  };
  window.addEventListener('pointerdown', kick);
  window.addEventListener('keydown', kick);
}

export const isMuted = (): boolean => muted;

export function toggleMute(): boolean {
  muted = !muted;
  localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.05);
  return muted;
}

// ---------------- synth helpers ----------------
function tone(freq: number, dur: number, opts: {
  type?: OscillatorType; vol?: number; when?: number; slideTo?: number; attack?: number;
} = {}): void {
  const c = ensureCtx();
  if (!c || !master || muted) return;
  const { type = 'sine', vol = 0.12, when = 0, slideTo, attack = 0.008 } = opts;
  const t0 = c.currentTime + when;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

// filtered white-noise burst — the percussion section of the battle orchestra
let noiseBuf: AudioBuffer | null = null;
function noiseBurst(dur: number, opts: {
  vol?: number; freq?: number; q?: number; type?: BiquadFilterType; when?: number; slideTo?: number;
} = {}): void {
  const c = ensureCtx();
  if (!c || !master || muted) return;
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const { vol = 0.1, freq = 800, q = 0.8, type = 'bandpass', when = 0, slideTo } = opts;
  const t0 = c.currentTime + when;
  const src = c.createBufferSource();
  src.buffer = noiseBuf; src.loop = true;
  const f = c.createBiquadFilter();
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(freq, t0);
  if (slideTo) f.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

// ---------------- sound effects ----------------
export type SfxName =
  | 'click' | 'confirm' | 'cancel' | 'open' | 'close'
  | 'blip' | 'toast' | 'toastBad' | 'fanfare' | 'achievement'
  // battle orchestra
  | 'whoosh' | 'hit' | 'crit' | 'boom' | 'zap' | 'splash'
  | 'leaf' | 'dark' | 'heal' | 'buff' | 'debuff' | 'charge' | 'ko' | 'guard';

export function sfx(name: SfxName): void {
  switch (name) {
    case 'whoosh':
      noiseBurst(0.2, { vol: 0.09, freq: 900, slideTo: 240, q: 0.6 });
      break;
    case 'hit':
      tone(170, 0.1, { type: 'sawtooth', vol: 0.09, slideTo: 80 });
      noiseBurst(0.07, { vol: 0.1, freq: 1400, type: 'highpass' });
      break;
    case 'crit':
      tone(160, 0.14, { type: 'sawtooth', vol: 0.12, slideTo: 60 });
      noiseBurst(0.1, { vol: 0.13, freq: 1800, type: 'highpass' });
      tone(1320, 0.16, { type: 'triangle', vol: 0.08, when: 0.03 });
      break;
    case 'boom':
      tone(72, 0.55, { type: 'sine', vol: 0.22, slideTo: 36 });
      noiseBurst(0.5, { vol: 0.16, freq: 420, type: 'lowpass', slideTo: 90 });
      break;
    case 'zap':
      tone(1900, 0.16, { type: 'sawtooth', vol: 0.07, slideTo: 180 });
      noiseBurst(0.12, { vol: 0.09, freq: 2600, type: 'highpass' });
      tone(90, 0.18, { type: 'square', vol: 0.05, slideTo: 50, when: 0.02 });
      break;
    case 'splash':
      noiseBurst(0.32, { vol: 0.1, freq: 700, slideTo: 1600, q: 0.5 });
      tone(320, 0.2, { type: 'sine', vol: 0.06, slideTo: 140 });
      break;
    case 'leaf':
      noiseBurst(0.12, { vol: 0.07, freq: 1500, q: 1.2 });
      noiseBurst(0.12, { vol: 0.06, freq: 1900, q: 1.2, when: 0.07 });
      break;
    case 'dark':
      tone(110, 0.4, { type: 'sine', vol: 0.14, slideTo: 48 });
      noiseBurst(0.35, { vol: 0.07, freq: 240, type: 'lowpass', slideTo: 70 });
      break;
    case 'heal':
      tone(660, 0.22, { type: 'sine', vol: 0.08 });
      tone(990, 0.3, { type: 'sine', vol: 0.07, when: 0.1 });
      break;
    case 'buff':
      [392, 523, 659].forEach((f, i) => tone(f, 0.12, { type: 'triangle', vol: 0.07, when: i * 0.06 }));
      break;
    case 'debuff':
      [523, 392, 311].forEach((f, i) => tone(f, 0.12, { type: 'triangle', vol: 0.06, when: i * 0.06 }));
      break;
    case 'charge':
      tone(220, 0.34, { type: 'sine', vol: 0.07, slideTo: 880 });
      noiseBurst(0.3, { vol: 0.03, freq: 600, slideTo: 2200, q: 2 });
      break;
    case 'ko':
      tone(300, 0.42, { type: 'sawtooth', vol: 0.08, slideTo: 55 });
      noiseBurst(0.3, { vol: 0.08, freq: 500, type: 'lowpass', slideTo: 100, when: 0.05 });
      break;
    case 'guard':
      tone(240, 0.14, { type: 'triangle', vol: 0.08, slideTo: 420 });
      noiseBurst(0.08, { vol: 0.05, freq: 900, q: 2 });
      break;
    case 'click':
      tone(620, 0.06, { type: 'triangle', vol: 0.07 });
      break;
    case 'confirm':
      tone(520, 0.08, { type: 'triangle', vol: 0.09 });
      tone(780, 0.1, { type: 'triangle', vol: 0.09, when: 0.07 });
      break;
    case 'cancel':
      tone(440, 0.09, { type: 'triangle', vol: 0.08, slideTo: 240 });
      break;
    case 'open':
      tone(360, 0.1, { type: 'sine', vol: 0.08, slideTo: 560 });
      break;
    case 'close':
      tone(560, 0.1, { type: 'sine', vol: 0.07, slideTo: 340 });
      break;
    case 'blip':
      tone(840, 0.035, { type: 'square', vol: 0.025 });
      break;
    case 'toast':
      tone(880, 0.09, { type: 'sine', vol: 0.07 });
      tone(1320, 0.12, { type: 'sine', vol: 0.06, when: 0.07 });
      break;
    case 'toastBad':
      tone(220, 0.16, { type: 'sawtooth', vol: 0.05, slideTo: 140 });
      break;
    case 'fanfare':
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.1, when: i * 0.11 }));
      tone(1319, 0.5, { type: 'triangle', vol: 0.09, when: 0.46 });
      break;
    case 'achievement':
      [659, 880, 1109, 1319].forEach((f, i) => tone(f, 0.18, { type: 'sine', vol: 0.09, when: i * 0.09 }));
      tone(1760, 0.45, { type: 'sine', vol: 0.06, when: 0.4 });
      break;
  }
}

// ---------------- ambient music pad ----------------
// A slow, quiet wash of chords from a pentatonic set; barely-there
// background warmth rather than a melody.
const CHORDS: number[][] = [
  [130.81, 196.0, 261.63, 392.0],   // C
  [110.0, 164.81, 261.63, 329.63],  // Am
  [87.31, 174.61, 261.63, 349.23],  // F
  [98.0, 196.0, 246.94, 392.0],     // G
];
let chordIdx = 0;

function playChord(): void {
  const c = ensureCtx();
  if (!c || !ambientGain || muted) return;
  const notes = CHORDS[chordIdx % CHORDS.length];
  chordIdx++;
  const t0 = c.currentTime + 0.05;
  const dur = 9;
  for (const f of notes) {
    for (const detune of [-3, 3]) {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      osc.detune.value = detune;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.016, t0 + 3);
      g.gain.setValueAtTime(0.016, t0 + dur - 3.5);
      g.gain.linearRampToValueAtTime(0, t0 + dur);
      osc.connect(g).connect(ambientGain);
      osc.start(t0);
      osc.stop(t0 + dur + 0.1);
    }
  }
}

export function startAmbient(): void {
  const c = ensureCtx();
  if (!c || !master || ambientTimer !== null) return;
  ambientGain = c.createGain();
  ambientGain.gain.value = 1;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  ambientGain.connect(lp).connect(master);
  playChord();
  ambientTimer = window.setInterval(playChord, 8000);
}
