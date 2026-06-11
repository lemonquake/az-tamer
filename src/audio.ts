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

// ---------------- sound effects ----------------
export type SfxName =
  | 'click' | 'confirm' | 'cancel' | 'open' | 'close'
  | 'blip' | 'toast' | 'toastBad' | 'fanfare' | 'achievement';

export function sfx(name: SfxName): void {
  switch (name) {
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
