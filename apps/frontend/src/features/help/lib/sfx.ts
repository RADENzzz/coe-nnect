/**
 * Tiny synth for the manga easter egg.
 * Everything is generated with Web Audio — no asset files.
 *
 * Usage:
 *   sfx.init();              // once, on first user gesture
 *   sfx.pop();               // stage 1 tap
 *   sfx.angry();             // stage 3+
 *   sfx.impact();            // stage 5+ (screen flash moment)
 *   sfx.rage();              // stage 7 (final)
 *   sfx.mute(true);          // respect reduced-motion / user pref
 */

let ctx: AudioContext | null = null;
let muted = false;

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  // Browsers suspend the context until a user gesture; resume on demand.
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Basic envelope helper — creates a gain node that fades out. */
function envGain(
  ac: AudioContext,
  peak: number,
  attack: number,
  decay: number,
): GainNode {
  const g = ac.createGain();
  const now = ac.currentTime;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(peak, now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
  return g;
}

/** Play a short tone with a waveform and pitch envelope. */
function tone({
  freq,
  freqEnd,
  duration,
  type = 'square',
  peak = 0.15,
  attack = 0.005,
}: {
  freq: number;
  freqEnd?: number;
  duration: number;
  type?: OscillatorType;
  peak?: number;
  attack?: number;
}) {
  const ac = ensureCtx();
  if (!ac || muted) return;
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime);
  if (freqEnd != null) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(1, freqEnd),
      ac.currentTime + duration,
    );
  }
  const g = envGain(ac, peak, attack, duration);
  osc.connect(g).connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + duration + attack + 0.02);
}

/** Filtered white-noise burst — for impacts, whooshes, hits. */
function noise({
  duration,
  filterFreq,
  filterEnd,
  peak = 0.25,
  type = 'lowpass',
}: {
  duration: number;
  filterFreq: number;
  filterEnd?: number;
  peak?: number;
  type?: BiquadFilterType;
}) {
  const ac = ensureCtx();
  if (!ac || muted) return;
  const frames = Math.floor(ac.sampleRate * duration);
  const buf = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

  const src = ac.createBufferSource();
  src.buffer = buf;

  const filter = ac.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(filterFreq, ac.currentTime);
  if (filterEnd != null) {
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(40, filterEnd),
      ac.currentTime + duration,
    );
  }

  const g = envGain(ac, peak, 0.002, duration);

  src.connect(filter).connect(g).connect(ac.destination);
  src.start();
  src.stop(ac.currentTime + duration + 0.02);
}

/* ─────────────── Public SFX ─────────────── */

export const sfx = {
  init() {
    ensureCtx();
  },

  mute(m: boolean) {
    muted = m;
  },

  /** Stage 1–2: soft UI tick + rising blip. */
  pop() {
    tone({ freq: 420, freqEnd: 620, duration: 0.08, type: 'triangle', peak: 0.12 });
    tone({ freq: 900, freqEnd: 1200, duration: 0.05, type: 'square', peak: 0.05 });
  },

  /** Stage 3–4: irritated two-note jab. */
  angry() {
    tone({ freq: 380, freqEnd: 300, duration: 0.09, type: 'sawtooth', peak: 0.14 });
    setTimeout(() => {
      tone({ freq: 320, freqEnd: 240, duration: 0.12, type: 'sawtooth', peak: 0.14 });
    }, 70);
  },

  /** Stage 5–6: manga impact — noise hit + descending thud. */
  impact() {
    noise({ duration: 0.18, filterFreq: 2200, filterEnd: 200, peak: 0.32 });
    tone({ freq: 180, freqEnd: 60, duration: 0.22, type: 'square', peak: 0.18 });
  },

  /** Stage 7: full rage — layered hit + rising scream-like tone. */
  rage() {
    noise({ duration: 0.28, filterFreq: 3000, filterEnd: 150, peak: 0.4 });
    tone({ freq: 240, freqEnd: 80, duration: 0.3, type: 'square', peak: 0.22 });
    tone({ freq: 700, freqEnd: 1400, duration: 0.35, type: 'sawtooth', peak: 0.09 });
    tone({ freq: 60, freqEnd: 40, duration: 0.5, type: 'sine', peak: 0.25 });
  },

  /** Idle reset — quiet "power down" so the card feels like it calmed. */
  calm() {
    tone({ freq: 600, freqEnd: 200, duration: 0.2, type: 'sine', peak: 0.06 });
  },

    /** Soft chime — used for celebratory tap effects. */
  chime() {
    tone({ freq: 660, freqEnd: 990, duration: 0.12, type: 'triangle', peak: 0.10 });
    setTimeout(() => {
      tone({ freq: 880, freqEnd: 1320, duration: 0.14, type: 'triangle', peak: 0.08 });
    }, 60);
  },

  /** Bright sparkle blip. */
  sparkle() {
    tone({ freq: 1200, freqEnd: 2200, duration: 0.08, type: 'sine', peak: 0.09 });
    tone({ freq: 1800, freqEnd: 2800, duration: 0.06, type: 'sine', peak: 0.06 });
  },

  /** Electric crackle. */
  zap() {
    noise({ duration: 0.09, filterFreq: 4000, filterEnd: 800, peak: 0.18, type: 'highpass' });
    tone({ freq: 300, freqEnd: 90, duration: 0.12, type: 'square', peak: 0.10 });
  },

  /** Cartoon pop — for bubbles / confetti. */
  bloop() {
    tone({ freq: 500, freqEnd: 900, duration: 0.09, type: 'sine', peak: 0.12 });
  },

  /** Soft pink/upward sweep — for petals / hearts. */
  petal() {
    tone({ freq: 480, freqEnd: 720, duration: 0.22, type: 'triangle', peak: 0.07 });
  },

  /** Twinkle cascade — for stars / snow. */
  twinkle() {
    tone({ freq: 900, freqEnd: 1400, duration: 0.07, type: 'sine', peak: 0.07 });
    setTimeout(() => tone({ freq: 1300, freqEnd: 1900, duration: 0.08, type: 'sine', peak: 0.06 }), 60);
    setTimeout(() => tone({ freq: 1700, freqEnd: 2400, duration: 0.07, type: 'sine', peak: 0.05 }), 120);
  },
};