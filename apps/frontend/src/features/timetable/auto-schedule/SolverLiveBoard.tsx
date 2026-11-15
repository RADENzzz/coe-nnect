import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import Icon from '../../../components/ui/Icon';
import { useMotionEnabled } from '../../../hooks/use-motion-enabled';
import { colorForSubject } from '../utils/color.util';
import { getGenerationProgressMessage } from './auto-generate.utils';

export interface SolverBlock {
  id: string;
  code: string;
  section?: string;
}

interface Props {
  /** True while another user in the department owns the solve. */
  serverSide: boolean;
  elapsedMs: number;
  blocks: SolverBlock[];
  scopeLabel?: string;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;
const SLOT_TIMES = [
  '07:30',
  '09:00',
  '10:30',
  '12:00',
  '13:30',
  '15:00',
  '16:30',
];
const ROWS = SLOT_TIMES.length;
const COLS = DAYS.length;
const CELL_COUNT = ROWS * COLS;

/** Percentages inside the board canvas. */
const GRID_TOP = 7;
const GRID_HEIGHT = 67;
const TRAY_TOP = 79;
const TRAY_HEIGHT = 21;

const FALLBACK_BLOCKS: SolverBlock[] = [
  { id: 'solver-cpe-111', code: 'CPE 111', section: 'BSCpE 1A' },
  { id: 'solver-cpe-112', code: 'CPE 112', section: 'BSCpE 1B' },
  { id: 'solver-math-101', code: 'MATH 101', section: 'BSCpE 1A' },
  { id: 'solver-phys-201', code: 'PHYS 201', section: 'BSCpE 2A' },
  { id: 'solver-chem-101', code: 'CHEM 101', section: 'BSCpE 1B' },
  { id: 'solver-cpe-211', code: 'CPE 211', section: 'BSCpE 2B' },
  { id: 'solver-ee-201', code: 'EE 201', section: 'BSCpE 2A' },
  { id: 'solver-ge-105', code: 'GE 105', section: 'BSCpE 1A' },
  { id: 'solver-me-101', code: 'ME 101', section: 'BSCpE 3A' },
  { id: 'solver-ce-201', code: 'CE 201', section: 'BSCpE 3B' },
];

type Slots = Record<string, number | null>;
type LogTone = 'check' | 'place' | 'move' | 'backtrack';

interface LogEntry {
  id: number;
  text: string;
  tone: LogTone;
}

interface SolverState {
  slots: Slots;
  checkingId: string | null;
  lastTarget: number | null;
  checks: number;
  moves: number;
  log: LogEntry[];
  nextLogId: number;
}

function slotLabel(slot: number): string {
  const day = DAYS[slot % COLS];
  const time = SLOT_TIMES[Math.floor(slot / COLS)];
  return `${day} ${time}`;
}

function slotStyle(slot: number): CSSProperties {
  const col = slot % COLS;
  const row = Math.floor(slot / COLS);
  return {
    left: `${col * (100 / COLS) + 0.8}%`,
    top: `${GRID_TOP + row * (GRID_HEIGHT / ROWS) + 1}%`,
    width: `${100 / COLS - 1.6}%`,
    height: `${GRID_HEIGHT / ROWS - 2}%`,
  };
}

function trayStyle(index: number, total: number): CSSProperties {
  const columns = Math.min(5, Math.max(total, 1));
  const rows = Math.max(1, Math.ceil(total / columns));
  const rowHeight = TRAY_HEIGHT / rows;
  const col = index % columns;
  const row = Math.floor(index / columns);
  return {
    left: `${col * (100 / columns) + 0.6}%`,
    top: `${TRAY_TOP + row * rowHeight + 1}%`,
    width: `${100 / columns - 1.2}%`,
    height: `${rowHeight - 2}%`,
  };
}

function nextFreeSlot(used: Set<number>): number {
  if (used.size >= CELL_COUNT) return 0;
  let slot = Math.floor(Math.random() * CELL_COUNT);
  let guard = 0;
  while (used.has(slot) && guard < CELL_COUNT * 2) {
    slot = (slot + 1) % CELL_COUNT;
    guard += 1;
  }
  return slot;
}

function createState(blocks: SolverBlock[], animate: boolean): SolverState {
  const slots: Slots = {};
  for (const block of blocks) slots[block.id] = null;

  // Reduced motion: show a complete-looking board instead of movement.
  const initialCount = animate ? Math.min(3, blocks.length) : blocks.length;
  const used = new Set<number>();
  for (let i = 0; i < initialCount; i += 1) {
    const slot = nextFreeSlot(used);
    used.add(slot);
    slots[blocks[i].id] = slot;
  }

  return {
    slots,
    checkingId: null,
    lastTarget: null,
    checks: 0,
    moves: animate ? initialCount : blocks.length,
    log: animate
      ? []
      : [
          {
            id: 0,
            text: 'Animation off — the solver is still working',
            tone: 'check',
          },
        ],
    nextLogId: 1,
  };
}

function withLog(
  state: SolverState,
  text: string,
  tone: LogTone,
): Pick<SolverState, 'log' | 'nextLogId'> {
  return {
    log: [{ id: state.nextLogId, text, tone }, ...state.log].slice(0, 4),
    nextLogId: state.nextLogId + 1,
  };
}

function advance(prev: SolverState, blocks: SolverBlock[]): SolverState {
  if (blocks.length === 0) return prev;

  // Phase 1 — inspect one block and leave a visible "checking" ring.
  if (!prev.checkingId) {
    const unplaced = blocks.filter((block) => prev.slots[block.id] == null);
    const pool =
      unplaced.length > 0 && Math.random() < 0.75 ? unplaced : blocks;
    const block = pool[Math.floor(Math.random() * pool.length)];
    if (!block) return prev;
    const slot = prev.slots[block.id];
    const text =
      slot == null
        ? `Scanning ${block.code} — looking for a slot`
        : `Checking ${block.code} · ${slotLabel(slot)} — room & faculty fit`;

    return {
      ...prev,
      checkingId: block.id,
      checks: prev.checks + 1,
      ...withLog(prev, text, 'check'),
    };
  }

  // Phase 2 — place, move, or backtrack the inspected block.
  const block = blocks.find((b) => b.id === prev.checkingId);
  if (!block) return { ...prev, checkingId: null };

  const slots = { ...prev.slots };
  const occupied = new Set<number>();
  for (const b of blocks) {
    const slot = slots[b.id];
    if (slot != null) occupied.add(slot);
  }
  const free: number[] = [];
  for (let slot = 0; slot < CELL_COUNT; slot += 1) {
    if (!occupied.has(slot)) free.push(slot);
  }

  const current = slots[block.id];
  const roll = Math.random();
  let target: number | null = null;
  let text: string;
  let tone: LogTone;

  if (current != null && roll < 0.22) {
    // Pull a placed block out of the board — the solver reconsidered.
    slots[block.id] = null;
    text = `Backtracked ${block.code} — constraint conflict`;
    tone = 'backtrack';
  } else if (free.length > 0) {
    const next = free[Math.floor(Math.random() * free.length)];
    slots[block.id] = next;
    target = next;
    if (current == null) {
      text = `Placed ${block.code} · ${slotLabel(next)}`;
      tone = 'place';
    } else {
      text = `Moved ${block.code} · ${slotLabel(next)}`;
      tone = 'move';
    }
  } else {
    text = `Kept ${block.code} · ${
      current != null ? slotLabel(current) : 'queued'
    }`;
    tone = 'check';
  }

  return {
    ...prev,
    slots,
    checkingId: null,
    lastTarget: target,
    moves: prev.moves + 1,
    ...withLog(prev, text, tone),
  };
}

function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}:${String(rest).padStart(2, '0')}` : `${rest}s`;
}

const LOG_TONE_CLASS: Record<LogTone, string> = {
  check: 'text-on-surface-variant',
  place: 'text-emerald-700',
  move: 'text-blue-700',
  backtrack: 'text-amber-700',
};

export default function SolverLiveBoard({
  serverSide,
  elapsedMs,
  blocks,
  scopeLabel,
}: Props) {
  const motionEnabled = useMotionEnabled();
  const pool = blocks.length > 0 ? blocks : FALLBACK_BLOCKS;
  const signature = useMemo(() => pool.map((b) => b.id).join('|'), [pool]);

  const [state, setState] = useState<SolverState>(() =>
    createState(pool, motionEnabled),
  );
  const [paused, setPaused] = useState(false);
  const [compact, setCompact] = useState(false);
  const signatureRef = useRef(signature);

  // The route wrapper keeps a transform after its entrance animation, which
  // would make `position: fixed` relative to the page instead of the viewport.
  // Portaling to <body> keeps the overlay truly full-screen.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // Rebuild the board if the subject list arrives after the overlay opens.
  useEffect(() => {
    if (signatureRef.current === signature) return;
    signatureRef.current = signature;
    setState(createState(pool, motionEnabled));
  }, [signature, pool, motionEnabled]);

  // Live-solving loop. It keeps running while the animation is hidden so the
  // counters stay honest when the user brings the board back.
  useEffect(() => {
    if (!motionEnabled || paused) return;
    let timer = 0;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      setState((prev) => advance(prev, pool));
      timer = window.setTimeout(tick, 540 + Math.random() * 420);
    };
    timer = window.setTimeout(tick, 520);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [motionEnabled, paused, pool]);

  const unplaced = pool.filter((block) => state.slots[block.id] == null);
  const trayIndex = new Map<string, number>();
  unplaced.forEach((block, index) => trayIndex.set(block.id, index));

  const placedCount = pool.length - unplaced.length;
  const latestLog = state.log[0];
  const progressInfo = serverSide
    ? { label: 'Another user is solving…', progress: 60 }
    : getGenerationProgressMessage(elapsedMs);
  const progress = progressInfo.progress;
  const statusLabel = paused
    ? 'Animation paused — the solver keeps running'
    : serverSide
      ? 'Waiting for the department solver…'
      : progressInfo.label;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/65 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Generating schedule"
    >
      <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl overflow-y-auto overscroll-contain rounded-2xl border border-outline-variant bg-surface shadow-2xl sm:max-h-[calc(100dvh-3rem)]">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-outline-variant bg-surface-container-low px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon name="auto_awesome" size={22} />
              {motionEnabled && !paused && (
                <span
                  aria-hidden
                  className="absolute inset-0 animate-ping-slow rounded-xl border border-primary/40"
                />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                Auto-generate
              </p>
              <h2 className="truncate text-lg font-bold text-on-surface">
                {serverSide
                  ? 'Department solver is running'
                  : 'Finding a schedule'}
              </h2>
              <p className="truncate text-xs text-on-surface-variant">
                {scopeLabel ?? 'Live constraint solving'}
              </p>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-2xl font-bold tabular-nums text-primary">
              {progress}%
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
              {serverSide ? 'waiting' : paused ? 'paused' : 'solving'}
            </p>
          </div>
        </div>

        <div className="px-4 py-4 sm:px-6">
          {compact ? (
            <div className="flex h-[250px] flex-col items-center justify-center gap-3 rounded-xl border border-outline-variant bg-surface-container-low/50 sm:h-[320px]">
              <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon name="hourglass_top" size={26} />
                {motionEnabled && !paused && (
                  <span
                    aria-hidden
                    className="absolute inset-0 animate-ping-slow rounded-full border border-primary/40"
                  />
                )}
              </div>
              <p className="text-sm font-semibold text-on-surface">
                Solving in the background
              </p>
              <p className="max-w-xs text-center text-xs leading-relaxed text-on-surface-variant">
                The animation is hidden. The solver is still placing blocks and
                this panel will update when it finishes.
              </p>
            </div>
          ) : (
            <div
              className="relative h-[250px] select-none sm:h-[320px]"
              aria-hidden="true"
            >
              {/* Day headings */}
              <div className="absolute inset-x-0 top-0 grid grid-cols-5">
                {DAYS.map((day) => (
                  <div
                    key={day}
                    className="text-center text-[9px] font-bold uppercase tracking-wider text-on-surface-variant sm:text-[10px]"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Empty timetable cells */}
              <div
                className="absolute inset-x-0 overflow-hidden rounded-xl border border-outline-variant bg-surface-container-low/40"
                style={{ top: `${GRID_TOP}%`, height: `${GRID_HEIGHT}%` }}
              >
                <div className="grid h-full w-full grid-cols-5 grid-rows-7">
                  {Array.from({ length: CELL_COUNT }, (_, index) => (
                    <div
                      key={index}
                      className="border-b border-r border-outline-variant/30 [&:nth-child(5n)]:border-r-0 [&:nth-last-child(-n+5)]:border-b-0"
                    />
                  ))}
                </div>
              </div>

              {/* Queue tray */}
              <div
                className="absolute inset-x-0 rounded-xl border border-dashed border-outline-variant bg-surface-container-low/40"
                style={{ top: `${TRAY_TOP}%`, height: `${TRAY_HEIGHT}%` }}
              >
                {unplaced.length === 0 ? (
                  <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold uppercase tracking-wider text-on-surface-variant/60">
                    All blocks placed
                  </span>
                ) : (
                  <span className="absolute left-2 top-1 text-[8px] font-bold uppercase tracking-wider text-on-surface-variant/70">
                    Queue · {unplaced.length}
                  </span>
                )}
              </div>

              {/* Last target slot */}
              {state.lastTarget != null && (
                <div
                  key={state.lastTarget}
                  className="absolute animate-solver-target rounded-md border-2 border-dashed border-primary/40 bg-primary/5"
                  style={slotStyle(state.lastTarget)}
                />
              )}

              {/* Subject blocks */}
              {pool.map((block) => {
                const slot = state.slots[block.id];
                const position =
                  slot == null
                    ? trayStyle(trayIndex.get(block.id) ?? 0, unplaced.length)
                    : slotStyle(slot);
                const isChecking = state.checkingId === block.id;
                const detail =
                  block.section ?? (slot != null ? slotLabel(slot) : 'queued');

                return (
                  <div
                    key={block.id}
                    className={clsx(
                      'absolute overflow-hidden rounded-md px-1 py-0.5 text-white shadow-sm will-change-[left,top,width,height]',
                      isChecking && 'z-20 animate-pulse ring-2 ring-amber-300',
                    )}
                    style={{
                      ...position,
                      backgroundColor: colorForSubject(block.id),
                      transition:
                        'left 520ms cubic-bezier(0.22,1,0.36,1), top 520ms cubic-bezier(0.22,1,0.36,1), width 420ms ease, height 420ms ease, box-shadow 200ms ease',
                      zIndex: isChecking ? 20 : 10,
                    }}
                  >
                    <p className="truncate text-[9px] font-bold leading-tight sm:text-[10px]">
                      {block.code}
                    </p>
                    <p className="truncate text-[7px] leading-tight text-white/70 sm:text-[8px]">
                      {detail}
                    </p>
                  </div>
                );
              })}

              {/* Solver scan line */}
              {motionEnabled && (
                <div
                  className="pointer-events-none absolute inset-x-0 overflow-hidden rounded-xl"
                  style={{ top: `${GRID_TOP}%`, height: `${GRID_HEIGHT}%` }}
                >
                  <div
                    className={clsx(
                      'absolute inset-y-0 w-px bg-gradient-to-b from-transparent via-primary/70 to-transparent',
                      !paused && 'animate-solver-scan',
                    )}
                    style={{ animationPlayState: paused ? 'paused' : 'running' }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Live counters */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              { label: 'Checks', value: state.checks },
              { label: 'Placed', value: `${placedCount}/${pool.length}` },
              { label: 'Moves', value: state.moves },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg border border-outline-variant bg-surface-container-low/50 px-2 py-1.5 text-center"
              >
                <p className="text-sm font-bold tabular-nums text-on-surface">
                  {stat.value}
                </p>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-on-surface-variant">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>

          {/* Status + log */}
          <div className="mt-3 rounded-xl border border-outline-variant bg-surface-container-low/60 px-3 py-2.5">
            <div className="flex items-center gap-2 text-xs">
              <span className="relative flex h-2 w-2 shrink-0">
                {motionEnabled && !paused && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/50" />
                )}
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              <span className="min-w-0 truncate font-semibold text-on-surface" aria-live="polite">
                {statusLabel}
              </span>
              <span className="ml-auto shrink-0 tabular-nums text-[10px] text-on-surface-variant">
                {formatElapsed(elapsedMs)}
              </span>
            </div>

            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-container-high">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="mt-2 flex items-center gap-2">
              <Icon
                name="terminal"
                size={13}
                className="shrink-0 text-primary"
              />
              <p
                key={latestLog?.id ?? 0}
                className={clsx(
                  'min-w-0 flex-1 truncate text-[11px]',
                  LOG_TONE_CLASS[latestLog?.tone ?? 'check'],
                )}
              >
                {latestLog?.text ?? 'Preparing solver…'}
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant pt-3">
            <p className="flex items-center gap-1.5 text-[11px] text-on-surface-variant">
              <Icon name="lock" size={13} />
              Navigation is locked until generation completes.
            </p>
            <div className="flex items-center gap-2">
              {motionEnabled && !compact && (
                <button
                  type="button"
                  onClick={() => setPaused((value) => !value)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-semibold text-on-surface-variant transition hover:bg-surface-container-high"
                >
                  <Icon name={paused ? 'play_arrow' : 'pause'} size={14} />
                  {paused ? 'Resume' : 'Pause'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setCompact((value) => !value)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-semibold text-on-surface-variant transition hover:bg-surface-container-high"
              >
                <Icon
                  name={compact ? 'visibility' : 'visibility_off'}
                  size={14}
                />
                {compact ? 'Show animation' : 'Hide animation'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
