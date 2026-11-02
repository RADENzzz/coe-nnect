// CactusRunner.tsx
import { useEffect, useRef, useState } from 'react';

const W = 720;
const H = 420;
const GROUND = H - 60;
const GRAVITY = 0.8;
const CACTUS_JUMP_V = -15;
const DINO_X = 170;
const DINO_W = 56;
const DINO_H = 68;
const BASE_SPEED = 5.5;
const MAX_SPEED = 13.5;
const BEST_KEY = 'cactus-runner-best';

type Status = 'ready' | 'running' | 'over';

interface CactusObs {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  vy: number;
  jumped: boolean;
  passed: boolean;
  hue: number;
  landT: number;
  flower: boolean;
  variant: 0 | 1 | 2;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
}

interface CactusRunnerProps {
  /** When false, the game is paused (no stepping, no input). */
  active?: boolean;
}

// ============================================================
//  Sound engine (Web Audio, no external files)
// ============================================================
const SOUND_MUTED_KEY = 'cactus-runner-muted';

let audioCtx: AudioContext | null = null;
let mutedCache: boolean | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (audioCtx && audioCtx.state === 'closed') audioCtx = null;
  if (!audioCtx) {
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function isMuted(): boolean {
  if (mutedCache !== null) return mutedCache;
  if (typeof window === 'undefined') return (mutedCache = false);
  try {
    mutedCache = window.localStorage.getItem(SOUND_MUTED_KEY) === '1';
  } catch {
    mutedCache = false;
  }
  return mutedCache;
}

function setMutedPref(m: boolean) {
  mutedCache = m;
  try {
    window.localStorage.setItem(SOUND_MUTED_KEY, m ? '1' : '0');
  } catch {
    /* ignore */
  }
}

interface Note {
  freq: number;
  dur: number;
  type?: OscillatorType;
  vol?: number;
  glideTo?: number;
}

function playNotes(notes: Note[]) {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  let t = ctx.currentTime + 0.005;
  for (const n of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = n.type ?? 'sine';
    osc.frequency.setValueAtTime(n.freq, t);
    if (n.glideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(1, n.glideTo),
        t + n.dur,
      );
    }
    const vol = n.vol ?? 0.08;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + n.dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + n.dur + 0.02);
    t += n.dur * 0.85;
  }
}

const SFX = {
  start() {
    playNotes([
      { freq: 523, dur: 0.08, type: 'sine', vol: 0.06 },
      { freq: 784, dur: 0.12, type: 'sine', vol: 0.06 },
    ]);
  },
  jump() {
    playNotes([
      { freq: 260, dur: 0.14, type: 'triangle', vol: 0.07, glideTo: 620 },
    ]);
  },
  point() {
    playNotes([{ freq: 1318, dur: 0.05, type: 'sine', vol: 0.03 }]);
  },
  milestone() {
    playNotes([
      { freq: 659, dur: 0.09, type: 'triangle', vol: 0.07 },
      { freq: 880, dur: 0.09, type: 'triangle', vol: 0.07 },
      { freq: 1175, dur: 0.18, type: 'triangle', vol: 0.08 },
    ]);
  },
  gameOver() {
    playNotes([
      { freq: 392, dur: 0.14, type: 'triangle', vol: 0.08 },
      { freq: 311, dur: 0.14, type: 'triangle', vol: 0.08 },
      { freq: 262, dur: 0.32, type: 'triangle', vol: 0.09, glideTo: 130 },
    ]);
  },
};

// ============================================================

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Day → dusk → night → dawn, then back. 0..1 loop. */
function dayNight(t: number) {
  const phase = t % 1;
  const seg = Math.floor(phase * 4);
  const f = (phase * 4) % 1;
  const lerp = (a: number, b: number) => a + (b - a) * f;
  const mix = (
    a: [number, number, number],
    b: [number, number, number],
  ): [number, number, number] => [
    lerp(a[0], b[0]),
    lerp(a[1], b[1]),
    lerp(a[2], b[2]),
  ];

  const DAY_TOP: [number, number, number] = [245, 243, 255];
  const DAY_BOT: [number, number, number] = [238, 242, 247];
  const DUSK_TOP: [number, number, number] = [255, 205, 210];
  const DUSK_BOT: [number, number, number] = [252, 211, 77];
  const NIGHT_TOP: [number, number, number] = [15, 23, 42];
  const NIGHT_BOT: [number, number, number] = [30, 41, 59];
  const DAWN_TOP: [number, number, number] = [253, 230, 200];
  const DAWN_BOT: [number, number, number] = [252, 165, 165];

  let top: [number, number, number];
  let bot: [number, number, number];
  let starAlpha = 0;
  let sunAlpha = 0;
  let moonAlpha = 0;
  let hill: [number, number, number];

  switch (seg) {
    case 0:
      top = mix(DAY_TOP, DUSK_TOP);
      bot = mix(DAY_BOT, DUSK_BOT);
      sunAlpha = 1 - f * 0.6;
      hill = mix([226, 232, 240], [253, 186, 116]);
      break;
    case 1:
      top = mix(DUSK_TOP, NIGHT_TOP);
      bot = mix(DUSK_BOT, NIGHT_BOT);
      sunAlpha = 0.4 * (1 - f);
      moonAlpha = f;
      starAlpha = f * 0.9;
      hill = mix([253, 186, 116], [30, 41, 59]);
      break;
    case 2:
      top = mix(NIGHT_TOP, DAWN_TOP);
      bot = mix(NIGHT_BOT, DAWN_BOT);
      moonAlpha = 1 - f;
      sunAlpha = f * 0.7;
      starAlpha = (1 - f) * 0.9;
      hill = mix([30, 41, 59], [251, 191, 171]);
      break;
    default:
      top = mix(DAWN_TOP, DAY_TOP);
      bot = mix(DAWN_BOT, DAY_BOT);
      sunAlpha = 0.7 + f * 0.3;
      hill = mix([251, 191, 171], [226, 232, 240]);
      break;
  }

  return {
    top: `rgb(${top[0] | 0}, ${top[1] | 0}, ${top[2] | 0})`,
    bot: `rgb(${bot[0] | 0}, ${bot[1] | 0}, ${bot[2] | 0})`,
    hill: `rgb(${hill[0] | 0}, ${hill[1] | 0}, ${hill[2] | 0})`,
    starAlpha,
    sunAlpha,
    moonAlpha,
    phase,
  };
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      {muted ? (
        <>
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </>
      ) : (
        <>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </>
      )}
    </svg>
  );
}

export default function CactusRunner({ active = false }: CactusRunnerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<Status>('ready');
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => {
    if (typeof window === 'undefined') return 0;
    return Number(window.localStorage.getItem(BEST_KEY) || 0);
  });
  const [shake, setShake] = useState(0);
  const [muted, setMuted] = useState<boolean>(() => isMuted());

  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    if (!active) setStatus('ready');
  }, [active]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setMutedPref(next);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // ---------- viewport ----------
    const viewport = {
      dpr: 1,
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      cssW: 0,
      cssH: 0,
    };

    function resize() {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cssW = Math.max(1, rect.width);
      const cssH = Math.max(1, rect.height);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      const scale = Math.min(cssW / W, cssH / H);
      viewport.dpr = dpr;
      viewport.scale = scale;
      viewport.cssW = cssW;
      viewport.cssH = cssH;
      viewport.offsetX = (cssW - W * scale) / 2;
      viewport.offsetY = (cssH - H * scale) / 2;
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // ---------- game state ----------
    const s = {
      status: 'ready' as Status,
      speed: BASE_SPEED,
      score: 0,
      cacti: [] as CactusObs[],
      particles: [] as Particle[],
      shake: 0,
      flash: 0,
      spawnTimer: 80,
      dinoPhase: 0,
      scroll: 0,
      dayNight: 0.1,
      streak: 0,
      nextId: 1,
      blink: 0,
      blinkTimer: 3,
      deathT: 0,
      milestone: 0,
      grace: 0,
    };

    let raf = 0;
    let last = performance.now();
    let lastScore = -1;
    let lastStatus: Status | null = null;
    let bestLocal = Number(window.localStorage.getItem(BEST_KEY) || 0);
    let lastShake = 0;
    let wasActive = activeRef.current;

    // ---------- helpers ----------
    function findTarget(): CactusObs | null {
      let bestC: CactusObs | null = null;
      for (const c of s.cacti) {
        if (c.jumped) continue;
        if (c.x + c.w < DINO_X) continue;
        if (!bestC || c.x < bestC.x) bestC = c;
      }
      return bestC;
    }

    function overlapsDino(c: CactusObs) {
      const dl = DINO_X + 12;
      const dr = DINO_X + DINO_W - 12;
      const dtop = GROUND - DINO_H + 12;
      const dbot = GROUND;
      const cl = c.x + 6;
      const cr = c.x + c.w - 6;
      const cbot = c.y + c.h;
      return cl < dr && cr > dl && cbot > dtop && c.y < dbot;
    }

    function dustBurst(x: number, y: number, count: number, palette: string[]) {
      for (let i = 0; i < count; i++) {
        s.particles.push({
          x: x + (Math.random() - 0.5) * 14,
          y,
          vx: (Math.random() - 0.5) * 3,
          vy: -Math.random() * 2.2,
          life: 16 + Math.random() * 12,
          maxLife: 28,
          size: 1.5 + Math.random() * 2,
          color: palette[(Math.random() * palette.length) | 0],
          gravity: 0.05,
        });
      }
    }

    function sparkBurst(x: number, y: number, count: number, colors: string[]) {
      for (let i = 0; i < count; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
        const sp = 2 + Math.random() * 3.5;
        s.particles.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 26 + Math.random() * 18,
          maxLife: 44,
          size: 1.6 + Math.random() * 2.4,
          color: colors[(Math.random() * colors.length) | 0],
          gravity: 0.06,
        });
      }
    }

    function spawnCactus(xPos: number) {
      const r = Math.random();
      const variant: 0 | 1 | 2 = r < 0.4 ? 0 : r < 0.75 ? 1 : 2;
      const w = variant === 0 ? 30 : variant === 1 ? 38 : 46;
      const h = variant === 0 ? 44 : variant === 1 ? 56 : 68;
      s.cacti.push({
        id: s.nextId++,
        x: xPos,
        y: GROUND - h,
        w,
        h,
        vy: 0,
        jumped: false,
        passed: false,
        hue: 128 + Math.random() * 22,
        landT: 0,
        flower: Math.random() < 0.22,
        variant,
      });
    }

    function spawnWave() {
      const cluster = Math.random() < 0.35;
      const count = cluster ? (2 + (Math.random() < 0.4 ? 1 : 0)) : 1;
      let x = W + 60;
      for (let i = 0; i < count; i++) {
        spawnCactus(x);
        const c = s.cacti[s.cacti.length - 1];
        x += c.w + 50 + Math.random() * 40;
      }
      const gap = cluster ? 480 + Math.random() * 260 : 360 + Math.random() * 320;
      s.spawnTimer = gap / s.speed;
    }

    function triggerJump(c: CactusObs) {
      c.jumped = true;
      c.vy = CACTUS_JUMP_V;
      SFX.jump();
      dustBurst(
        c.x + c.w / 2,
        GROUND - 2,
        8,
        ['#86efac', '#4ade80', 'rgba(148,163,184,0.8)'],
      );
    }

    function tap() {
      if (s.status === 'ready') {
        s.status = 'running';
        s.spawnTimer = 80;
        SFX.start();
        return;
      }
      if (s.status === 'over') {
        s.status = 'running';
        s.speed = BASE_SPEED;
        s.score = 0;
        s.cacti = [];
        s.particles = [];
        s.spawnTimer = 80;
        s.shake = 0;
        s.flash = 0;
        s.streak = 0;
        s.deathT = 0;
        s.milestone = 0;
        s.grace = 0;
        SFX.start();
        return;
      }
      const t = findTarget();
      if (t) triggerJump(t);
    }

    function gameOver() {
      s.status = 'over';
      s.shake = 16;
      s.flash = 0.35;
      s.streak = 0;
      s.deathT = 0;
      SFX.gameOver();
      const cx = DINO_X + DINO_W / 2;
      const cy = GROUND - DINO_H / 2;
      const colors = [
        '#f43f5e', '#fb7185', '#a78bfa', '#86efac', '#fbbf24', '#22d3ee',
      ];
      for (let i = 0; i < 42; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 1 + Math.random() * 7;
        s.particles.push({
          x: cx,
          y: cy,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 2,
          life: 34 + Math.random() * 46,
          maxLife: 80,
          size: 2 + Math.random() * 4,
          color: colors[(Math.random() * colors.length) | 0],
          gravity: 0.18,
        });
      }
      const final = Math.floor(s.score);
      if (final > bestLocal) {
        bestLocal = final;
        setBest(final);
        try {
          window.localStorage.setItem(BEST_KEY, String(final));
        } catch {
          /* ignore */
        }
      }
    }

    // ---------- step ----------
    function step(dt: number) {
      s.dayNight += dt * (1 / (40 * 60));
      if (s.dayNight > 1) s.dayNight -= 1;

      if (s.grace > 0) s.grace = Math.max(0, s.grace - dt);

      const running = s.status === 'running';

      s.scroll += s.speed * dt * (running ? 1 : 0.3);

      if (running) s.dinoPhase += dt * s.speed * 0.3;
      else if (s.status === 'ready') s.dinoPhase += dt * 3;

      s.blinkTimer -= dt / 60;
      if (s.blinkTimer <= 0) {
        s.blink = 1;
        s.blinkTimer = 2 + Math.random() * 3;
      }
      if (s.blink > 0) s.blink = Math.max(0, s.blink - dt / 8);

      if (s.status === 'over') s.deathT += dt;

      if (running) {
        s.speed = Math.min(MAX_SPEED, BASE_SPEED + s.score * 0.015);
        s.streak = Math.max(
          0,
          (s.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED),
        );

        s.spawnTimer -= dt;
        if (s.spawnTimer <= 0) spawnWave();

        for (const c of s.cacti) {
          c.x -= s.speed * dt;
          if (c.landT > 0) c.landT = Math.max(0, c.landT - dt);
          if (c.jumped) {
            const groundY = GROUND - c.h;
            c.vy += GRAVITY * dt;
            c.y += c.vy * dt;
            if (c.y >= groundY) {
              c.y = groundY;
              if (c.vy > 1) {
                c.landT = 8;
                dustBurst(
                  c.x + c.w / 2,
                  GROUND - 2,
                  6,
                  ['rgba(148,163,184,0.7)', '#86efac'],
                );
              }
              c.vy = 0;
            }
          }
        }

        if (s.grace <= 0) {
          for (const c of s.cacti) {
            if (c.passed) continue;
            if (overlapsDino(c)) {
              gameOver();
              break;
            }
          }
        }

        for (const c of s.cacti) {
          if (!c.passed && c.x + c.w < DINO_X - 20) {
            c.passed = true;
            s.score += 1;
            SFX.point();
            s.shake = Math.max(s.shake, 2);
            sparkBurst(
              DINO_X + DINO_W * 0.55,
              GROUND - DINO_H * 0.8,
              14,
              ['#fbbf24', '#22d3ee', '#a78bfa', '#86efac'],
            );
            const sc = Math.floor(s.score);
            if (sc > 0 && sc % 10 === 0 && sc !== s.milestone) {
                            s.milestone = sc;
              SFX.milestone();
              for (let i = 0; i < 30; i++) {
                const a = Math.random() * Math.PI * 2;
                const sp = 2 + Math.random() * 5;
                s.particles.push({
                  x: DINO_X + DINO_W / 2,
                  y: GROUND - DINO_H / 2,
                  vx: Math.cos(a) * sp,
                  vy: Math.sin(a) * sp,
                  life: 40 + Math.random() * 30,
                  maxLife: 70,
                  size: 2 + Math.random() * 3,
                  color: ['#fbbf24', '#fde047', '#f59e0b'][
                    (Math.random() * 3) | 0
                  ],
                  gravity: 0.08,
                });
              }
            }
          }
        }

        s.cacti = s.cacti.filter((c) => c.x + c.w > -80);
      } else {
        for (const c of s.cacti) c.x -= s.speed * 0.1 * dt;
        s.cacti = s.cacti.filter((c) => c.x + c.w > -80);
      }

      for (const p of s.particles) {
        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
      }
      s.particles = s.particles.filter((p) => p.life > 0);

      s.shake *= Math.pow(0.88, dt);
      if (s.shake < 0.15) s.shake = 0;
      s.flash *= Math.pow(0.9, dt);
      if (s.flash < 0.01) s.flash = 0;
    }

    // ---------- drawing ----------
    function drawCloud(
      cx: number,
      cy: number,
      r: number,
      alpha: number,
      color: string,
    ) {
      ctx!.fillStyle = color;
      ctx!.globalAlpha = alpha;
      ctx!.beginPath();
      ctx!.arc(cx, cy, r, 0, Math.PI * 2);
      ctx!.arc(cx + r * 0.9, cy - r * 0.25, r * 0.8, 0, Math.PI * 2);
      ctx!.arc(cx + r * 1.75, cy, r * 0.7, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.globalAlpha = 1;
    }

    function drawStars(dn: ReturnType<typeof dayNight>) {
      if (dn.starAlpha <= 0) return;
      ctx!.fillStyle = '#fef9c3';
      ctx!.globalAlpha = dn.starAlpha;
      for (let i = 0; i < 40; i++) {
        const x = ((i * 137.3) % W) + ((s.scroll * 0.05) % W);
        const y = (i * 53.7) % (GROUND - 60);
        const tw = 1 + Math.sin(s.scroll * 0.05 + i) * 0.5;
        ctx!.beginPath();
        ctx!.arc(x % W, y, tw, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;
    }

    function drawSunMoon(dn: ReturnType<typeof dayNight>) {
      const cx = W * 0.75;
      const arc = Math.sin(dn.phase * Math.PI * 2) * 30;
      const cy = 80 + arc;

      if (dn.sunAlpha > 0.01) {
        ctx!.globalAlpha = dn.sunAlpha;
        ctx!.fillStyle = '#fbbf24';
        ctx!.shadowColor = '#fbbf24';
        ctx!.shadowBlur = 40;
        ctx!.beginPath();
        ctx!.arc(cx, cy, 28, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.shadowBlur = 0;
        ctx!.globalAlpha = 1;
      }
      if (dn.moonAlpha > 0.01) {
        ctx!.globalAlpha = dn.moonAlpha;
        ctx!.fillStyle = '#e2e8f0';
        ctx!.shadowColor = '#e2e8f0';
        ctx!.shadowBlur = 30;
        ctx!.beginPath();
        ctx!.arc(cx, cy, 24, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.shadowBlur = 0;
        ctx!.fillStyle = `rgb(15, 23, 42)`;
        ctx!.globalCompositeOperation = 'destination-out';
        ctx!.beginPath();
        ctx!.arc(cx + 8, cy - 4, 22, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.globalCompositeOperation = 'source-over';
        ctx!.globalAlpha = 1;
      }
    }

    function drawCactus(c: CactusObs, isTarget: boolean, urgency: number) {
      const { x, y, w, h, hue } = c;
      const green = `hsl(${hue}, 65%, 46%)`;
      const dark = `hsl(${hue}, 65%, 36%)`;
      const darker = `hsl(${hue}, 65%, 27%)`;
      const light = `hsl(${hue}, 72%, 72%)`;

      const air = Math.max(0, (GROUND - (y + h)) / 180);
      const shScale = Math.max(0.25, 1 - air);
      ctx!.fillStyle = `rgba(15, 23, 42, ${0.14 * shScale})`;
      ctx!.beginPath();
      ctx!.ellipse(
        x + w / 2,
        GROUND + 1,
        w * 0.55 * shScale,
        4 * shScale,
        0,
        0,
        Math.PI * 2,
      );
      ctx!.fill();

      if (isTarget) {
        const pulse = 0.55 + Math.sin(s.scroll * 0.15) * 0.35;
        let stroke: string;
        if (urgency > 0.7) stroke = `rgba(244, 63, 94, ${0.6 + pulse * 0.4})`;
        else if (urgency > 0.3) stroke = `rgba(251, 191, 36, ${0.55 + pulse * 0.45})`;
        else stroke = `rgba(148, 163, 184, ${0.4 + pulse * 0.25})`;

        ctx!.save();
        ctx!.strokeStyle = stroke;
        ctx!.lineWidth = 2;
        ctx!.setLineDash([5, 5]);
        roundRect(ctx!, x - 6, y - 6, w + 12, h + 12, 10);
        ctx!.stroke();
        ctx!.restore();

        const bob = Math.sin(s.scroll * 0.15) * 3;
        ctx!.fillStyle = stroke;
        ctx!.beginPath();
        ctx!.moveTo(x + w / 2 - 6, y - 20 + bob);
        ctx!.lineTo(x + w / 2 + 6, y - 20 + bob);
        ctx!.lineTo(x + w / 2, y - 12 + bob);
        ctx!.closePath();
        ctx!.fill();
      }

      let sx = 1;
      let sy = 1;
      if (c.landT > 0) {
        const k = c.landT / 8;
        sx = 1 + 0.18 * k;
        sy = 1 - 0.18 * k;
      }
      ctx!.save();
      ctx!.translate(x + w / 2, y + h);
      ctx!.scale(sx, sy);
      ctx!.translate(-(x + w / 2), -(y + h));

      const bodyW = w * 0.44;
      const bodyX = x + (w - bodyW) / 2;
      const legH = 6;
      const bodyH = h - legH;

      ctx!.fillStyle = dark;
      const armY = y + h * 0.44;
      const armW = w * 0.28;
      roundRect(ctx!, bodyX - armW, armY, armW, 6, 3);
      ctx!.fill();
      roundRect(ctx!, bodyX - armW, armY - h * 0.14, 6, h * 0.14 + 6, 3);
      ctx!.fill();
      roundRect(ctx!, bodyX + bodyW, armY - 5, armW, 6, 3);
      ctx!.fill();
      roundRect(
        ctx!,
        bodyX + bodyW + armW - 6,
        armY - 5 - h * 0.12,
        6,
        h * 0.12 + 6,
        3,
      );
      ctx!.fill();

      ctx!.fillStyle = green;
      roundRect(ctx!, bodyX, y, bodyW, bodyH, bodyW / 2);
      ctx!.fill();

      ctx!.fillStyle = light;
      ctx!.globalAlpha = 0.5;
      roundRect(ctx!, bodyX + bodyW * 0.22, y + 6, 3, bodyH - 14, 1.5);
      ctx!.fill();
      ctx!.globalAlpha = 1;

      if (c.flower) {
        const fx = x + w / 2;
        const fy = y - 3;
        ctx!.fillStyle = '#f472b6';
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
          ctx!.beginPath();
          ctx!.arc(fx + Math.cos(a) * 3.5, fy + Math.sin(a) * 3.5, 2.4, 0, Math.PI * 2);
          ctx!.fill();
        }
        ctx!.fillStyle = '#fde047';
        ctx!.beginPath();
        ctx!.arc(fx, fy, 2.2, 0, Math.PI * 2);
        ctx!.fill();
      }

      ctx!.fillStyle = '#fff';
      ctx!.beginPath();
      ctx!.arc(bodyX + bodyW * 0.32, y + h * 0.2, 3.5, 0, Math.PI * 2);
      ctx!.arc(bodyX + bodyW * 0.68, y + h * 0.2, 3.5, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.fillStyle = '#0f172a';
      const airborne = c.y < GROUND - c.h - 1;
      const shift = airborne ? 0.6 : 0;
      ctx!.beginPath();
      ctx!.arc(bodyX + bodyW * 0.32 + shift, y + h * 0.2, 1.8, 0, Math.PI * 2);
      ctx!.arc(bodyX + bodyW * 0.68 + shift, y + h * 0.2, 1.8, 0, Math.PI * 2);
      ctx!.fill();

      if (airborne) {
        ctx!.fillStyle = '#0f172a';
        ctx!.beginPath();
        ctx!.arc(bodyX + bodyW * 0.5, y + h * 0.3, 2.8, 0, Math.PI * 2);
        ctx!.fill();
      } else {
        ctx!.strokeStyle = darker;
        ctx!.lineWidth = 1.5;
        ctx!.beginPath();
        ctx!.arc(
          bodyX + bodyW * 0.5,
          y + h * 0.27,
          3,
          0.15 * Math.PI,
          0.85 * Math.PI,
        );
        ctx!.stroke();
      }

      const swing = airborne ? 0 : Math.sin(s.dinoPhase) * 3;
      ctx!.fillStyle = darker;
      roundRect(ctx!, bodyX + bodyW * 0.15 + swing, y + bodyH, 6, legH, 2);
      ctx!.fill();
      roundRect(ctx!, bodyX + bodyW * 0.6 - swing, y + bodyH, 6, legH, 2);
      ctx!.fill();

      ctx!.restore();
    }

    function drawDino() {
      const x = DINO_X;
      const y = GROUND - DINO_H;
      const w = DINO_W;
      const h = DINO_H;

      const c1 = '#8b5cf6';
      const c2 = '#7c3aed';
      const c3 = '#6d28d9';

      ctx!.fillStyle = 'rgba(15, 23, 42, 0.18)';
      ctx!.beginPath();
      ctx!.ellipse(x + w / 2, GROUND + 1, w * 0.55, 5, 0, 0, Math.PI * 2);
      ctx!.fill();

      ctx!.fillStyle = c2;
      ctx!.beginPath();
      ctx!.moveTo(x + w * 0.15, y + h * 0.42);
      ctx!.quadraticCurveTo(x - w * 0.2, y + h * 0.15, x - w * 0.2, y + h * 0.5);
      ctx!.quadraticCurveTo(x - w * 0.05, y + h * 0.55, x + w * 0.1, y + h * 0.65);
      ctx!.closePath();
      ctx!.fill();

      const running = s.status === 'running' || s.status === 'ready';
      const swing = running ? Math.sin(s.dinoPhase) * 4 : 0;
      ctx!.fillStyle = c3;
      roundRect(ctx!, x + w * 0.28 + swing, y + h * 0.68, 6, h * 0.32, 2);
      ctx!.fill();
      roundRect(ctx!, x + w * 0.55 - swing, y + h * 0.68, 6, h * 0.32, 2);
      ctx!.fill();

      ctx!.fillStyle = c1;
      roundRect(ctx!, x + w * 0.16, y + h * 0.28, w * 0.62, h * 0.48, 6);
      ctx!.fill();

      ctx!.fillStyle = c1;
      roundRect(ctx!, x + w * 0.5, y + h * 0.05, w * 0.5, h * 0.38, 5);
      ctx!.fill();

      ctx!.fillStyle = c2;
      roundRect(ctx!, x + w * 0.53, y + h * 0.3, w * 0.42, h * 0.1, 3);
      ctx!.fill();

      const nearest = findTarget();
      const near = nearest ? 1 - Math.min(1, nearest.x / W) : 0;
      const blinking = s.blink > 0.5;

      if (blinking) {
        ctx!.strokeStyle = '#0f172a';
        ctx!.lineWidth = 2;
        ctx!.beginPath();
        ctx!.moveTo(x + w * 0.8, y + h * 0.17);
        ctx!.lineTo(x + w * 0.87, y + h * 0.17);
        ctx!.stroke();
      } else {
        ctx!.fillStyle = '#fff';
        ctx!.beginPath();
        ctx!.arc(x + w * 0.83, y + h * 0.17, 3.5, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.fillStyle = '#0f172a';
        ctx!.beginPath();
        ctx!.arc(x + w * 0.85 + near * 1.2, y + h * 0.17, 1.8, 0, Math.PI * 2);
        ctx!.fill();
      }

      ctx!.fillStyle = c3;
      roundRect(ctx!, x + w * 0.65, y + h * 0.5, 4, h * 0.14, 2);
      ctx!.fill();
    }

    function drawUrgencyCue() {
      if (s.status !== 'running') return;
      const t = findTarget();
      if (!t) return;
      const dist = t.x + t.w - 6 - (DINO_X + 12);
      if (dist < 0) return;
      const frames = dist / s.speed;
      if (frames > 14) return;
      const urgency = 1 - Math.min(1, frames / 14);
      const pulse = 0.5 + Math.sin(performance.now() / 100) * 0.5;

      ctx!.save();
      ctx!.globalAlpha = 0.45 + urgency * 0.55 * pulse;
      ctx!.fillStyle = urgency > 0.7 ? '#f43f5e' : '#fbbf24';
      ctx!.font = `800 ${16 + urgency * 6}px ui-sans-serif, system-ui, sans-serif`;
      ctx!.textAlign = 'center';
      ctx!.textBaseline = 'middle';
      ctx!.fillText('TAP!', DINO_X + DINO_W / 2, GROUND - DINO_H - 28);
      ctx!.restore();
    }

    function drawOverlays() {
      ctx!.textAlign = 'center';
      ctx!.textBaseline = 'middle';

      if (s.status === 'ready') {
        ctx!.fillStyle = 'rgba(15, 23, 42, 0.42)';
        ctx!.fillRect(0, 0, W, H);

        ctx!.font = '800 44px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
        ctx!.fillStyle = '#fff';
        ctx!.shadowColor = 'rgba(0,0,0,0.4)';
        ctx!.shadowBlur = 12;
        ctx!.fillText('🌵 Cactus Run', W / 2, H * 0.35);
        ctx!.shadowBlur = 0;

        const pulse = 0.7 + Math.sin(performance.now() / 350) * 0.3;
        ctx!.globalAlpha = pulse;
        ctx!.font = '700 22px ui-sans-serif, system-ui, sans-serif';
        ctx!.fillStyle = '#fde68a';
        ctx!.fillText('Tap anywhere to start', W / 2, H * 0.52);
        ctx!.globalAlpha = 1;

        ctx!.font = '500 15px ui-sans-serif, system-ui, sans-serif';
        ctx!.fillStyle = 'rgba(255,255,255,0.75)';
        ctx!.fillText('Tap / Space when a cactus is close', W / 2, H * 0.64);
        ctx!.fillText('to make it leap over the dino', W / 2, H * 0.64 + 20);
        return;
      }

      if (s.status === 'over') {
        const fade = Math.min(1, s.deathT / 24);
        ctx!.fillStyle = `rgba(15, 23, 42, ${0.58 * fade})`;
        ctx!.fillRect(0, 0, W, H);

        ctx!.globalAlpha = fade;

        ctx!.font = '800 52px ui-sans-serif, system-ui, sans-serif';
        ctx!.fillStyle = '#fb7185';
        ctx!.shadowColor = 'rgba(251, 113, 133, 0.55)';
        ctx!.shadowBlur = 22;
        ctx!.fillText('GAME OVER', W / 2, H * 0.36);
        ctx!.shadowBlur = 0;

        const sc = Math.floor(s.score);
        ctx!.font = '700 28px ui-sans-serif, system-ui, sans-serif';
        ctx!.fillStyle = '#fff';
        ctx!.fillText(`Score: ${sc}`, W / 2, H * 0.5);

        if (sc >= bestLocal && sc > 0) {
          ctx!.font = '700 18px ui-sans-serif, system-ui, sans-serif';
          ctx!.fillStyle = '#fbbf24';
          ctx!.fillText('🏆 New best!', W / 2, H * 0.5 + 32);
        }

        const pulse = 0.7 + Math.sin(performance.now() / 350) * 0.3;
        ctx!.globalAlpha = fade * pulse;
        ctx!.font = '700 18px ui-sans-serif, system-ui, sans-serif';
        ctx!.fillStyle = '#fde68a';
        ctx!.fillText('Tap / Space to retry', W / 2, H * 0.72);

        ctx!.globalAlpha = 1;
        return;
      }
    }

    function draw() {
      const dn = dayNight(s.dayNight);
      const { dpr, scale, offsetX, offsetY, cssW, cssH } = viewport;

      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const screenGrad = ctx!.createLinearGradient(
        0,
        offsetY,
        0,
        offsetY + H * scale,
      );
      screenGrad.addColorStop(0, dn.top);
      screenGrad.addColorStop(1, dn.bot);
      ctx!.fillStyle = screenGrad;
      ctx!.fillRect(0, 0, cssW, cssH);

      ctx!.setTransform(
        dpr * scale,
        0,
        0,
        dpr * scale,
        dpr * offsetX,
        dpr * offsetY,
      );

      ctx!.save();
      if (s.shake > 0.1) {
        ctx!.translate(
          (Math.random() - 0.5) * s.shake,
          (Math.random() - 0.5) * s.shake,
        );
      }

      drawStars(dn);
      drawSunMoon(dn);

      const cloudAlpha = 0.35 + dn.starAlpha * -0.15 + (dn.moonAlpha ? 0.1 : 0);
      const cloudColor =
        dn.starAlpha > 0.4
          ? 'rgba(148, 163, 184, 0.4)'
          : 'rgba(196, 181, 253, 0.45)';
      const off = (s.scroll * 0.2) % (W + 300);
      const clouds = [
        { x: 80, y: 70, r: 22 },
        { x: 320, y: 100, r: 30 },
        { x: 560, y: 55, r: 20 },
        { x: 820, y: 90, r: 26 },
      ];
      for (const c of clouds) {
        let cx = c.x - off;
        if (cx < -120) cx += W + 300;
        drawCloud(cx, c.y, c.r, Math.max(0.15, cloudAlpha), cloudColor);
      }

      ctx!.fillStyle = dn.hill;
      ctx!.globalAlpha = 0.75;
      ctx!.beginPath();
      ctx!.moveTo(0, GROUND);
      const hOff = s.scroll * 0.3;
      for (let x = 0; x <= W; x += 20) {
        const y =
          GROUND -
          50 -
          Math.sin((x + hOff) * 0.01) * 24 -
          Math.sin((x + hOff) * 0.023) * 12;
        ctx!.lineTo(x, y);
      }
      ctx!.lineTo(W, GROUND);
      ctx!.closePath();
      ctx!.fill();
      ctx!.globalAlpha = 1;

      ctx!.strokeStyle = 'rgba(148, 163, 184, 0.5)';
      ctx!.lineWidth = 2;
      ctx!.beginPath();
      ctx!.moveTo(0, GROUND);
      ctx!.lineTo(W, GROUND);
      ctx!.stroke();

      ctx!.strokeStyle = 'rgba(148, 163, 184, 0.3)';
      ctx!.lineWidth = 2;
      ctx!.beginPath();
      const dashOff = s.scroll % 40;
      for (let x = -dashOff; x < W; x += 40) {
        ctx!.moveTo(x, GROUND + 8);
        ctx!.lineTo(x + 20, GROUND + 8);
      }
      ctx!.stroke();

      ctx!.fillStyle = 'rgba(148, 163, 184, 0.35)';
      for (let i = 0; i < 14; i++) {
        const x = ((i * 97 - s.scroll * 1.2) % (W + 100)) - 50;
        const y = GROUND + 18 + (i % 3) * 7;
        ctx!.fillRect(x, y, 3 + (i % 2) * 2, 1.2);
      }

      const target = s.status === 'running' ? findTarget() : null;
      let urgency = 0;
      if (target) {
        const dist = target.x + target.w - 6 - (DINO_X + 12);
        if (dist > 0) {
          const frames = dist / s.speed;
          urgency = 1 - Math.min(1, frames / 20);
        }
      }
      for (const c of s.cacti) {
        drawCactus(c, target !== null && c.id === target.id, urgency);
      }

      drawDino();
      drawUrgencyCue();

      for (const p of s.particles) {
        const a = Math.max(0, p.life / p.maxLife);
        ctx!.globalAlpha = a;
        ctx!.fillStyle = p.color;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.size * (0.4 + a * 0.6), 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;

      if (s.status === 'running' && s.streak > 0.05) {
        ctx!.strokeStyle = `rgba(255, 255, 255, ${0.15 + s.streak * 0.25})`;
        ctx!.lineWidth = 1;
        for (let i = 0; i < 8; i++) {
          const y = 40 + ((i * 47 + s.scroll * 6) % (GROUND - 60));
          const x = W - ((i * 137 + s.scroll * 4) % W);
          const len = 30 + s.streak * 90;
          ctx!.beginPath();
          ctx!.moveTo(x, y);
          ctx!.lineTo(x - len, y);
          ctx!.stroke();
        }
      }

      drawOverlays();

      ctx!.restore();

      if (s.flash > 0.01) {
        ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx!.fillStyle = `rgba(255,255,255,${s.flash})`;
        ctx!.fillRect(0, 0, cssW, cssH);
      }
    }

    // ---------- loop ----------
    function loop(now: number) {
      const dt = Math.min(3, (now - last) / (1000 / 60));
      last = now;

      // Detect pause → resume transitions. While paused, `step` is skipped
      // so the game freezes visually and logically.
      const wasActive = activeRef.current === true && lastActive === true;
      lastActive = activeRef.current;
      if (wasActive && !lastActive) {
        // Entering pause — nothing to do, but avoid the grace below firing.
      } else if (!wasActive && lastActive) {
        // Resuming — grant a short grace so a cactus that happened to be
        // sitting on the dino when we paused doesn't insta-kill the run.
        if (s.status === 'running') s.grace = 45;
      }

      if (lastActive) step(dt);
      draw();

      const sc = Math.floor(s.score);
      if (sc !== lastScore) {
        lastScore = sc;
        setScore(sc);
      }
      if (s.status !== lastStatus) {
        lastStatus = s.status;
        setStatus(s.status);
      }
      if (Math.abs(s.shake - lastShake) > 0.4) {
        lastShake = s.shake;
        setShake(s.shake);
      }

      raf = requestAnimationFrame(loop);
    }
    let lastActive = activeRef.current;
    raf = requestAnimationFrame(loop);

    // ---------- input ----------
    function isInteractiveTarget(el: EventTarget | null): boolean {
      if (!el || !(el as HTMLElement).closest) return false;
      return !!(el as HTMLElement).closest(
        'button, a, input, textarea, select, [data-no-tap]',
      );
    }

    function onKeyDown(e: KeyboardEvent) {
      if (!activeRef.current) return;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        if (e.repeat) return;
        tap();
      }
    }
    function onPointerDown(e: PointerEvent) {
      if (!activeRef.current) return;
      // Don't treat taps on overlay controls (score HUD, mute, etc.) as jumps.
      if (isInteractiveTarget(e.target)) return;
      tap();
    }

    function onVisibility() {
      if (document.hidden) return;
      last = performance.now();
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-0 overflow-hidden">
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="absolute inset-0 w-full h-full"
        style={{ touchAction: 'none' }}
      />

      {/* Floating score / status HUD */}
      <div className="absolute top-4 right-4 select-none flex flex-col items-end gap-2">
        <div className="bg-white/70 backdrop-blur-md border border-slate-200/80 rounded-xl px-4 py-2.5 shadow-lg">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-violet-600 leading-none">
                Cactus Run
              </p>
              <p className="text-xl font-extrabold text-slate-900 tabular-nums leading-tight">
                {score}
              </p>
            </div>
            <div className="w-px h-8 bg-slate-300/70" />
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 leading-none">
                Best
              </p>
              <p className="text-sm font-extrabold text-slate-600 tabular-nums leading-tight">
                {best}
              </p>
            </div>
            <div className="w-px h-8 bg-slate-300/70" />
            <button
              type="button"
              onClick={toggleMute}
              data-no-tap
              className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 active:bg-slate-200 transition touch-manipulation"
              aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
              title={muted ? 'Unmute sounds' : 'Mute sounds'}
            >
              <SpeakerIcon muted={muted} />
            </button>
          </div>
        </div>

        {active && status === 'running' && (
          <div className="bg-white/80 backdrop-blur-md border border-violet-200 rounded-lg px-3 py-2 shadow-md">
            <p className="text-[11px] font-semibold text-violet-700">
              🌵 Tap when a ringed cactus is close to the dino
            </p>
          </div>
        )}
      </div>

      {shake > 8 && (
        <div
          className="pointer-events-none absolute inset-0 bg-rose-400/10"
          style={{ opacity: Math.min(0.35, shake / 40) }}
        />
      )}
    </div>
  );
}